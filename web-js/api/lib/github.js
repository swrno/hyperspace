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
  const data = await res.json();
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
  return res.json();
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
    const batch = await res.json();
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
