"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWatchlist } from "./actions";

export interface SymbolOption {
  symbol: string;
  name: string | null;
  index_symbol: string | null;
}

export function AddStock({
  options,
  inList,
}: {
  options: SymbolOption[];
  inList: string[];
}) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const listed = useMemo(() => new Set(inList), [inList]);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q.length < 1) return [];
    return options
      .filter(
        (o) =>
          !listed.has(o.symbol) &&
          (o.symbol.toUpperCase().startsWith(q) ||
            (o.name ?? "").toUpperCase().includes(q)),
      )
      .slice(0, 8);
  }, [query, options, listed]);

  const add = (symbol: string) => {
    startTransition(async () => {
      await toggleWatchlist(symbol);
      setQuery("");
      router.refresh();
    });
  };

  return (
    <div className="relative max-w-md">
      <input
        type="text"
        value={query}
        disabled={pending}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add a stock — type a ticker or company name…"
        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500"
      />
      {matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-zinc-300 rounded-lg shadow-lg overflow-hidden">
          {matches.map((m) => (
            <li key={m.symbol}>
              <button
                onClick={() => add(m.symbol)}
                disabled={pending}
                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 flex justify-between gap-2"
              >
                <span>
                  <span className="font-semibold">{m.symbol}</span>{" "}
                  <span className="text-zinc-500">{m.name}</span>
                </span>
                <span className="text-xs text-zinc-400 shrink-0">{m.index_symbol} · + add</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length > 0 && matches.length === 0 && (
        <p className="absolute z-20 mt-1 w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-xs text-zinc-500">
          No match — the universe is S&amp;P 500, Nasdaq-100 and FTSE 100 members (UK tickers end in .L).
        </p>
      )}
    </div>
  );
}
