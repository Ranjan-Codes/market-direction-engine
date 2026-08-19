/**
 * Alert delivery: one GitHub issue per alert in the repo, which GitHub
 * emails to the owner — no SMTP or third-party service to configure.
 * Without a token (i.e. running locally) delivery is skipped and the
 * caller still records the alert.
 */
export async function createGithubIssue(opts: {
  title: string;
  body: string;
  labels: string[];
}): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // owner/name, set by Actions
  if (!token || !repo) return false;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "market-direction-engine",
    },
    body: JSON.stringify({
      title: opts.title.slice(0, 250),
      body: opts.body,
      labels: opts.labels,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  return res.ok;
}
