import Link from "next/link";

/** Shared sizing + border for reconcile / merge icon buttons in tables */
export const txnActionIconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-black/10 text-current hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10";

export function ReconcileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 9v1a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v1" />
      <path d="M6 21v-4a4 4 0 0 1 4-4h4" />
    </svg>
  );
}

export function ReimbursementIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 7h4v4" />
      <path d="M21 7l-6 6" />
      <path d="M7 17H3v-4" />
      <path d="M3 17l6-6" />
      <path d="M14 7H7a4 4 0 0 0-4 4" />
      <path d="M10 17h7a4 4 0 0 0 4-4" />
    </svg>
  );
}

/** Opens merge-with-Splitwise modal — distinct from navigate-to-reconcile */
export function MergeModalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

export function ReconcileTxnLink({
  transactionId,
  title = "Splitwise reconcile",
  ariaLabel = "Splitwise reconcile this transaction",
  className,
}: {
  transactionId: number;
  title?: string;
  ariaLabel?: string;
  /** Appended after `txnActionIconButtonClass` */
  className?: string;
}) {
  return (
    <Link
      href={`/reconcile?txn_id=${transactionId}`}
      className={`${txnActionIconButtonClass}${className ? ` ${className}` : ""}`}
      title={title}
      aria-label={ariaLabel}
    >
      <ReconcileIcon className="size-[1.125rem] shrink-0" />
    </Link>
  );
}

export function ReimbursementTxnLink({
  transactionId,
  title = "Merge Venmo reimbursements",
  ariaLabel = "Merge received Venmo reimbursements into this charge",
  className,
}: {
  transactionId: number;
  title?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/reimbursements/search?credit_card_txn_id=${transactionId}`}
      className={`${txnActionIconButtonClass}${className ? ` ${className}` : ""}`}
      title={title}
      aria-label={ariaLabel}
    >
      <ReimbursementIcon className="size-[1.125rem] shrink-0" />
    </Link>
  );
}

export function SplitwiseSearchTxnLink({
  transactionId,
  title = "Find matching credit card transaction",
  ariaLabel = "Find matching credit card transaction for this Splitwise row",
  className,
}: {
  transactionId: number;
  title?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/reconcile/search?splitwise_txn_id=${transactionId}`}
      className={`${txnActionIconButtonClass}${className ? ` ${className}` : ""}`}
      title={title}
      aria-label={ariaLabel}
    >
      <MergeModalIcon className="size-[1.125rem] shrink-0" />
    </Link>
  );
}
