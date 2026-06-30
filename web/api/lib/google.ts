import { normalizeGoogleDoc, normalizeCalendarEvent } from './schema.js';

/**
 * Google OAuth 2.0 + Workspace client.
 *
 * One Google OAuth grant powers every Google connector:
 *   gdocs / gslides / gsheets → Drive list + export (text)
 *   gcal                      → Calendar API (recent/upcoming events)
 *
 * Access tokens expire in ~1h; refresh tokens are long-lived and NON-rotating.
 */

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars/primary';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

// Drive file connectors → Drive mimeType + export format.
const FILE_KIND = {
  gdocs: { mime: 'application/vnd.google-apps.document', export: 'text/plain', label: 'Doc' },
  gslides: { mime: 'application/vnd.google-apps.presentation', export: 'text/plain', label: 'Slides' },
  gsheets: { mime: 'application/vnd.google-apps.spreadsheet', export: 'text/csv', label: 'Sheet' },
};

export function authorizeUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${AUTH}?${p}`;
}

export async function exchangeCode(code, redirectUri) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const d = await (res.json() as any);
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: d.expires_in, scope: d.scope };
}

/** Google refresh tokens are non-rotating — reuse the same refresh_token. */
export async function refresh(refreshToken) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err: any = new Error(`Google refresh failed (${res.status})`);
    err.revoked = res.status === 400 || res.status === 401;
    throw err;
  }
  const d = await (res.json() as any);
  return { accessToken: d.access_token, refreshToken, expiresIn: d.expires_in };
}

export async function me(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (res.json() as any);
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// ── Drive files (Docs / Slides / Sheets) ─────────────────────────────────────

export async function listFiles(token, kind) {
  const conf = FILE_KIND[kind];
  if (!conf) return [];
  const q = new URLSearchParams({
    q: `mimeType='${conf.mime}' and trashed=false`,
    pageSize: '50',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,modifiedTime,owners(displayName))',
  });
  const res = await fetch(`${DRIVE}/files?${q}`, { headers: auth(token) });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const data = await (res.json() as any);
  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    meta: `${conf.label}${f.owners?.[0]?.displayName ? ` · ${f.owners[0].displayName}` : ''}`,
  }));
}

async function exportFileText(token, fileId, kind) {
  const conf = FILE_KIND[kind] || FILE_KIND.gdocs;
  const res = await fetch(`${DRIVE}/files/${fileId}/export?mimeType=${encodeURIComponent(conf.export)}`, {
    headers: auth(token),
  });
  if (!res.ok) {
    console.warn(`Google export failed for ${fileId} (${res.status})`);
    return '';
  }
  return (await res.text()).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Calendar ─────────────────────────────────────────────────────────────────

export async function calendarList(token) {
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const q = new URLSearchParams({ timeMin, maxResults: '50', singleEvents: 'true', orderBy: 'startTime' });
  const res = await fetch(`${CALENDAR}/events?${q}`, { headers: auth(token) });
  if (!res.ok) throw new Error(`Calendar list failed (${res.status})`);
  const data = await (res.json() as any);
  return (data.items || []).map((e) => {
    const when = e.start?.dateTime || e.start?.date || '';
    return { id: e.id, name: e.summary || '(no title)', meta: when ? new Date(when).toLocaleString() : 'Event' };
  });
}

export async function calendarEvent(token, id) {
  const res = await fetch(`${CALENDAR}/events/${id}`, { headers: auth(token) });
  if (!res.ok) return null;
  return (res.json() as any);
}

// ── Snapshot dispatch ────────────────────────────────────────────────────────

export async function snapshot(token, selectedItems, kind) {
  const entities = [];

  if (kind === 'gcal') {
    for (const it of selectedItems) {
      const ev = await calendarEvent(token, it.id);
      if (ev) entities.push(normalizeCalendarEvent(ev));
    }
    return { entities };
  }

  // Drive file kinds: gdocs / gslides / gsheets
  for (const item of selectedItems) {
    if (!item.id) continue;
    const text = await exportFileText(token, item.id, kind);
    entities.push(normalizeGoogleDoc({ id: item.id, name: item.name }, kind, text));
  }
  return { entities };
}
