import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
        <nav className="border-b border-black/10 dark:border-white/10 px-6 py-4 flex gap-6 items-center">
          <Link href="/" className="font-semibold">Budget</Link>
          <Link href="/" className="text-sm hover:underline">Dashboard</Link>
          <Link href="/import" className="text-sm hover:underline">Import</Link>
          <Link href="/categorize" className="text-sm hover:underline">Categorize</Link>
          <Link href="/reconcile" className="text-sm hover:underline">Splitwise Reconcile</Link>
          <Link href="/db" className="text-sm hover:underline">Database</Link>
        </nav>
        <main className="flex-1 p-6 max-w-5xl w-full mx-auto">{children}</main>
      </body>
    </html>
  );
}
