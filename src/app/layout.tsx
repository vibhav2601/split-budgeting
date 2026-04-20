import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import NavLinks from "./components/nav-links";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget Reconciler",
  description: "Splitwise reconcile credit card, Venmo, and Splitwise into true personal spend.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col font-sans">
        <header className="border-b border-[var(--border)] sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
            <Link
              href="/"
              className="font-semibold tracking-tight text-foreground shrink-0"
            >
              Budget
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
