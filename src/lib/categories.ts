export const CATEGORY_OPTIONS = [
  "rent",
  "dining out",
  "coffee/beverages",
  "bar/club",
  "takeout food",
  "airlines",
  "Shopping",
  "Entertainment",
  "MISC",
] as const;

export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

export function isValidCategory(value: string): value is CategoryOption {
  return CATEGORY_OPTIONS.includes(value as CategoryOption);
}
