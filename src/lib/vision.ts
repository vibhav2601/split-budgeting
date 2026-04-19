import OpenAI from "openai";
import { z } from "zod";
import { CATEGORY_OPTIONS } from "./categories";

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

const ExtractedReceiptSchema = z.object({
  merchant: z.string(),
  date: z.string(),
  total: z.number(),
  currency: z.string().default("USD"),
  line_items: z
    .array(z.object({ name: z.string(), amount: z.number() }))
    .optional(),
  source_hint: z.enum(["credit_card", "venmo", "splitwise", "receipt"]).optional(),
});

export type ExtractedReceipt = z.infer<typeof ExtractedReceiptSchema>;

function client(): OpenAI {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY not set in .env.local");
  return new OpenAI({ apiKey: k });
}

const VISION_SYSTEM = `You extract structured transaction data from receipt, credit card statement, Venmo, or Splitwise screenshots.

Return ONLY a JSON object with this shape:
{
  "merchant": string,         // e.g. "Taco Bell"
  "date": string,             // ISO date YYYY-MM-DD
  "total": number,            // total amount charged, positive
  "currency": string,         // ISO code, default USD
  "line_items": [{"name": string, "amount": number}],  // optional
  "source_hint": "credit_card" | "venmo" | "splitwise" | "receipt"
}

If multiple transactions are visible, return the largest/primary one.`;

export async function extractReceiptFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
): Promise<ExtractedReceipt> {
  const res = await client().chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: VISION_SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${imageBase64}` },
          },
          { type: "text", text: "Extract the transaction as JSON." },
        ],
      },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "";
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`Could not parse JSON from model response: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  return ExtractedReceiptSchema.parse(parsed);
}

const MERCHANT_MATCH_SYSTEM = `You judge whether a vague Splitwise expense description and a specific credit card / Venmo merchant refer to the same real-world transaction.

Respond with ONLY a JSON object of the form { "results": [...] } where each element, in input order, is:
{"match": boolean, "confidence": 0.0-1.0, "reason": string}

Examples:
- "dinner" vs "TACO BELL #1234" -> match=true (dinner could be tacos)
- "groceries" vs "WHOLE FOODS" -> match=true
- "uber" vs "LYFT" -> match=false (different company)
- "rent" vs "AMC THEATRES" -> match=false`;

export async function judgeMerchantMatches(
  pairs: Array<{ splitwise_desc: string; other_merchant: string }>,
): Promise<Array<{ match: boolean; confidence: number; reason: string }>> {
  if (pairs.length === 0) return [];
  const userMsg = pairs
    .map(
      (p, i) =>
        `${i + 1}. Splitwise: "${p.splitwise_desc}"  |  Merchant: "${p.other_merchant}"`,
    )
    .join("\n");
  const res = await client().chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: MERCHANT_MATCH_SYSTEM },
      { role: "user", content: userMsg },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "";
  const fallback = () =>
    pairs.map(() => ({ match: false, confidence: 0, reason: "parse-failed" }));
  try {
    const obj = JSON.parse(text);
    const arr = Array.isArray(obj) ? obj : obj.results;
    if (!Array.isArray(arr)) return fallback();
    return pairs.map(
      (_, i) => arr[i] ?? { match: false, confidence: 0, reason: "missing" },
    );
  } catch {
    return fallback();
  }
}

const CategorizationResultSchema = z.object({
  transaction_id: z.number(),
  category: z.enum(CATEGORY_OPTIONS),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

const CategorizationResponseSchema = z.object({
  results: z.array(CategorizationResultSchema),
});

const CATEGORIZATION_SYSTEM = `You assign budgeting categories to transactions.

Choose exactly one category from this fixed list and never invent a new label:
${CATEGORY_OPTIONS.join(", ")}

Category definitions:
- "rent": rent payments, housing costs, renters or home insurance, electricity, water, gas, and home utility bills.
- "dining out": sit-down restaurants, restaurants with table service, brunch, dinner, lunch out.
- "coffee/beverages": coffee shops, cafes, tea, boba, juice, smoothies, standalone drinks, pastries from beverage shops.
- "bar/club": bars, clubs, nightlife venues, alcohol-led venues, cover charges, bottle service, liquor stores, wine shops, breweries, and alcohol purchases.
- "takeout food": delivery apps, pickup orders, fast casual takeaway, food trucks, counter-service meals primarily bought to-go.
- "groceries": supermarkets, grocery stores, produce markets, Costco-style food shopping, and pantry staples bought for home.
- "airlines": airline tickets, airline bag fees, seat fees, airline-operated charges.
- "UBERs": Uber rides, Lyft rides, taxis, cabs, and ride-share trips.
- "shopping": retail purchases, clothing, electronics, home goods, gifts, online shopping marketplaces.
- "entertainment": movies, concerts, shows, museums, tickets, events, games, leisure activities.
- "MISC": everything else, including transfers, Splitwise settlements, fees, and anything ambiguous.

Decision rules:
- Return exactly one category per transaction.
- Prefer the most specific category available, otherwise use "MISC".
- Use "rent" for insurance, electricity, water, gas, and home utility/housing-related charges even if they are not literal rent.
- If a merchant is primarily known for coffee, tea, boba, juice, or drinks, use "coffee/beverages".
- If a merchant is clearly a restaurant, decide between "dining out" and "takeout food" based on wording:
  - use "takeout food" for delivery, pickup, takeout, eats, kitchen, order apps, and clearly to-go contexts
  - use "dining out" for restaurants, cafes used as meal venues, and normal dine-in contexts
- Use "groceries" for supermarkets and home food shopping, not for restaurants or coffee shops.
- Use "UBERs" for ride-share trips and taxi transport, but not for Uber Eats or other food delivery.
- Use "bar/club" for liquor-related purchases, alcohol merchants, bars, clubs, and nightlife. If a charge is clearly for liquor or alcohol, do not use "shopping" or "dining out".
- If a venue is both food and nightlife, choose "bar/club" when alcohol/nightlife is the stronger signal.
- Do not map anything to old categories such as transport, travel, fees, general, or bills. Those collapse to "MISC", except ride-share trips which should be "UBERs", groceries which should be "groceries", and housing/utilities/insurance which should be "rent".
- "shopping" is only for retail or goods, not food/drinks/tickets.
- "entertainment" is only for leisure or event spending, not nightlife drinking unless the venue is clearly a bar/club.
- When uncertain, bias toward "MISC" instead of overfitting.
- Keep the reason short and concrete.

Respond with ONLY a JSON object of the form:
{
  "results": [
    {
      "transaction_id": number,
      "category": string,
      "reason": string,
      "confidence": number
    }
  ]
}`;

export async function suggestTransactionCategories(
  transactions: Array<{
    id: number;
    source: string;
    date: string;
    merchant_raw: string;
    description: string | null;
    amount_total: number;
    amount_my_share: number;
    currency: string;
  }>,
): Promise<
  Array<{
    transaction_id: number;
    category: (typeof CATEGORY_OPTIONS)[number];
    reason: string;
    confidence: number;
  }>
> {
  if (transactions.length === 0) return [];
  const prompt = JSON.stringify(
    {
      categories: CATEGORY_OPTIONS,
      transactions,
    },
    null,
    2,
  );
  const res = await client().chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.1,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CATEGORIZATION_SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(text);
  const body = CategorizationResponseSchema.parse(parsed);
  const byId = new Map(body.results.map((row) => [row.transaction_id, row]));
  return transactions
    .map((txn) => byId.get(txn.id))
    .filter((row): row is z.infer<typeof CategorizationResultSchema> => Boolean(row))
    .map((row) => ({
      transaction_id: row.transaction_id,
      category: row.category,
      reason: row.reason,
      confidence: row.confidence,
    }));
}
