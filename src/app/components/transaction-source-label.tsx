import { getSplitwiseExpenseUrl } from "@/lib/splitwise-url";
import type { Transaction } from "@/lib/types";

function sourceLabel(source: Transaction["source"]): string {
  return source.replaceAll("_", " ");
}

export default function TransactionSourceLabel({
  transaction,
  className,
}: {
  transaction: Transaction;
  className?: string;
}) {
  const label = sourceLabel(transaction.source);
  const splitwiseUrl = getSplitwiseExpenseUrl(transaction);

  if (!splitwiseUrl) {
    return <span className={className}>{label}</span>;
  }

  return (
    <a
      href={splitwiseUrl}
      target="_blank"
      rel="noreferrer noopener"
      title="Open this Splitwise expense"
      className={className ? `${className} underline underline-offset-2` : "underline underline-offset-2"}
    >
      {label}
    </a>
  );
}
