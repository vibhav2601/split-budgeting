"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const monthIndex = parseInt(month, 10) - 1;
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

export default function MonthSwitcher({
  months,
  current,
  totalSpend,
}: {
  months: string[];
  current: string;
  totalSpend?: number;
}) {
  const router = useRouter();
  const currentIndex = months.indexOf(current);
  const prevMonth = currentIndex < months.length - 1 ? months[currentIndex + 1] : null;
  const nextMonth = currentIndex > 0 ? months[currentIndex - 1] : null;

  function navigate(month: string) {
    router.push(`/?month=${month}`);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => prevMonth && navigate(prevMonth)}
          disabled={!prevMonth}
          aria-label="Previous month"
          className="size-8"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="relative">
          <select
            value={current}
            onChange={(e) => navigate(e.target.value)}
            className="appearance-none bg-transparent text-base font-medium tracking-tight cursor-pointer pr-5 focus:outline-none"
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(month)}
              </option>
            ))}
          </select>
          <ChevronRight className="size-3.5 text-muted-foreground absolute right-0 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => nextMonth && navigate(nextMonth)}
          disabled={!nextMonth}
          aria-label="Next month"
          className="size-8"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {totalSpend !== undefined && (
        <span className="text-base font-mono tabular-nums font-medium text-muted-foreground">
          ${totalSpend.toFixed(2)} total
        </span>
      )}
    </div>
  );
}
