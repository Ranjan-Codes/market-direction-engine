"use client";

import { useState } from "react";

export function Collapsible({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 group w-full text-left"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`text-zinc-400 dark:text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
          {title}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
