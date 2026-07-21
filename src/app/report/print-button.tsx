"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-3 py-1 border border-zinc-600 rounded text-xs hover:bg-zinc-800 print:hidden"
    >
      Print / save as PDF
    </button>
  );
}
