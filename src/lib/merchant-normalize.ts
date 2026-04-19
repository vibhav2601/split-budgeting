// Strip noise from merchant strings: "TACO BELL #1234 SAN FRANCISCO CA" -> "taco bell"
export function normalizeMerchant(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase();
  s = s.replace(/[#*]\s*\d+/g, " ");
  s = s.replace(/\b\d{3,}\b/g, " ");
  s = s.replace(/\b(inc|llc|co|corp|ltd)\b/g, " ");
  s = s.replace(/\s+[a-z]{2}\s*$/i, " ");
  s = s.replace(/[^a-z0-9\s&'-]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const tokens = s.split(" ").filter((t) => t.length > 1);
  return tokens.slice(0, 3).join(" ");
}
