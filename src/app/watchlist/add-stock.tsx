"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchStocks, addStock, type StockMatch } from "./actions";

export function AddStock({ inList }: { inList: string[] }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<StockMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listed = new Set(inList);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    timer.current = setTimeout(
      async () => {
        if (q.length < 1) {
          setMatches([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          const found = await searchStocks(q);
          setMatches(found.filter((m) => !listed.has(m.symbol)));
        } finally {
          setSearching(false);
        }
      },
      q.length < 1 ? 0 : 300,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const add = (m: StockMatch) => {
    setAdding(m.symbol);
    setError(null);
    startTransition(async () => {
      const r = await addStock(m.symbol);
      setAdding(null);
      if (!r.ok) {
        setError(r.error ?? "Could not add this stock.");
        return;
      }
      setQuery("");
      setMatches([]);
      router.refresh();
    });
  };

  return (
    <div className="relative max-w-xl">
      <input
        type="text"
        value={query}
        disabled={pending}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add any stock — ticker or company name (any exchange)…"
        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500"
      />
      {adding && (
        <p className="absolute z-20 mt-1 w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-600">
          Adding <b>{adding}</b> — fetching its full price history and computing indicators…
        </p>
      )}
      {error && !adding && (
        <p className="mt-1 text-xs text-red-700">{error}</p>
      )}
      {!adding && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-zinc-300 rounded-lg shadow-lg overflow-hidden">
          {matches.map((m) => (
            <li key={m.symbol}>
              <button
                onClick={() => add(m)}
                disabled={pending}
                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 flex justify-between gap-2"
              >
                <span>
                  <span className="font-semibold">{m.symbol}</span>{" "}
                  <span className="text-zinc-500">{m.name}</span>
                </span>
                <span className="text-xs text-zinc-400 shrink-0">
                  {m.source === "universe" ? m.detail : `Yahoo · ${m.detail}`} · + add
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!adding && !searching && query.trim().length >= 2 && matches.length === 0 && (
        <p className="absolute z-20 mt-1 w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-xs text-zinc-500">
          No match found on any exchange — check the spelling or try the ticker.
        </p>
      )}
    </div>
  );
}
