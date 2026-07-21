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
  ["/", "Regime"],
  ["/watchlist", "Watchlist"],
  ["/screener", "Screener"],
  ["/calendar", "Calendar"],
  ["/narrative", "Narrative"],
  ["/backtest", "Backtest"],
  ["/report", "Report"],
  ["/guide", "Guide"],
  ["/settings", "Settings"],
] as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans">
        <nav className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900 sticky top-0 z-10">
          <span className="font-bold text-sm mr-4 text-zinc-100">Market Direction Engine</span>
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="px-2.5 py-1 rounded text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-4 max-w-[1500px] w-full mx-auto">{children}</main>
        <footer className="px-4 py-2 border-t border-zinc-800 text-[11px] text-zinc-500 bg-zinc-900">
          Analytical decision-support only — not investment advice, no order execution. All outputs are
          probabilistic and may be wrong; verify independently before acting. Data from free public
          sources; may be delayed or incomplete.
        </footer>
      </body>
    </html>
  );
}
