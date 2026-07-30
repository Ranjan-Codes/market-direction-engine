"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addStock } from "./actions";

/* ── CSV parsing helpers ─────────────────────────────────────────────── */

const SYMBOL_HEADERS = [
  "symbol", "ticker", "epic", "tidm", "stock symbol",
  "instrument", "code", "security code", "stock",
];

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of line) {
    if (ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitRow(line: string, delim: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === delim && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function looksLikeTicker(v: string): boolean {
  return /^[A-Z][A-Z0-9.]{0,11}$/.test(v);
}

interface ParseResult {
  symbols: string[];
  detectedColumn: string;
  totalRows: number;
}

function parseCSV(text: string, inList: Set<string>): ParseResult {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { symbols: [], detectedColumn: "", totalRows: 0 };

  const delim = detectDelimiter(lines[0]);
  const headers = splitRow(lines[0], delim).map((h) => h.toLowerCase().trim());

  let symbolIdx = -1;
  let detectedColumn = "";
  for (const name of SYMBOL_HEADERS) {
    const idx = headers.indexOf(name);
    if (idx >= 0) { symbolIdx = idx; detectedColumn = headers[idx]; break; }
  }

  if (symbolIdx < 0) {
    for (let col = 0; col < headers.length; col++) {
      const vals = lines.slice(1, 6).map((l) => splitRow(l, delim)[col] ?? "");
      if (vals.filter((v) => looksLikeTicker(v.toUpperCase())).length >= Math.min(vals.length, 2)) {
        symbolIdx = col;
        detectedColumn = headers[col] || `column ${col + 1}`;
        break;
      }
    }
  }

  if (symbolIdx < 0) return { symbols: [], detectedColumn: "", totalRows: lines.length - 1 };

  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitRow(line, delim);
    const raw = (cols[symbolIdx] ?? "").toUpperCase().trim();
    if (!raw || seen.has(raw) || inList.has(raw)) continue;
    seen.add(raw);
    symbols.push(raw);
  }

  return { symbols, detectedColumn, totalRows: lines.length - 1 };
}

/* ── Broker info ─────────────────────────────────────────────────────── */

const BROKER_HELP: { name: string; steps: string }[] = [
  { name: "IG", steps: "Log in → My IG → Watchlists → click ⋯ → Download CSV" },
  { name: "Hargreaves Lansdown", steps: "Log in → My Accounts → Portfolio → Export (top-right)" },
  { name: "Trading 212", steps: "App → More → Statements → Export → choose CSV" },
  { name: "Interactive Brokers", steps: "Log in → Reports → Flex Queries → create a Trades or Positions query → run as CSV" },
  { name: "Fidelity", steps: "Log in → Accounts → Positions → Download" },
  { name: "Any broker", steps: "Download your portfolio or watchlist as a CSV file — most brokers have an Export button somewhere" },
];

/* ── Component ───────────────────────────────────────────────────────── */

type Phase = "idle" | "preview" | "importing" | "done";

interface ImportResult { symbol: string; ok: boolean; error?: string }

export function ImportPortfolio({ inList }: { inList: string[] }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [currentSymbol, setCurrentSymbol] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [showBrokerHelp, setShowBrokerHelp] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const router = useRouter();
  const listed = new Set(inList);

  const reset = () => {
    setPhase("idle");
    setParsed(null);
    setSelected(new Set());
    setProgress(0);
    setCurrentSymbol("");
    setResults([]);
    abortRef.current = false;
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a CSV file (ending in .csv)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = parseCSV(text, listed);
      setParsed(result);
      setSelected(new Set(result.symbols));
      setPhase("preview");
    };
    reader.readAsText(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const toggleSymbol = (s: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const startImport = async () => {
    const symbols = [...selected];
    if (symbols.length === 0) return;
    setPhase("importing");
    setProgress(0);
    setResults([]);
    abortRef.current = false;

    const importResults: ImportResult[] = [];
    for (let i = 0; i < symbols.length; i++) {
      if (abortRef.current) break;
      const sym = symbols[i];
      setCurrentSymbol(sym);
      setProgress(i);
      try {
        const r = await addStock(sym);
        importResults.push({ symbol: sym, ok: r.ok, error: r.error });
      } catch {
        importResults.push({ symbol: sym, ok: false, error: "Unexpected error" });
      }
      setResults([...importResults]);
    }
    setProgress(symbols.length);
    setCurrentSymbol("");
    setPhase("done");
    router.refresh();
  };

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Import from broker (CSV)
      </button>
    );
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Import portfolio from broker</span>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-2">Upload a CSV exported from your broker</span>
        </div>
        <button onClick={() => { reset(); setOpen(false); }} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
          close
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Idle: file upload */}
        {phase === "idle" && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg px-6 py-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-sky-400 bg-sky-50/50 dark:bg-sky-950/20"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
              }`}
            >
              <div className="text-2xl mb-1">📁</div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Drop your CSV file here, or <span className="font-medium text-sky-600 dark:text-sky-400">click to browse</span>
              </p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                Works with any broker — we automatically detect the stock symbols
              </p>
              <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} className="hidden" />
            </div>

            <button
              onClick={() => setShowBrokerHelp(!showBrokerHelp)}
              className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {showBrokerHelp ? "Hide" : "How do I get a CSV from my broker?"}
            </button>
            {showBrokerHelp && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {BROKER_HELP.map((b) => (
                  <div key={b.name} className="border border-zinc-100 dark:border-zinc-800 rounded-md px-3 py-2">
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200">{b.name}</div>
                    <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">{b.steps}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Preview: show detected symbols */}
        {phase === "preview" && parsed && (
          <>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              Found <b>{parsed.symbols.length}</b> new stock{parsed.symbols.length !== 1 ? "s" : ""} in {parsed.totalRows} rows
              {parsed.detectedColumn && <> (from the <b>{parsed.detectedColumn}</b> column)</>}.
              {inList.length > 0 && <> Stocks already on your watchlist are skipped.</>}
            </div>

            {parsed.symbols.length === 0 ? (
              <div className="text-sm text-zinc-500 dark:text-zinc-400 py-4 text-center">
                No new symbols found. They may already be in your watchlist, or the file format was not recognised.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {parsed.symbols.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSymbol(s)}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                        selected.has(s)
                          ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-700"
                          : "bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700 line-through"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                  <button onClick={() => setSelected(new Set(parsed.symbols))} className="hover:text-zinc-700 dark:hover:text-zinc-300 underline">select all</button>
                  <span>·</span>
                  <button onClick={() => setSelected(new Set())} className="hover:text-zinc-700 dark:hover:text-zinc-300 underline">deselect all</button>
                  <span>·</span>
                  <span>{selected.size} selected</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={startImport}
                    disabled={selected.size === 0}
                    className="text-sm font-medium px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Import {selected.size} stock{selected.size !== 1 ? "s" : ""}
                  </button>
                  <button onClick={reset} className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 px-3">
                    Cancel
                  </button>
                </div>

                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Each stock needs its full price history fetched — this may take a few seconds per new stock. Stocks already in our database are instant.
                </p>
              </>
            )}
          </>
        )}

        {/* Importing: progress */}
        {phase === "importing" && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span>
                  Adding <b>{currentSymbol}</b> ({progress + 1} of {selected.size})
                  {progress > 0 && <> — fetching price history and computing signals…</>}
                </span>
                <span className="tabular-nums">{Math.round((progress / selected.size) * 100)}%</span>
              </div>
              <div className="h-2 bg-zinc-200/60 dark:bg-zinc-700/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progress / selected.size) * 100}%` }}
                />
              </div>
            </div>

            {results.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {results.map((r) => (
                  <span key={r.symbol} className={`text-[10px] px-1.5 py-px rounded ${
                    r.ok
                      ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  }`}>
                    {r.symbol} {r.ok ? "✓" : "✗"}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={() => { abortRef.current = true; }}
              className="text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
            >
              Stop importing
            </button>
          </>
        )}

        {/* Done: summary */}
        {phase === "done" && (
          <>
            <div className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">
              Import complete
            </div>
            <div className="flex items-center gap-3 text-xs">
              {successCount > 0 && (
                <span className="text-emerald-700 dark:text-emerald-400">
                  {successCount} added successfully
                </span>
              )}
              {failCount > 0 && (
                <span className="text-red-700 dark:text-red-400">
                  {failCount} could not be added
                </span>
              )}
            </div>

            {failCount > 0 && (
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5">
                {results.filter((r) => !r.ok).map((r) => (
                  <div key={r.symbol}>
                    <b>{r.symbol}</b>: {r.error ?? "unknown error"}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={reset}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-1"
              >
                Import more
              </button>
              <button
                onClick={() => { reset(); setOpen(false); }}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
