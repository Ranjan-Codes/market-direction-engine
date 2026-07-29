import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Market Direction Engine",
  description: "Directional market view, 2–6 week horizon — decision support only",
};

const NAV = [
  ["/", "Today"],
  ["/watchlist", "Watchlist"],
  ["/screener", "Stocks"],
  ["/calendar", "Calendar"],
  ["/guide", "Guide"],
  ["/more", "More"],
] as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-100 text-zinc-900 font-sans">
        <nav className="flex items-center gap-1 px-4 py-2.5 border-b border-zinc-200 bg-white sticky top-0 z-10 shadow-sm">
          <span className="font-bold text-sm mr-4 tracking-tight text-zinc-900">Market Direction Engine</span>
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-4 max-w-[1500px] w-full mx-auto">{children}</main>
        <footer className="px-4 py-2.5 border-t border-zinc-200 text-[11px] text-zinc-500 bg-white">
          Analytical decision-support only — not investment advice, no order execution. All outputs are
          probabilistic and may be wrong; verify independently before acting. Data from free public
          sources; may be delayed or incomplete.
        </footer>
      </body>
    </html>
  );
}
