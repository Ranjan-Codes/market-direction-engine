"""FinBERT sentiment scoring for unscored headline rows.

Runs in GitHub Actions (CPU). Pulls sentiment_readings rows with source in
('rss','reddit') and score IS NULL, scores headline+summary with ProsusAI/
finbert, and writes back score in [-1, +1] (positive - negative probability)
plus model_version. Batched; safe to re-run (idempotent on scored rows).

Env: SUPABASE_DB_URL (with [YOUR-PASSWORD] placeholder), SUPABASE_DB_PASSWORD.
"""

import json
import os
import sys
import urllib.parse

import psycopg
from transformers import pipeline

MODEL = "ProsusAI/finbert"
MODEL_VERSION = "finbert@ProsusAI/finbert"
BATCH = 64
MAX_ROWS = 2000  # per run; backlog drains across runs


def connection_string() -> str:
    url = os.environ["SUPABASE_DB_URL"]
    password = urllib.parse.quote(os.environ.get("SUPABASE_DB_PASSWORD", ""), safe="")
    return url.replace("[YOUR-PASSWORD]", password)


def main() -> int:
    with psycopg.connect(connection_string()) as conn:
        rows = conn.execute(
            """
            select id, detail->>'headline' as headline, detail->>'summary' as summary
              from sentiment_readings
             where source in ('rss','reddit') and score is null
               and detail->>'headline' is not null
             order by reading_at desc
             limit %s
            """,
            (MAX_ROWS,),
        ).fetchall()
        if not rows:
            print("no unscored headlines")
            return 0

        print(f"scoring {len(rows)} headlines with {MODEL} ...")
        clf = pipeline("text-classification", model=MODEL, top_k=None, truncation=True)

        scored = 0
        for start in range(0, len(rows), BATCH):
            chunk = rows[start : start + BATCH]
            texts = [
                f"{r[1] or ''}. {(r[2] or '')[:300]}".strip(". ") for r in chunk
            ]
            results = clf(texts, batch_size=16)
            for (row_id, _h, _s), probs in zip(chunk, results):
                by_label = {p["label"].lower(): p["score"] for p in probs}
                score = by_label.get("positive", 0.0) - by_label.get("negative", 0.0)
                conn.execute(
                    """
                    update sentiment_readings
                       set score = %s, model_version = %s,
                           detail = detail || %s::jsonb
                     where id = %s
                    """,
                    (
                        round(score, 4),
                        MODEL_VERSION,
                        json.dumps({"finbert": {k: round(v, 4) for k, v in by_label.items()}}),
                        row_id,
                    ),
                )
                scored += 1
            conn.commit()
            print(f"  {scored}/{len(rows)}")
        print(f"done: {scored} scored")
    return 0


if __name__ == "__main__":
    sys.exit(main())
