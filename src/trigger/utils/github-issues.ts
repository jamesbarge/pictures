/**
 * GitHub Issue creation for automated QA alerts.
 *
 * Creates or updates GitHub issues when the QA pipeline detects
 * systemic data quality problems. Deduplicates by searching for
 * existing open issues with the same title before creating new ones.
 */

const GITHUB_API = "https://api.github.com";

interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
}

interface IssueResult {
  issueNumber: number;
  url: string;
  created: boolean; // false = comment added to existing issue
}

/** Create or update a GitHub issue for a QA alert. Deduplicates by searching for an existing open issue with the same title. */
export async function createGitHubIssue(
  params: CreateIssueParams
): Promise<IssueResult | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    console.warn(
      "[github-issues] GITHUB_TOKEN or GITHUB_REPO not set — skipping issue creation"
    );
    return null;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    // Check for existing open issue with same title
    const existing = await findExistingIssue(repo, params.title, headers);

    if (existing) {
      // Add comment to existing issue instead of creating duplicate
      await addComment(repo, existing.number, params.body, headers);
      console.log(
        `[github-issues] Added comment to existing issue #${existing.number}`
      );
      return {
        issueNumber: existing.number,
        url: existing.url,
        created: false,
      };
    }

    // Create new issue
    const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        labels: params.labels ?? [],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[github-issues] Create failed: ${res.status} ${text}`);
      return null;
    }

    const issue = (await res.json()) as { number: number; html_url: string };
    console.log(`[github-issues] Created issue #${issue.number}: ${issue.html_url}`);

    return {
      issueNumber: issue.number,
      url: issue.html_url,
      created: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[github-issues] Error: ${msg}`);
    return null;
  }
}

async function findExistingIssue(
  repo: string,
  title: string,
  headers: Record<string, string>
): Promise<{ number: number; url: string } | null> {
  // Search for open issues with matching title (first 60 chars for search accuracy)
  const searchTitle = title.slice(0, 60).replace(/['"]/g, "");
  const query = encodeURIComponent(`repo:${repo} is:open is:issue in:title "${searchTitle}"`);

  const res = await fetch(`${GITHUB_API}/search/issues?q=${query}&per_page=5`, {
    headers,
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    items: Array<{ number: number; html_url: string; title: string }>;
  };

  // Find exact title match
  const match = data.items.find((i) => i.title === title);
  return match ? { number: match.number, url: match.html_url } : null;
}

async function addComment(
  repo: string,
  issueNumber: number,
  body: string,
  headers: Record<string, string>
): Promise<void> {
  const commentBody = `## Updated QA Report\n\n_This issue was re-detected by the automated QA pipeline._\n\n${body}`;

  await fetch(
    `${GITHUB_API}/repos/${repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    }
  );
}
