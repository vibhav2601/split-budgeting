// Deterministic color chip for categories
const CATEGORY_COLORS = [
  "#94a3b8", // slate
  "#86a693", // sage
  "#c4a882", // sand
  "#c49a9a", // blush
  "#9b9eca", // lavender
  "#7eb8ca", // sky
  "#c4a84a", // amber
  "#c48a9a", // rose
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[hashString(category) % CATEGORY_COLORS.length];
}

export function CategoryDot({ category }: { category: string }) {
  const color = getCategoryColor(category);
  return (
    <span
      className="inline-block size-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

export function CategoryChip({ category }: { category: string }) {
  const color = getCategoryColor(category);
  const initials = category
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className="inline-flex items-center justify-center size-5 rounded text-[10px] font-semibold shrink-0 text-white"
      style={{ backgroundColor: color }}
      title={category}
      aria-hidden
    >
      {initials}
    </span>
  );
}
