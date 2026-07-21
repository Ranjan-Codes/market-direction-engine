"use server";

import { revalidatePath } from "next/cache";
import { getPool } from "../../lib/db";

export async function toggleWatchlist(symbol: string): Promise<{ inList: boolean }> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select i.id, w.id as item_id
       from instruments i
       left join watchlist_items w on w.instrument_id = i.id
      where i.symbol = $1`,
    [symbol],
  );
  if (rows.length === 0) return { inList: false };
  let inList: boolean;
  if (rows[0].item_id != null) {
    await pool.query(`delete from watchlist_items where id = $1`, [rows[0].item_id]);
    inList = false;
  } else {
    await pool.query(
      `insert into watchlist_items (instrument_id) values ($1) on conflict do nothing`,
      [rows[0].id],
    );
    inList = true;
  }
  revalidatePath("/watchlist");
  revalidatePath("/screener");
  return { inList };
}
