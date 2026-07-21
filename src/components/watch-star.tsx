"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWatchlist } from "../app/watchlist/actions";

export function WatchStar({ symbol, inList }: { symbol: string; inList: boolean }) {
  const [optimistic, setOptimistic] = useState(inList);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      title={optimistic ? "Remove from watchlist" : "Add to watchlist"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          const r = await toggleWatchlist(symbol);
          setOptimistic(r.inList);
          router.refresh();
        })
      }
      className={`text-sm leading-none ${optimistic ? "text-amber-400" : "text-zinc-600 hover:text-zinc-300"}`}
    >
      {optimistic ? "★" : "☆"}
    </button>
  );
}
