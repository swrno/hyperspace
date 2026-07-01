// UPDATED: added additive jiraNodeSnapshot() for the new Project/Issue node graph — existing snapshot()/pollSince() untouched.
import { normalizeJiraIssue, normalizeJiraProject, normalizeJiraSprint } from './schema.js';
import { normalizeJiraProjectNode, normalizeJiraIssueNode } from './schema.js';
import { embedBatch } from './embeddings.js';

/**
 * Jira OAuth 2.0 (3LO) + REST client.
 *
 * Implements the Jira side of the ingestion architecture:
 *   - 3LO authorize URL + code→token exchange (via auth.atlassian.com)
 *   - accessible-resources lookup to resolve the cloudId
 *   - rotating refresh-token handling (Jira tokens expire in ~60 min)
 *   - startAt/total paginated snapshot (projects, issues via JQL, sprints)
 *   - delta poll (issues updated since a cursor via JQL)
 *
 * All Jira REST calls go through https://api.atlassian.com/ex/jira/{cloudId}/…
 */

const AUTH = 'https://auth.atlassian.com';
const GATEWAY = 'https://api.atlassian.com';
const SCOPES = ['read:jira-work', 'read:jira-user', 'offline_access'];

export function authorizeUrl(redirectUri, state) {
  const p = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.JIRA_CLIENT_ID || '',
    scope: SCOPES.join(' '),
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTH}/authorize?${p}`;
}

export async function exchangeCode(code, redirectUri) {
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Jira token exchange failed (${res.status})`);
  const d = await (res.json() as any);
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresIn: d.expires_in, // seconds
    scope: d.scope,
  };
}

/** Rotating refresh — Jira returns a NEW refresh token each time; caller must store both. */
export async function refresh(refreshToken) {
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const err: any = new Error(`Jira refresh failed (${res.status})`);
    err.revoked = res.status === 403 || res.status === 400;
    throw err;
  }
  const d = await (res.json() as any);
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token || refreshToken,
    expiresIn: d.expires_in,
  };
}

/** Sites this token can access — first entry's id is the cloudId. */
export async function accessibleResources(token) {
  const res = await fetch(`${GATEWAY}/oauth/token/accessible-resources`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira accessible-resources failed (${res.status})`);
  return (res.json() as any); // [{ id, name, url, scopes }]
}

export async function me(token) {
  const res = await fetch(`${GATEWAY}/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (res.json() as any); // { account_id, email, name }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jiraHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

/** GET against a cloud-scoped Jira path, with 429 backoff + 10 req/s politeness. */
async function jiraGet(cloudId, path, token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${GATEWAY}/ex/jira/${cloudId}/${path}${qs ? `?${qs}` : ''}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: jiraHeaders(token) });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') || 2);
      await sleep(Math.min(retry * 1000, 30_000));
      continue;
    }
    await sleep(100); // ~10 req/s ceiling
    return res;
  }
  throw new Error('Jira rate limit retry exhausted');
}

/** startAt/total offset pagination over a Jira list endpoint. */
async function paginate(cloudId, path, token, params = {}, { itemsKey, maxPages = 20 }: any = {}) {
  const out = [];
  let startAt = 0;
  const maxResults = 100;
  for (let page = 0; page < maxPages; page++) {
    const res = await jiraGet(cloudId, path, token, { ...params, startAt, maxResults });
    if (!res.ok) {
      if (res.status === 404 || res.status === 403) break;
      throw new Error(`Jira ${res.status} for ${path}`);
    }
    const data = await (res.json() as any);
    const items = (itemsKey && data[itemsKey]) || data.issues || data.values || [];
    out.push(...items);
    const total = data.total ?? startAt + items.length;
    startAt += items.length;
    if (!items.length || startAt >= total) break;
  }
  return out;
}

/**
 * Full historical pull. `token` must be a fresh access token; `cloudId`/`siteUrl`
 * come from the stored connection.
 */
export async function snapshot({ token, cloudId, siteUrl }) {
  const entities = [];

  // Projects
  const projects = await paginate(cloudId, 'rest/api/3/project/search', token, {}, {
    itemsKey: 'values',
    maxPages: 5,
  });
  for (const p of projects) entities.push(normalizeJiraProject(p));

  // Issues across all projects (JQL)
  const issues = await paginate(
    cloudId,
    'rest/api/3/search',
    token,
    { jql: 'order by updated DESC', fields: 'summary,status,assignee,priority,project,labels,issuetype,reporter,description,updated' },
    { itemsKey: 'issues', maxPages: 10 }
  );
  for (const i of issues) entities.push(normalizeJiraIssue(i, siteUrl));

  // Sprints per board
  const boards = await paginate(cloudId, 'rest/agile/1.0/board', token, {}, {
    itemsKey: 'values',
    maxPages: 3,
  });
  for (const b of boards) {
    try {
      const sprints = await paginate(cloudId, `rest/agile/1.0/board/${b.id}/sprint`, token, {}, {
        itemsKey: 'values',
        maxPages: 3,
      });
      for (const s of sprints) entities.push(normalizeJiraSprint(s));
    } catch {
      /* board may not be scrum — skip */
    }
  }

  return { entities };
}

/** Delta poll — issues updated since the cursor (JQL `updated >=`). */
export async function pollSince({ token, cloudId, siteUrl }, sinceIso) {
  const entities = [];
  let jql = 'order by updated DESC';
  if (sinceIso) {
    // Jira JQL wants "yyyy/MM/dd HH:mm"
    const d = new Date(sinceIso);
    const fmt = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
      d.getDate()
    ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    jql = `updated >= "${fmt}" order by updated DESC`;
  }
  const issues = await paginate(
    cloudId,
    'rest/api/3/search',
    token,
    { jql, fields: 'summary,status,assignee,priority,project,labels,issuetype,reporter,description,updated' },
    { itemsKey: 'issues', maxPages: 3 }
  );
  for (const i of issues) entities.push(normalizeJiraIssue(i, siteUrl));
  return { entities };
}

// ── Node-graph snapshot (additive, Source/Chunk/Entity scaffolding) ─────────
//
// Parallel to snapshot()/pollSince() above — does not replace them. Populates
// the new KnowledgeBase -> Source -> Chunk -> Entity node model consumed by
// ingest.ts's buildNodeGraphForProvider().

/**
 * Uncapped startAt/total pagination (unlike paginate()'s maxPages ceiling),
 * for full-pagination compliance. Safety-capped at 500 pages (50k items)
 * against a runaway API bug — never truly infinite.
 */
async function paginateAll(cloudId, path, token, params: any = {}, itemsKey?: string) {
  const out = [];
  let startAt = 0;
  const maxResults = 100;
  for (let page = 0; page < 500; page++) {
    const res = await jiraGet(cloudId, path, token, { ...params, startAt, maxResults });
    if (!res.ok) {
      if (res.status === 404 || res.status === 403) break;
      throw new Error(`Jira ${res.status} for ${path}`);
    }
    const data = await (res.json() as any);
    const items = (itemsKey && data[itemsKey]) || data.issues || data.values || [];
    out.push(...items);
    const total = data.total ?? startAt + items.length;
    startAt += items.length;
    if (!items.length || startAt >= total) break;
    if (page === 499) console.warn(`paginateAll: hit 500-page safety cap for ${path}`);
  }
  return out;
}

async function safeEmbedBatch(texts) {
  if (!texts.length) return [];
  try {
    return await embedBatch(texts);
  } catch (e) {
    console.warn('Node-graph embedBatch failed (non-fatal):', e.message);
    return texts.map(() => undefined);
  }
}

/** Full historical pull into the new ProjectNode/IssueNode graph, scoped per project so `linked_issues` can later be resolved into RELATES_TO edges by ingest.ts. */
export async function jiraNodeSnapshot({ token, cloudId, siteUrl }, kbId) {
  const projects = [];
  const issues = [];
  try {
    const rawProjects = await paginateAll(cloudId, 'rest/api/3/project/search', token, {}, 'values');
    for (const p of rawProjects) {
      const project = normalizeJiraProjectNode({ key: p.key, name: p.name, description: p.description }, kbId);
      projects.push(project);

      try {
        const jql = `project=${p.key} ORDER BY created ASC`;
        const rawIssues = await paginateAll(
          cloudId,
          'rest/api/3/search',
          token,
          { jql, fields: 'summary,description,comment,issuetype,status,assignee,reporter,priority,issuelinks' },
          'issues'
        );
        const projectIssues = [];
        for (const raw of rawIssues) {
          try {
            projectIssues.push(normalizeJiraIssueNode(raw, project.id, kbId));
          } catch (e) {
            console.warn(`jiraNodeSnapshot: failed to normalize issue ${raw?.key}:`, e.message);
          }
        }
        // One paced batch of issue-text embeddings per project.
        const embeds = await safeEmbedBatch(projectIssues.map((i) => i.metadata.issue_text_content));
        projectIssues.forEach((issue, idx) => {
          issue.metadata.embedding = embeds[idx];
          issues.push(issue);
        });
      } catch (e) {
        console.warn(`jiraNodeSnapshot: failed to fetch issues for project ${p.key}:`, e.message);
      }
    }
  } catch (e) {
    console.warn('jiraNodeSnapshot failed:', e.message);
  }
  return { projects, issues };
}
