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

Choose exactly one category from this fixed list:
${CATEGORY_OPTIONS.join(", ")}

Rules:
- Return exactly one category per transaction.
- Prefer the most specific category available.
- Use "bar/club" for nightlife, alcohol-forward venues, and clubs.
- Use "coffee/beverages" for coffee shops, cafes, boba, juice, and standalone drinks.
- Use "takeout food" for delivery apps, pickup, and quick takeaway meals.
- Use "dining out" for sit-down restaurants and on-premise meals.
- Use "airlines" for flight tickets, airline fees, and airline-operated services.
- Use "MISC" only when none of the other categories fit clearly.

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
