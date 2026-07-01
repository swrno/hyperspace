// UPDATED: added additive node-graph snapshot functions (gdocsNodeSnapshot, gslidesNodeSnapshot, gcalNodeSnapshot) for the Source/Chunk graph — existing snapshot()/exportFileText()/calendarList()/calendarEvent() untouched.
import { normalizeGoogleDoc, normalizeCalendarEvent } from './schema.js';
import {
  normalizeDocument,
  normalizeChunk,
  normalizePresentation,
  normalizeSlide,
  normalizeCalendarNode,
  normalizeCalendarEventNode,
  chunkText,
} from './schema.js';
import { embedBatch } from './embeddings.js';

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

// ── Node-graph snapshot (additive, Source/Chunk/Entity scaffolding) ─────────
//
// Parallel to snapshot() above — does not replace it. Populates the new
// KnowledgeBase -> Source -> Chunk -> Entity node model consumed by
// ingest.ts's buildNodeGraphForProvider(). Never throws; failures are logged
// and degrade to empty/undefined pieces so a single bad item can't abort a
// whole sync.

/**
 * Embed many texts in one paced batch (embedBatch handles concurrency +
 * rate-limit pacing). Returns embeddings positionally aligned to `texts`; on
 * total failure returns undefined per slot so nodes are still created.
 */
async function safeEmbedBatch(texts) {
  if (!texts.length) return [];
  try {
    return await embedBatch(texts);
  } catch (e) {
    console.warn('Node-graph embedBatch failed (non-fatal):', e.message);
    return texts.map(() => undefined);
  }
}

function deriveHeading(chunk) {
  const firstLine = (chunk.split('\n')[0] || '').trim();
  if (firstLine && firstLine.length < 80 && !/[.,;:!?]$/.test(firstLine)) return firstLine;
  return '';
}

export async function gdocsNodeSnapshot(token, selectedItems, kbId) {
  const documents = [];
  const chunks = [];
  for (const item of selectedItems || []) {
    if (!item.id) continue;
    try {
      const text = await exportFileText(token, item.id, 'gdocs');
      const description = (text.split(/\n\n+/).find((p) => p.trim()) || '').slice(0, 300);
      const rawChunks = chunkText(text);
      // One paced batch per document: [doc summary text, ...chunk texts].
      const embeds = await safeEmbedBatch([`${item.name}\n${description}`, ...rawChunks]);

      const doc = normalizeDocument({ id: item.id, name: item.name }, description, kbId);
      doc.metadata.embedding = embeds[0];
      documents.push(doc);

      for (let i = 0; i < rawChunks.length; i++) {
        const heading = deriveHeading(rawChunks[i]);
        // Truncation placeholder, not an LLM summary — see plan notes: no LLM
        // client is available in this file without duplicating the NER call
        // point that already lives in ingest.ts.
        const summary = rawChunks[i].slice(0, 160);
        const chunk = normalizeChunk(rawChunks[i], i, heading, summary, doc.id, kbId);
        chunk.metadata.embedding = embeds[i + 1];
        chunks.push(chunk);
      }
    } catch (e) {
      console.warn(`gdocsNodeSnapshot failed for ${item.id}:`, e.message);
    }
  }
  return { documents, chunks };
}

async function fetchSlidesPresentation(token, presentationId) {
  try {
    const res = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
      headers: auth(token),
    });
    if (!res.ok) {
      console.warn(`Slides fetch failed for ${presentationId} (${res.status})`);
      return null;
    }
    return (res.json() as any);
  } catch (e) {
    console.warn(`Slides fetch error for ${presentationId}:`, e.message);
    return null;
  }
}

function extractSlideText(slide) {
  const parts = [];
  for (const el of slide?.pageElements || []) {
    const textElements = el.shape?.text?.textElements || [];
    const text = textElements.map((te) => te.textRun?.content || '').join('');
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join('\n');
}

export async function gslidesNodeSnapshot(token, selectedItems, kbId) {
  const presentations = [];
  const slides = [];
  for (const item of selectedItems || []) {
    if (!item.id) continue;
    try {
      const pres = await fetchSlidesPresentation(token, item.id);
      if (!pres) continue;
      const rawSlides = pres.slides || [];
      const slideTexts = rawSlides.map((s, i) => extractSlideText(s) || `[slide ${i + 1}: no text content]`);
      const firstSlideText = rawSlides.length ? extractSlideText(rawSlides[0]) : '';
      // One paced batch per presentation: [presentation summary text, ...slide texts].
      const embeds = await safeEmbedBatch([`${item.name}\n${firstSlideText}`, ...slideTexts]);

      const presentation = normalizePresentation({ id: item.id, name: item.name }, firstSlideText, rawSlides.length, kbId);
      presentation.metadata.embedding = embeds[0];
      presentations.push(presentation);

      for (let i = 0; i < rawSlides.length; i++) {
        const slide = normalizeSlide(rawSlides[i].objectId, i, extractSlideText(rawSlides[i]), presentation.id, kbId);
        slide.metadata.embedding = embeds[i + 1];
        slides.push(slide);
      }
    } catch (e) {
      console.warn(`gslidesNodeSnapshot failed for ${item.id}:`, e.message);
    }
  }
  return { presentations, slides };
}

/** Fully paginate calendar events via nextPageToken (unlike calendarList(), which only fetches page 1 for the UI picker). */
async function listAllCalendarEvents(token) {
  const events = [];
  let pageToken;
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  do {
    const q = new URLSearchParams({
      maxResults: '250',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      ...(pageToken ? { pageToken } : {}),
    });
    let res;
    try {
      res = await fetch(`${CALENDAR}/events?${q}`, { headers: auth(token) });
    } catch (e) {
      console.warn('Calendar events fetch error:', e.message);
      break;
    }
    if (!res.ok) {
      console.warn(`Calendar events fetch failed (${res.status})`);
      break;
    }
    const data = await (res.json() as any);
    events.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return events;
}

export async function gcalNodeSnapshot(token, selectedItems, kbId) {
  let calRaw;
  try {
    const res = await fetch(`${CALENDAR}`, { headers: auth(token) });
    calRaw = res.ok ? await (res.json() as any) : { id: 'primary', summary: 'Calendar', description: '' };
  } catch {
    calRaw = { id: 'primary', summary: 'Calendar', description: '' };
  }
  const calendar = normalizeCalendarNode(calRaw, kbId);

  let allEvents = [];
  try {
    allEvents = await listAllCalendarEvents(token);
  } catch (e) {
    console.warn('gcalNodeSnapshot: failed to list events:', e.message);
  }
  const selectedIds = new Set((selectedItems || []).map((i) => i.id).filter(Boolean));
  const rawEvents = selectedIds.size ? allEvents.filter((e) => selectedIds.has(e.id)) : allEvents;

  // One paced batch for the calendar + every event.
  const embeds = await safeEmbedBatch([
    `${calRaw.summary || 'Calendar'}\n${calRaw.description || ''}`,
    ...rawEvents.map((e) => `${e.summary || ''}\n${e.description || ''}`),
  ]);
  calendar.metadata.embedding = embeds[0];

  const events = [];
  const structuredEntities = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const e = rawEvents[i];
    try {
      const eventNode = normalizeCalendarEventNode(e, calendar.id, kbId);
      eventNode.metadata.embedding = embeds[i + 1];
      events.push(eventNode);

      const candidates = [
        ...eventNode.metadata.attendees.map((name) => ({ name, type: 'People', description: '' })),
        ...(eventNode.metadata.location ? [{ name: eventNode.metadata.location, type: 'Location', description: '' }] : []),
      ];
      if (candidates.length) structuredEntities.push({ eventId: eventNode.id, candidates });
    } catch (err) {
      console.warn(`gcalNodeSnapshot: failed to normalize event ${e.id}:`, err.message);
    }
  }
  return { calendar, events, structuredEntities };
}
