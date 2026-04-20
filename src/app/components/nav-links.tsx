"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Import", href: "/import" },
  { label: "Categorize", href: "/categorize" },
  { label: "Reconcile", href: "/reconcile" },
  { label: "Reimbursements", href: "/reimbursements/search" },
  { label: "Database", href: "/db" },
];

export default function NavLinks() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "px-2.5 py-1.5 text-[13px] rounded-md transition-colors",
            isActive(item.href)
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/70",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
