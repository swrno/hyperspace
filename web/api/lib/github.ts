import {
  normalizeGithubRepo,
  normalizeGithubIssue,
  normalizeGithubPR,
  normalizeGithubCommit,
} from './schema.js';

/**
 * GitHub OAuth + REST client.
 *
 * Implements the GitHub side of the ingestion architecture:
 *   - OAuth web flow (authorize URL + code→token exchange)
 *   - rate-limit-aware paginated fetch (Link header)
 *   - initial snapshot (repos → issues, PRs, commits)
 *   - delta poll (issues/PRs updated since a cursor)
 */

const API = 'https://api.github.com';
const SCOPES = ['repo', 'read:org', 'read:user'];

export function authorizeUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID || '',
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    allow_signup: 'false',
  });
  return `https://github.com/login/oauth/authorize?${p}`;
}

export async function exchangeCode(code, redirectUri) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed (${res.status})`);
  const data = await (res.json() as any);
  if (data.error) throw new Error(`GitHub OAuth: ${data.error_description || data.error}`);
  return { accessToken: data.access_token, scope: data.scope };
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function getUser(token) {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub /user failed (${res.status})`);
  return (res.json() as any);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One request with primary rate-limit handling (pause when the window is exhausted). */
async function ghFetch(url, token) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: headers(token) });
    const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '1');
    if ((res.status === 403 || res.status === 429) && remaining === 0) {
      const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
      const wait = Math.min(Math.max(reset - Date.now() + 1000, 1000), 60_000);
      console.warn(`GitHub rate limit hit — waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    return res;
  }
  throw new Error('GitHub rate limit retry exhausted');
}

/** Follow Link-header pagination until exhausted (capped for snapshot sanity). */
async function paginate(path, token, { maxPages = 10 } = {}) {
  let url = path.startsWith('http') ? path : `${API}${path}`;
  const out = [];
  let pages = 0;
  while (url && pages < maxPages) {
    const res = await ghFetch(url, token);
    if (!res.ok) {
      if (res.status === 404 || res.status === 403) break; // no access — skip silently
      throw new Error(`GitHub ${res.status} for ${url}`);
    }
    const batch = await (res.json() as any);
    if (Array.isArray(batch)) out.push(...batch);
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((p) => p.includes('rel="next"'));
    url = next ? next.split(';')[0].trim().replace(/^<|>$/g, '') : null;
    pages++;
  }
  return out;
}

export async function listRepos(token) {
  const repos = await paginate(
    '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
    token,
    { maxPages: 5 }
  );
  return repos;
}

/**
 * Full historical pull for the selected repos.
 * @param {string[]} repoFullNames  e.g. ["acme/frontend-app"]
 * @returns {Promise<{entities: object[], repos: object[]}>}
 */
export async function snapshot(token, repoFullNames) {
  const entities = [];
  for (const full of repoFullNames) {
    const [owner, repo] = full.split('/');
    if (!owner || !repo) continue;

    // Repo metadata
    const metaRes = await ghFetch(`${API}/repos/${owner}/${repo}`, token);
    if (metaRes.ok) entities.push(normalizeGithubRepo(await metaRes.json()));

    // Issues (state=all). GitHub mixes PRs into this list — filter them out.
    const issues = await paginate(
      `/repos/${owner}/${repo}/issues?state=all&per_page=100`,
      token
    );
    for (const i of issues) {
      if (i.pull_request) continue;
      entities.push(normalizeGithubIssue(i, full));
    }

    // Pull requests
    const prs = await paginate(`/repos/${owner}/${repo}/pulls?state=all&per_page=100`, token);
    for (const p of prs) entities.push(normalizeGithubPR(p, full));

    // Recent commits (cap to keep snapshot bounded)
    const commits = await paginate(`/repos/${owner}/${repo}/commits?per_page=100`, token, {
      maxPages: 2,
    });
    for (const c of commits) entities.push(normalizeGithubCommit(c, full));
  }
  return { entities };
}

// ── Rich content fetchers ─────────────────────────────────────────────────────

/** Get the recursive file tree for the repo in a single API call. */
async function fetchRepoTree(owner: string, repo: string, branch: string, token: string): Promise<{ path: string; size: number }[]> {
  const res = await ghFetch(`${API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token);
  if (!res.ok) return [];
  const data = await (res.json() as any);
  // Truncated trees (>100k files) still return partial data — use what we get.
  return (data.tree || []).filter((f: any) => f.type === 'blob').map((f: any) => ({ path: f.path, size: f.size || 0 }));
}

/** Fetch a file's decoded text content via the Contents API. */
async function fetchFileContent(owner: string, repo: string, path: string, token: string): Promise<string | null> {
  const res = await ghFetch(`${API}/repos/${owner}/${repo}/contents/${path}`, token);
  if (!res.ok) return null;
  const data = await (res.json() as any);
  if (data.encoding === 'base64' && data.content) {
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
  }
  return typeof data.content === 'string' ? data.content : null;
}

/** Classify which files from the tree are worth ingesting. */
function selectImportantFiles(files: { path: string; size: number }[]): string[] {
  const selected: string[] = [];

  // Configuration & metadata files (always useful)
  const CONFIG_NAMES = new Set([
    'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'requirements.txt',
    'Pipfile', 'setup.py', 'setup.cfg', 'Dockerfile', 'docker-compose.yml',
    'docker-compose.yaml', '.env.example', 'turbo.json', 'nx.json',
    'tsconfig.json', 'vite.config.ts', 'webpack.config.js', 'Makefile',
    'CMakeLists.txt', 'pom.xml', 'build.gradle',
  ]);

  // Markdown docs — root level + common doc dirs (max 30 files)
  const MD_DIR_RE = /^(docs?|documentation|wiki|\.github|guides?)\/[^/]+\.md$/i;

  let mdCount = 0;
  for (const f of files) {
    const name = f.path.split('/').pop() || '';
    const lname = name.toLowerCase();

    // Root .md files (README, CHANGELOG, CONTRIBUTING, etc.)
    if (!f.path.includes('/') && lname.endsWith('.md') && mdCount < 30) {
      selected.push(f.path); mdCount++; continue;
    }
    // Docs directory markdown
    if (MD_DIR_RE.test(f.path) && mdCount < 30 && f.size < 60_000) {
      selected.push(f.path); mdCount++; continue;
    }
    // Config files at root only
    if (!f.path.includes('/') && CONFIG_NAMES.has(name) && f.size < 20_000) {
      selected.push(f.path); continue;
    }
    // GitHub workflows & issue templates
    if (f.path.startsWith('.github/') && (f.path.endsWith('.yml') || f.path.endsWith('.md')) && f.size < 10_000) {
      selected.push(f.path); continue;
    }
  }

  return selected;
}

/** Fetch all releases (body truncated to 4000 chars each). */
async function fetchReleases(owner: string, repo: string, token: string): Promise<{ tag: string; name: string; body: string; published: string }[]> {
  const data = await paginate(`/repos/${owner}/${repo}/releases?per_page=100`, token, { maxPages: 2 });
  return (data as any[]).map((r) => ({
    tag: r.tag_name || '',
    name: r.name || r.tag_name || '',
    body: (r.body || '').slice(0, 4000),
    published: r.published_at || '',
  }));
}

/** Fetch top contributors (login + commit count). */
async function fetchContributors(owner: string, repo: string, token: string): Promise<{ login: string; contributions: number }[]> {
  const data = await paginate(`/repos/${owner}/${repo}/contributors?per_page=100`, token, { maxPages: 1 });
  return (data as any[]).slice(0, 50).map((c) => ({ login: c.login || c.name || '', contributions: c.contributions || 0 }));
}

/** Fetch comments for one issue (up to 10, each capped at 800 chars). */
async function fetchIssueComments(owner: string, repo: string, issueNumber: number, token: string): Promise<string[]> {
  const res = await ghFetch(`${API}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=10`, token);
  if (!res.ok) return [];
  const data = await (res.json() as any);
  return (Array.isArray(data) ? data : []).map((c: any) => `${c.user?.login || 'user'}: ${(c.body || '').slice(0, 800)}`);
}

/** Fetch review summaries for one PR (up to 10 reviews, each capped at 800 chars). */
async function fetchPRReviews(owner: string, repo: string, prNumber: number, token: string): Promise<string[]> {
  const res = await ghFetch(`${API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=10`, token);
  if (!res.ok) return [];
  const data = await (res.json() as any);
  return (Array.isArray(data) ? data : [])
    .filter((r: any) => r.body?.trim())
    .map((r: any) => `${r.user?.login || 'reviewer'} (${r.state}): ${(r.body || '').slice(0, 800)}`);
}

export interface GitHubDocument {
  title: string;
  content: string;
  kind: 'readme' | 'docs' | 'config' | 'releases' | 'contributors' | 'issues' | 'prs' | 'commits';
}

/**
 * Comprehensive repository snapshot that captures everything valuable:
 *   1. README, docs/, .github/ markdown files
 *   2. Key configuration files (package.json, Dockerfile …)
 *   3. Releases with changelogs
 *   4. Top contributors
 *   5. All issues with their discussion threads
 *   6. All PRs with review summaries
 *   7. Recent commits (structured entities)
 *
 * Returns `entities` (normalised, for structural graph) and `documents`
 * (rich text blobs, for direct Cognee ingestion / RAG retrieval).
 */
export async function deepSnapshot(
  token: string,
  repoFullNames: string[],
  onProgress?: (phase: string, pct: number) => void,
): Promise<{ entities: any[]; documents: GitHubDocument[] }> {
  const entities: any[] = [];
  const documents: GitHubDocument[] = [];

  const prog = (phase: string, pct: number) => onProgress?.(phase, pct);
  const n = repoFullNames.length || 1;

  for (let ri = 0; ri < repoFullNames.length; ri++) {
    const full = repoFullNames[ri];
    const base = Math.round((ri / n) * 100);
    const slice = Math.round(100 / n); // each repo gets an equal slice

    const [owner, repo] = full.split('/');
    if (!owner || !repo) continue;

    // ── 1. Repo metadata ────────────────────────────────────────────────────
    prog('Fetching repository metadata…', base + Math.round(slice * 0.05));
    const metaRes = await ghFetch(`${API}/repos/${owner}/${repo}`, token);
    if (!metaRes.ok) continue;
    const meta = await (metaRes.json() as any);
    entities.push(normalizeGithubRepo(meta));
    const branch = meta.default_branch || 'main';

    // ── 2. File tree + content ──────────────────────────────────────────────
    prog('Scanning file tree…', base + Math.round(slice * 0.12));
    const tree = await fetchRepoTree(owner, repo, branch, token);
    const filesToFetch = selectImportantFiles(tree);

    prog('Downloading documentation & configs…', base + Math.round(slice * 0.20));
    const fileContents: { path: string; content: string }[] = [];
    for (const path of filesToFetch) {
      const content = await fetchFileContent(owner, repo, path, token);
      if (content && content.trim()) fileContents.push({ path, content: content.slice(0, 50_000) });
    }

    // Group files into documents for Cognee
    const readme = fileContents.find((f) => f.path.toLowerCase() === 'readme.md');
    const otherMd = fileContents.filter((f) => f.path !== readme?.path && f.path.endsWith('.md'));
    const configs = fileContents.filter((f) => !f.path.endsWith('.md'));

    if (readme) {
      documents.push({
        title: `${full} README`,
        kind: 'readme',
        content: `# ${full} — README\n\n${readme.content}`,
      });
    }
    if (otherMd.length) {
      documents.push({
        title: `${full} Documentation`,
        kind: 'docs',
        content: `# ${full} — Documentation Files\n\n` + otherMd.map((f) => `## ${f.path}\n\n${f.content}`).join('\n\n---\n\n'),
      });
    }
    if (configs.length) {
      documents.push({
        title: `${full} Configuration`,
        kind: 'config',
        content: `# ${full} — Configuration & Build Files\n\n` +
          `Repository: ${full}\nLanguage: ${meta.language || 'unknown'}\nDefault branch: ${branch}\nStars: ${meta.stargazers_count}\nForks: ${meta.forks_count}\n` +
          (meta.description ? `Description: ${meta.description}\n` : '') +
          `\nFile tree (${tree.length} files total):\n` +
          tree.slice(0, 200).map((f) => `  ${f.path}`).join('\n') +
          '\n\n---\n\n' +
          configs.map((f) => `## ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``).join('\n\n'),
      });
    }

    // ── 3. Releases ─────────────────────────────────────────────────────────
    prog('Loading releases & changelog…', base + Math.round(slice * 0.32));
    const releases = await fetchReleases(owner, repo, token);
    if (releases.length) {
      documents.push({
        title: `${full} Releases`,
        kind: 'releases',
        content: `# ${full} — Releases & Changelog\n\n` +
          releases.map((r) => `## ${r.name || r.tag} (${r.published?.slice(0, 10) || ''})\n\n${r.body || '(no release notes)'}`).join('\n\n---\n\n'),
      });
    }

    // ── 4. Contributors ─────────────────────────────────────────────────────
    prog('Loading contributors…', base + Math.round(slice * 0.38));
    const contributors = await fetchContributors(owner, repo, token);
    if (contributors.length) {
      documents.push({
        title: `${full} Contributors`,
        kind: 'contributors',
        content: `# ${full} — Contributors\n\n` + contributors.map((c) => `- @${c.login}: ${c.contributions} commits`).join('\n'),
      });
    }

    // ── 5. Issues + discussion threads ──────────────────────────────────────
    prog('Fetching issues & discussions…', base + Math.round(slice * 0.45));
    const rawIssues = await paginate(`/repos/${owner}/${repo}/issues?state=all&per_page=100`, token, { maxPages: 5 });
    const issuesOnly = (rawIssues as any[]).filter((i) => !i.pull_request);
    for (const i of issuesOnly) entities.push(normalizeGithubIssue(i, full));

    // Build enriched issue documents (with comment threads)
    const issueBatches: string[] = [];
    for (let ii = 0; ii < Math.min(issuesOnly.length, 100); ii++) {
      const i = issuesOnly[ii];
      if (ii % 20 === 0) prog(`Fetching issues… (${ii + 1}/${Math.min(issuesOnly.length, 100)})`, base + Math.round(slice * (0.45 + 0.20 * (ii / 100))));
      let block = `### #${i.number}: ${i.title} [${i.state}]\n${i.body ? i.body.slice(0, 1500) : '(no description)'}`;
      if (i.comments > 0) {
        const comments = await fetchIssueComments(owner, repo, i.number, token);
        if (comments.length) block += '\n\n**Discussion:**\n' + comments.map((c) => `> ${c}`).join('\n');
      }
      issueBatches.push(block);
    }
    if (issueBatches.length) {
      // Split into ~10-issue chunks so each Cognee document stays manageable
      for (let i = 0; i < issueBatches.length; i += 10) {
        documents.push({
          title: `${full} Issues (${i + 1}–${Math.min(i + 10, issueBatches.length)})`,
          kind: 'issues',
          content: `# ${full} — Issues\n\n` + issueBatches.slice(i, i + 10).join('\n\n---\n\n'),
        });
      }
    }

    // ── 6. Pull Requests + reviews ──────────────────────────────────────────
    prog('Fetching pull requests & reviews…', base + Math.round(slice * 0.65));
    const rawPRs = await paginate(`/repos/${owner}/${repo}/pulls?state=all&per_page=100`, token, { maxPages: 3 });
    for (const p of rawPRs as any[]) entities.push(normalizeGithubPR(p, full));

    const prBatches: string[] = [];
    for (let pi = 0; pi < Math.min((rawPRs as any[]).length, 60); pi++) {
      const p = (rawPRs as any[])[pi];
      if (pi % 15 === 0) prog(`Fetching PRs… (${pi + 1}/${Math.min((rawPRs as any[]).length, 60)})`, base + Math.round(slice * (0.65 + 0.12 * (pi / 60))));
      const status = p.merged_at ? 'merged' : p.state;
      let block = `### PR #${p.number}: ${p.title} [${status}]\n` +
        `Branch: ${p.head?.ref} → ${p.base?.ref}\n${p.body ? p.body.slice(0, 1200) : '(no description)'}`;
      if ((p.review_comments || 0) + (p.comments || 0) > 0) {
        const reviews = await fetchPRReviews(owner, repo, p.number, token);
        if (reviews.length) block += '\n\n**Reviews:**\n' + reviews.map((r) => `> ${r}`).join('\n');
      }
      prBatches.push(block);
    }
    if (prBatches.length) {
      for (let i = 0; i < prBatches.length; i += 10) {
        documents.push({
          title: `${full} Pull Requests (${i + 1}–${Math.min(i + 10, prBatches.length)})`,
          kind: 'prs',
          content: `# ${full} — Pull Requests\n\n` + prBatches.slice(i, i + 10).join('\n\n---\n\n'),
        });
      }
    }

    // ── 7. Recent commits (entities only) ───────────────────────────────────
    prog('Loading commit history…', base + Math.round(slice * 0.82));
    const commits = await paginate(`/repos/${owner}/${repo}/commits?per_page=100`, token, { maxPages: 3 });
    for (const c of commits as any[]) entities.push(normalizeGithubCommit(c, full));
  }

  return { entities, documents };
}

/** Delta poll — issues + PRs updated since `sinceIso` across the selected repos. */
export async function pollSince(token, repoFullNames, sinceIso) {
  const entities = [];
  const since = sinceIso ? `&since=${encodeURIComponent(sinceIso)}` : '';
  for (const full of repoFullNames) {
    const [owner, repo] = full.split('/');
    if (!owner || !repo) continue;

    // Refresh repo metadata so "last updated" / language / status stay current
    // (a push updates pushed_at even when there are no new issues/PRs).
    const metaRes = await ghFetch(`${API}/repos/${owner}/${repo}`, token);
    if (metaRes.ok) entities.push(normalizeGithubRepo(await metaRes.json()));

    // New commits since the last sync (captures pushes).
    const commits = await paginate(
      `/repos/${owner}/${repo}/commits?per_page=50${sinceIso ? `&since=${encodeURIComponent(sinceIso)}` : ''}`,
      token,
      { maxPages: 1 }
    );
    for (const c of commits) entities.push(normalizeGithubCommit(c, full));

    const issues = await paginate(
      `/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&per_page=50${since}`,
      token,
      { maxPages: 2 }
    );
    for (const i of issues) {
      if (i.pull_request) continue;
      entities.push(normalizeGithubIssue(i, full));
    }

    // PRs API has no `since`; sort by updated and keep the freshest page.
    const prs = await paginate(
      `/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`,
      token,
      { maxPages: 1 }
    );
    for (const p of prs) {
      if (sinceIso && p.updated_at && p.updated_at < sinceIso) continue;
      entities.push(normalizeGithubPR(p, full));
    }
  }
  return { entities };
}
