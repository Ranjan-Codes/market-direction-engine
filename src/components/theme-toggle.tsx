"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === "dark" || (!stored && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      aria-label="Toggle dark mode"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={dark ? "hidden" : ""}>
        <path d="M8 1v1m0 12v1m7-7h-1M2 8H1m12.07-4.07-.71.71M3.64 12.36l-.71.71m10.14 0-.71-.71M3.64 3.64l-.71-.71M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={dark ? "" : "hidden"}>
        <path d="M14 9.68A6.5 6.5 0 0 1 6.32 2 6.5 6.5 0 1 0 14 9.68Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}
