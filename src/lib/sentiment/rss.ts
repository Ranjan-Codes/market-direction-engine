import * as cheerio from "cheerio";
import { fetchWithRetry } from "../http";
import type { RssFeedConfig } from "../../config/feeds";

/**
 * Minimal RSS/Atom headline fetcher. Headlines + summaries + metadata only;
 * bodies are never fetched (robots/licensing guardrail).
 */

export interface Headline {
  feedKey: string;
  country: "US" | "UK" | "GLOBAL";
  official: boolean;
  title: string;
  summary: string;
  url: string;
  publishedAt: string; // ISO
}

export async function fetchFeed(feed: RssFeedConfig): Promise<Headline[]> {
  const res = await fetchWithRetry(feed.url, { retries: 2 });
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: Headline[] = [];

  const push = (title: string, summary: string, url: string, dateStr: string) => {
    const t = title.trim();
    if (!t) return;
    const d = new Date(dateStr);
    out.push({
      feedKey: feed.key,
      country: feed.country,
      official: feed.official ?? false,
      title: t,
      summary: summary.replace(/<[^>]+>/g, "").trim().slice(0, 500),
      url: url.trim(),
      publishedAt: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
    });
  };

  $("item").each((_, el) => {
    const $el = $(el);
    push(
      $el.find("title").first().text(),
      $el.find("description").first().text(),
      $el.find("link").first().text() || $el.find("guid").first().text(),
      $el.find("pubDate").first().text() || $el.find("dc\\:date").first().text(),
    );
  });
  // Atom fallback
  if (out.length === 0) {
    $("entry").each((_, el) => {
      const $el = $(el);
      push(
        $el.find("title").first().text(),
        $el.find("summary").first().text() || $el.find("content").first().text(),
        $el.find("link").first().attr("href") ?? "",
        $el.find("updated").first().text() || $el.find("published").first().text(),
      );
    });
  }
  return out;
}
