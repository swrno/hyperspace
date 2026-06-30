/**
 * Internal entity schema + normalisation.
 *
 * Every provider payload is mapped to a small set of internal entity types
 * before it is stored in Mongo (`kb_entities`) and rendered into the Cognee
 * knowledge graph. This mirrors §6 "Event Normalisation" of the ingestion
 * architecture and the graph data model in the README.
 *
 * Canonical entity shape:
 *   {
 *     id,           // globally unique: "<source>:<type>:<externalId>"
 *     type,         // WorkItem | CodeChange | Commit | Sprint | Project | Repository | Person
 *     source,       // 'github' | 'jira'
 *     externalId,   // provider id
 *     externalKey,  // e.g. Jira "PROJ-123" (optional)
 *     title,
 *     status,
 *     body,         // free text (description / message / etc.)
 *     url,
 *     authorRef,    // login or email for identity resolution
 *     repoRef,      // owning repo full_name (github)
 *     projectRef,   // owning project key (jira)
 *     labels: [],
 *     linkedKeys: [],   // cross-source refs extracted from text (e.g. PROJ-123)
 *     updatedAt,
 *     raw,          // trimmed original payload (kept for re-normalisation)
 *   }
 */

const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

// Human-readable source names so the LLM (and the user) can tell a Google Sheet
// from a Slide from a GitHub repo — instead of cryptic codes like "gslides".
export const SOURCE_LABEL = {
  github: 'GitHub',
  jira: 'Jira',
  gdocs: 'Google Docs',
  gslides: 'Google Slides',
  gsheets: 'Google Sheets',
  gcal: 'Google Calendar',
  slack: 'Slack',
  salesforce: 'Salesforce',
};
export const sourceLabel = (s) => SOURCE_LABEL[s] || s || 'unknown';

/** Pull Jira issue keys (PROJ-123) out of free text — used for cross-source edges. */
export function extractJiraKeys(text) {
  if (!text) return [];
  return [...new Set(String(text).match(JIRA_KEY_RE) || [])];
}

function eid(source, type, externalId) {
  return `${source}:${type}:${externalId}`;
}

// ── GitHub ──────────────────────────────────────────────────────────────────

export function normalizeGithubRepo(r) {
  return {
    id: eid('github', 'Repository', r.id),
    type: 'Repository',
    source: 'github',
    externalId: String(r.id),
    title: r.full_name,
    status: r.archived ? 'archived' : 'active',
    body: r.description || '',
    url: r.html_url,
    authorRef: r.owner?.login,
    repoRef: r.full_name,
    labels: [r.language].filter(Boolean),
    linkedKeys: [],
    updatedAt: r.pushed_at || r.updated_at,
    raw: { language: r.language, private: r.private, default_branch: r.default_branch },
  };
}

export function normalizeGithubIssue(i, repoFullName) {
  // GitHub's issues API returns PRs too; caller filters, but guard anyway.
  const body = i.body || '';
  return {
    id: eid('github', 'WorkItem', i.id),
    type: 'WorkItem',
    source: 'github',
    externalId: String(i.id),
    title: i.title,
    status: i.state, // open | closed
    body,
    url: i.html_url,
    authorRef: i.user?.login,
    repoRef: repoFullName,
    labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
    linkedKeys: extractJiraKeys(`${i.title}\n${body}`),
    updatedAt: i.updated_at,
    raw: { number: i.number, comments: i.comments },
  };
}

export function normalizeGithubPR(p, repoFullName) {
  const body = p.body || '';
  return {
    id: eid('github', 'CodeChange', p.id),
    type: 'CodeChange',
    source: 'github',
    externalId: String(p.id),
    title: p.title,
    status: p.merged_at ? 'merged' : p.state, // merged | open | closed
    body,
    url: p.html_url,
    authorRef: p.user?.login,
    repoRef: repoFullName,
    labels: (p.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
    linkedKeys: extractJiraKeys(`${p.title}\n${body}`),
    updatedAt: p.updated_at,
    raw: { number: p.number, base: p.base?.ref, head: p.head?.ref, merged_at: p.merged_at },
  };
}

export function normalizeGithubCommit(c, repoFullName) {
  const message = c.commit?.message || '';
  return {
    id: eid('github', 'Commit', c.sha),
    type: 'Commit',
    source: 'github',
    externalId: c.sha,
    title: message.split('\n')[0].slice(0, 120),
    status: 'committed',
    body: message,
    url: c.html_url,
    authorRef: c.author?.login || c.commit?.author?.email,
    repoRef: repoFullName,
    labels: [],
    linkedKeys: extractJiraKeys(message),
    updatedAt: c.commit?.author?.date,
    raw: { sha: c.sha },
  };
}

// ── Jira ─────────────────────────────────────────────────────────────────────

function adfToText(node) {
  // Jira descriptions/comments come as Atlassian Document Format (ADF). Flatten
  // to plain text good enough for the knowledge graph.
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  let out = node.text || '';
  if (node.content) out += adfToText(node.content);
  if (node.type === 'paragraph' || node.type === 'heading') out += '\n';
  return out;
}

export function normalizeJiraIssue(issue, siteUrl) {
  const f = issue.fields || {};
  const desc = adfToText(f.description).trim();
  const assignee = f.assignee || {};
  return {
    id: eid('jira', 'WorkItem', issue.id),
    type: 'WorkItem',
    source: 'jira',
    externalId: String(issue.id),
    externalKey: issue.key,
    title: f.summary || '',
    status: f.status?.name || 'unknown',
    body: desc,
    url: siteUrl ? `${siteUrl}/browse/${issue.key}` : undefined,
    authorRef: assignee.emailAddress || assignee.displayName,
    projectRef: f.project?.key || issue.key?.split('-')[0],
    labels: f.labels || [],
    linkedKeys: [],
    updatedAt: f.updated,
    raw: {
      priority: f.priority?.name,
      issuetype: f.issuetype?.name,
      reporter: f.reporter?.emailAddress,
    },
  };
}

export function normalizeJiraProject(p) {
  return {
    id: eid('jira', 'Project', p.id),
    type: 'Project',
    source: 'jira',
    externalId: String(p.id),
    externalKey: p.key,
    title: p.name,
    status: 'active',
    body: p.description || '',
    projectRef: p.key,
    labels: [],
    linkedKeys: [],
    updatedAt: new Date().toISOString(),
    raw: { projectTypeKey: p.projectTypeKey },
  };
}

export function normalizeJiraSprint(s) {
  return {
    id: eid('jira', 'Sprint', s.id),
    type: 'Sprint',
    source: 'jira',
    externalId: String(s.id),
    title: s.name,
    status: s.state, // active | closed | future
    body: s.goal || '',
    labels: [],
    linkedKeys: [],
    updatedAt: s.completeDate || s.endDate || s.startDate,
    raw: { startDate: s.startDate, endDate: s.endDate, boardId: s.originBoardId },
  };
}

// ── Google Docs / Slides ─────────────────────────────────────────────────────

const GFILE = {
  gdocs: { label: 'doc', url: (id) => `https://docs.google.com/document/d/${id}` },
  gslides: { label: 'slides', url: (id) => `https://docs.google.com/presentation/d/${id}` },
  gsheets: { label: 'sheet', url: (id) => `https://docs.google.com/spreadsheets/d/${id}` },
};

export function normalizeGoogleDoc(file, kind, text) {
  const conf = GFILE[kind] || GFILE.gdocs;
  const source = GFILE[kind] ? kind : 'gdocs';
  return {
    id: eid(source, 'Document', file.id),
    type: 'Document',
    source,
    externalId: String(file.id),
    title: file.name,
    status: 'active',
    body: (text || '').slice(0, 8000),
    url: file.webViewLink || conf.url(file.id),
    authorRef: file.ownerEmail,
    labels: [conf.label],
    linkedKeys: extractJiraKeys(`${file.name}\n${text || ''}`),
    updatedAt: file.modifiedTime,
    raw: { fileId: file.id },
  };
}

export function normalizeCalendarEvent(e) {
  const desc = e.description || '';
  const start = e.start?.dateTime || e.start?.date || null;
  const end = e.end?.dateTime || e.end?.date || null;
  const attendees = (e.attendees || []).map((a) => a.email).filter(Boolean);
  return {
    id: eid('gcal', 'Event', e.id),
    type: 'Event',
    source: 'gcal',
    externalId: String(e.id),
    title: e.summary || '(no title)',
    status: e.status || 'confirmed',
    body: [desc, attendees.length ? `Attendees: ${attendees.join(', ')}` : ''].filter(Boolean).join('\n\n'),
    url: e.htmlLink,
    authorRef: e.organizer?.email,
    labels: ['event'],
    linkedKeys: extractJiraKeys(`${e.summary || ''}\n${desc}`),
    updatedAt: start,
    raw: { start, end, location: e.location },
  };
}

// ── Rendering for Cognee ─────────────────────────────────────────────────────

/**
 * Render one entity to a compact, self-describing text block. Cognee's graph
 * extractor reads these to build typed nodes + relationships, so we make the
 * type, identity, status and cross-links explicit.
 */
export function entityToText(e) {
  const lines = [
    `[${sourceLabel(e.source)} · ${e.type}] ${e.externalKey ? `${e.externalKey} — ` : ''}${e.title || '(untitled)'}`,
    `source: ${sourceLabel(e.source)}${e.repoRef ? ` · repo: ${e.repoRef}` : ''}${e.projectRef ? ` · project: ${e.projectRef}` : ''}`,
    `status: ${e.status || 'n/a'}${e.authorRef ? ` · by: ${e.authorRef}` : ''}${e.updatedAt ? ` · updated: ${e.updatedAt}` : ''}`,
  ];
  if (e.labels?.length) lines.push(`labels: ${e.labels.join(', ')}`);
  if (e.linkedKeys?.length) lines.push(`references: ${e.linkedKeys.join(', ')}`);
  if (e.url) lines.push(`url: ${e.url}`);
  if (e.body) lines.push('', e.body.slice(0, 2000));
  return lines.join('\n');
}

/** Render a batch of entities into a single document for one remember() call. */
export function entitiesToDocument(entities, heading) {
  const header = heading ? `# ${heading}\n\n` : '';
  return header + entities.map(entityToText).join('\n\n---\n\n');
}
