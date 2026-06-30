/// <reference types="node" />
/**
 * Knowledge graph store — Neo4j backend.
 *
 * Graph schema (graph.json):
 *
 *   (:KnowledgeBase {kb_id, name})
 *     -[:HAS_DOC]->      (:Document  {kb_id, name, description})
 *                           -[:HAS_CHUNK]-> (:Chunk {chunk_id, chunk_text_content, embedding, summary, index, kb_id})
 *                                              -[:NEXT]->        (:Chunk)
 *                                              -[:PREVIOUS]->    (:Chunk)
 *                                              -[:HAS_ENTITY]->  (:Entity {name, description, embedding, type, kb_id})
 *     -[:HAS_REPO]->     (:Repo    {id, repo_id, name, owner, description, kb_id})
 *                           -[:HAS_PR]->      (:PR      {id, number, title, pr_text_content, pr_description, embedding, kb_id})
 *                                                -[:HAS_COMMENT]-> (:PRComment {id, comment, owner, embedding, kb_id})
 *                                                -[:HAS_ENTITY]->  (:Entity)
 *                           -[:HAS_ISSUE]->   (:Issue   {id, number, title, issue_text_content, embedding, kb_id})
 *                                                -[:HAS_ENTITY]->  (:Entity)
 *                           -[:HAS_COMMIT]->  (:Commit  {id, sha, commit_text_content, embedding, kb_id})
 *                                                -[:HAS_ENTITY]->  (:Entity)
 *                           -[:HAS_FILE]->    (:File    {id, file_type, file_text_content, embedding, kb_id})
 *                                                -[:HAS_ENTITY]->  (:Entity)
 *     -[:HAS_CALENDAR]-> (:Calendar {id, calender_id, name, description, embedding, kb_id})
 *                           -[:HAS_EVENT]->   (:CalendarEvent {id, name, description, date, time, embedding, kb_id})
 *                                                -[:HAS_ENTITY]->  (:Entity)
 *
 *   (:Entity {name, description, embedding, type, kb_id})
 *     type values: People | Organisation | Product | Location | Concept | Technology | Event
 *   (:Entity)-[:RELATES_TO {description}]->(:Entity)   (co-occurrence within same chunk/PR/Issue)
 *
 * Embeddings: gemini-embedding-001 (3072 dims)
 *   Chunk.embedding      = embed(chunk_text_content)
 *   Entity.embedding     = embed(name + ' ' + description)
 *   PR.embedding         = embed(pr_text_content)
 *   Issue.embedding      = embed(issue_text_content)
 *   Commit.embedding     = embed(commit_text_content)
 *   PRComment.embedding  = embed(comment)
 */

import { configured, runCypher, ensureSchema } from './lib/neo4j.js';
import { embed, embedBatch, chunkText } from './lib/embeddings.js';

ensureSchema().catch((e: any) => console.warn('Neo4j schema setup warning:', e.message));

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return 'xxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

export function userDataset(userId: string): string {
  return `hypr_user_${String(userId || 'anon').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
}
export function kbDataset(kbId: string): string {
  return `hypr_kb_${String(kbId || 'unknown').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
}
export async function resolveDatasetId(userId: string, kbId?: string): Promise<string | null> {
  return kbId ? kbDataset(kbId) : userDataset(userId);
}

// ── Entity extraction ─────────────────────────────────────────────────────────

interface ExtractedEntity { name: string; description: string; type: string }

async function extractEntities(text: string, groqKey: string): Promise<ExtractedEntity[]> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'Extract key named entities from the text. Return ONLY a valid JSON array, no explanation.\n' +
              'Each item: {"name":"...","description":"one sentence","type":"People|Organisation|Product|Location|Concept|Technology|Event"}.\n' +
              'Limit to the 5 most important entities.',
          },
          { role: 'user', content: text.slice(0, 2000) },
        ],
        temperature: 0,
        max_tokens: 400,
      }),
    });
    if (!res.ok) return [];
    const data = await (res.json() as any);
    const raw = data.choices?.[0]?.message?.content || '';
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed)
      ? parsed.slice(0, 5).filter((e: any) => e?.name && e?.description)
      : [];
  } catch { return []; }
}

/** Create Entity nodes from extracted entities, link to a parent node, add RELATES_TO edges. */
async function writeEntities(
  entities: ExtractedEntity[],
  parentCypher: string, // e.g. `(p:Chunk {chunk_id: $parentId, kb_id: $kbId})`
  parentParams: Record<string, any>,
  kbId: string,
  userId: string,
): Promise<void> {
  if (!entities.length) return;
  const now = new Date().toISOString();
  const entityTexts = entities.map((e) => `${e.name} ${e.description}`);
  const embeddings = await embedBatch(entityTexts, 'RETRIEVAL_DOCUMENT');

  const rows = entities.map((e, i) => ({
    id: uid(), name: e.name, description: e.description, type: e.type || 'Concept',
    embedding: embeddings[i], kb_id: kbId, userId, createdAt: now,
  }));

  await runCypher(
    `MATCH ${parentCypher}
     UNWIND $rows AS row
     MERGE (e:Entity {name: row.name, kb_id: $kbId})
     ON CREATE SET e.id = row.id, e.description = row.description, e.type = row.type,
                   e.embedding = row.embedding, e.userId = row.userId, e.createdAt = row.createdAt
     CREATE (p)-[:HAS_ENTITY]->(e)`,
    { ...parentParams, kbId, rows },
  );

  if (rows.length > 1) {
    const pairs = rows.flatMap((a, i) =>
      rows.slice(i + 1).map((b) => ({ a: a.name, b: b.name, desc: 'co-occur' }))
    );
    await runCypher(
      `UNWIND $pairs AS p
       MATCH (a:Entity {name: p.a, kb_id: $kbId})
       MATCH (b:Entity {name: p.b, kb_id: $kbId})
       MERGE (a)-[:RELATES_TO {description: p.desc}]->(b)`,
      { kbId, pairs },
    ).catch(() => {});
  }
}

// ── 1. Ingest ─────────────────────────────────────────────────────────────────

/**
 * Stage text into Neo4j:
 *   KnowledgeBase -[HAS_DOC]-> Document -[HAS_CHUNK]-> Chunk -[NEXT/PREVIOUS]-> Chunk
 *                                                       Chunk -[HAS_ENTITY]-> Entity
 *
 * opts.docName / opts.docId  — optionally attach to a named Document node.
 */
export async function addText(
  text: string,
  { userId, kbId, nodeSet, docName, docId }: any = {},
): Promise<{ chunks: number; entities: number } | null> {
  if (!configured() || !text?.trim()) return null;

  try {
    const rawChunks = chunkText(text);
    if (!rawChunks.length) return null;

    const groqKey = process.env.GROQ_API_KEY || '';
    const now = new Date().toISOString();
    const kbNodeId = kbId || '__global__';
    const userNodeId = userId || 'anon';
    const docNodeId = docId || uid();
    const docNodeName = docName || rawChunks[0].split('\n')[0].slice(0, 120);

    const chunkEmbeddings = await embedBatch(rawChunks, 'RETRIEVAL_DOCUMENT');

    const chunkRows = rawChunks.map((t, i) => ({
      chunk_id: uid(), chunk_text_content: t, embedding: chunkEmbeddings[i],
      summary: '', index: i, kb_id: kbNodeId, userId: userNodeId,
      source: Array.isArray(nodeSet) ? nodeSet.join(',') : (nodeSet || ''),
      createdAt: now,
    }));

    // Ensure KnowledgeBase + Document nodes exist, then create all Chunks.
    await runCypher(
      `MERGE (kb:KnowledgeBase {kb_id: $kbId})
       ON CREATE SET kb.name = $kbId, kb.userId = $userId, kb.createdAt = $now
       MERGE (doc:Document {id: $docId, kb_id: $kbId})
       ON CREATE SET doc.name = $docName, doc.description = '', doc.userId = $userId, doc.createdAt = $now
       MERGE (kb)-[:HAS_DOC]->(doc)
       WITH doc
       UNWIND $chunks AS row
       CREATE (c:Chunk {
         chunk_id: row.chunk_id, chunk_text_content: row.chunk_text_content,
         embedding: row.embedding, summary: row.summary, index: row.index,
         kb_id: row.kb_id, userId: row.userId, source: row.source, createdAt: row.createdAt
       })
       CREATE (doc)-[:HAS_CHUNK]->(c)`,
      { kbId: kbNodeId, userId: userNodeId, docId: docNodeId, docName: docNodeName, now, chunks: chunkRows },
    );

    // Wire NEXT / PREVIOUS between sequential chunks.
    if (chunkRows.length > 1) {
      await runCypher(
        `UNWIND $pairs AS pair
         MATCH (a:Chunk {chunk_id: pair.from, kb_id: $kbId})
         MATCH (b:Chunk {chunk_id: pair.to,   kb_id: $kbId})
         CREATE (a)-[:NEXT]->(b)
         CREATE (b)-[:PREVIOUS]->(a)`,
        {
          kbId: kbNodeId,
          pairs: chunkRows.slice(0, -1).map((c, i) => ({ from: c.chunk_id, to: chunkRows[i + 1].chunk_id })),
        },
      );
    }

    // Extract entities per chunk (requires Groq).
    let totalEntities = 0;
    if (groqKey) {
      for (const chunk of chunkRows) {
        const entities = await extractEntities(chunk.chunk_text_content, groqKey);
        if (!entities.length) continue;
        await writeEntities(
          entities,
          `(p:Chunk {chunk_id: $parentId, kb_id: $kbId})`,
          { parentId: chunk.chunk_id },
          kbNodeId, userNodeId,
        );
        totalEntities += entities.length;
      }
    }

    return { chunks: chunkRows.length, entities: totalEntities };
  } catch (e: any) {
    console.warn('Neo4j addText error:', e.message);
    return null;
  }
}

export async function ingest(text: string, opts: any = {}): Promise<any> {
  return addText(text, opts);
}

export async function cognify(_userId: string, _opts: any = {}): Promise<null> {
  return null;
}

/**
 * Ingest a structured GitHub entity following the graph.json schema.
 * PRComment nodes have their text embedded directly.
 */
export async function ingestGitHubEntity(
  type: 'Repo' | 'PR' | 'Issue' | 'Commit' | 'PRComment' | 'File' | 'Calendar' | 'CalendarEvent',
  props: Record<string, any>,
  { kbId, userId, repoId, prId, calendarId }: { kbId: string; userId: string; repoId?: string; prId?: string; calendarId?: string },
): Promise<void> {
  if (!configured()) return;
  const kbNodeId = kbId || '__global__';
  const now = new Date().toISOString();
  const groqKey = process.env.GROQ_API_KEY || '';

  try {
    if (type === 'Repo') {
      await runCypher(
        `MERGE (kb:KnowledgeBase {kb_id: $kbId})
         MERGE (r:Repo {id: $id, kb_id: $kbId})
         ON CREATE SET r += $props, r.createdAt = $now
         MERGE (kb)-[:HAS_REPO]->(r)`,
        { kbId: kbNodeId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, now },
      );
    } else if (type === 'PR' && repoId) {
      const prText = `${props.title || ''} ${props.pr_description || ''}`.trim();
      const embedding = prText ? await embed(prText, 'RETRIEVAL_DOCUMENT') : [];
      await runCypher(
        `MERGE (r:Repo {id: $repoId, kb_id: $kbId})
         MERGE (p:PR {id: $id, kb_id: $kbId})
         ON CREATE SET p += $props, p.embedding = $embedding, p.createdAt = $now
         MERGE (r)-[:HAS_PR]->(p)`,
        { kbId: kbNodeId, repoId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, embedding, now },
      );
      if (groqKey && prText) {
        const entities = await extractEntities(prText, groqKey);
        if (entities.length) await writeEntities(entities, `(p:PR {id: $parentId, kb_id: $kbId})`, { parentId: props.id }, kbNodeId, userId);
      }
    } else if (type === 'Issue' && repoId) {
      const issueText = `${props.title || ''} ${props.issue_text_content || ''}`.trim();
      const embedding = issueText ? await embed(issueText, 'RETRIEVAL_DOCUMENT') : [];
      await runCypher(
        `MERGE (r:Repo {id: $repoId, kb_id: $kbId})
         MERGE (i:Issue {id: $id, kb_id: $kbId})
         ON CREATE SET i += $props, i.embedding = $embedding, i.createdAt = $now
         MERGE (r)-[:HAS_ISSUE]->(i)`,
        { kbId: kbNodeId, repoId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, embedding, now },
      );
      if (groqKey && issueText) {
        const entities = await extractEntities(issueText, groqKey);
        if (entities.length) await writeEntities(entities, `(i:Issue {id: $parentId, kb_id: $kbId})`, { parentId: props.id }, kbNodeId, userId);
      }
    } else if (type === 'Commit' && repoId) {
      const commitText = (props.commit_text_content || props.message || '').trim();
      const embedding = commitText ? await embed(commitText, 'RETRIEVAL_DOCUMENT') : [];
      await runCypher(
        `MERGE (r:Repo {id: $repoId, kb_id: $kbId})
         MERGE (cm:Commit {id: $id, kb_id: $kbId})
         ON CREATE SET cm += $props, cm.embedding = $embedding, cm.createdAt = $now
         MERGE (r)-[:HAS_COMMIT]->(cm)`,
        { kbId: kbNodeId, repoId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, embedding, now },
      );
      if (groqKey && commitText) {
        const entities = await extractEntities(commitText, groqKey);
        if (entities.length) await writeEntities(entities, `(cm:Commit {id: $parentId, kb_id: $kbId})`, { parentId: props.id }, kbNodeId, userId);
      }
    } else if (type === 'PRComment' && prId) {
      const commentText = (props.comment || '').trim();
      const embedding = commentText ? await embed(commentText, 'RETRIEVAL_DOCUMENT') : [];
      await runCypher(
        `MERGE (pr:PR {id: $prId, kb_id: $kbId})
         MERGE (cmt:PRComment {id: $id, kb_id: $kbId})
         ON CREATE SET cmt += $props, cmt.embedding = $embedding, cmt.createdAt = $now
         MERGE (pr)-[:HAS_COMMENT]->(cmt)`,
        { kbId: kbNodeId, prId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, embedding, now },
      );
    } else if (type === 'File' && repoId) {
      const fileText = (props.file_text_content || '').trim();
      const embedding = fileText ? await embed(fileText.slice(0, 8000), 'RETRIEVAL_DOCUMENT') : [];
      await runCypher(
        `MERGE (r:Repo {id: $repoId, kb_id: $kbId})
         MERGE (f:File {id: $id, kb_id: $kbId})
         ON CREATE SET f += $props, f.embedding = $embedding, f.createdAt = $now
         MERGE (r)-[:HAS_FILE]->(f)`,
        { kbId: kbNodeId, repoId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, embedding, now },
      );
      if (groqKey && fileText) {
        const entities = await extractEntities(fileText, groqKey);
        if (entities.length) await writeEntities(entities, `(f:File {id: $parentId, kb_id: $kbId})`, { parentId: props.id }, kbNodeId, userId);
      }
    } else if (type === 'Calendar') {
      const calText = `${props.name || ''} ${props.description || ''}`.trim();
      const embedding = calText ? await embed(calText, 'RETRIEVAL_DOCUMENT') : [];
      await runCypher(
        `MERGE (kb:KnowledgeBase {kb_id: $kbId})
         MERGE (c:Calendar {id: $id, kb_id: $kbId})
         ON CREATE SET c += $props, c.embedding = $embedding, c.createdAt = $now
         MERGE (kb)-[:HAS_CALENDAR]->(c)`,
        { kbId: kbNodeId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, embedding, now },
      );
    } else if (type === 'CalendarEvent' && calendarId) {
      const evtText = `${props.name || ''} ${props.description || ''}`.trim();
      const embedding = evtText ? await embed(evtText, 'RETRIEVAL_DOCUMENT') : [];
      await runCypher(
        `MERGE (c:Calendar {id: $calendarId, kb_id: $kbId})
         MERGE (evt:CalendarEvent {id: $id, kb_id: $kbId})
         ON CREATE SET evt += $props, evt.embedding = $embedding, evt.createdAt = $now
         MERGE (c)-[:HAS_EVENT]->(evt)`,
        { kbId: kbNodeId, calendarId, id: props.id || uid(), props: { ...props, kb_id: kbNodeId, userId }, embedding, now },
      );
      if (groqKey && evtText) {
        const entities = await extractEntities(evtText, groqKey);
        if (entities.length) await writeEntities(entities, `(evt:CalendarEvent {id: $parentId, kb_id: $kbId})`, { parentId: props.id }, kbNodeId, userId);
      }
    }
  } catch (e: any) {
    console.warn(`Neo4j ingestGitHubEntity(${type}) error:`, e.message);
  }
}

// ── 2. Search ─────────────────────────────────────────────────────────────────

export async function vectorSearch(
  query: string,
  { userId, kbId, topK: rawTopK = 10 }: any = {},
): Promise<string[]> {
  const topK = Math.floor(rawTopK);
  if (!configured() || !query?.trim()) return [];
  try {
    const queryEmbedding = await embed(query, 'RETRIEVAL_QUERY');
    const records = await runCypher(
      `CALL db.index.vector.queryNodes('chunk_embedding', $topK, $embedding)
       YIELD node AS c, score
       WHERE ($kbId = '' OR c.kb_id = $kbId)
         AND ($userId = '' OR c.userId = $userId)
       OPTIONAL MATCH (prev:Chunk)-[:NEXT]->(c)
       OPTIONAL MATCH (c)-[:NEXT]->(nxt:Chunk)
       RETURN prev.chunk_text_content AS prevText,
              c.chunk_text_content    AS text,
              nxt.chunk_text_content  AS nextText,
              score
       ORDER BY score DESC LIMIT $topK`,
      { topK: topK * 2, embedding: queryEmbedding, kbId: kbId || '', userId: userId || '' },
    );
    return [...new Set(
      records.map((r: any) => [r.prevText, r.text, r.nextText].filter(Boolean).join('\n')).filter(Boolean)
    )];
  } catch (e: any) {
    console.warn('Neo4j vectorSearch error:', e.message);
    return [];
  }
}

export async function graphSearch(
  query: string,
  { userId, kbId, topK: rawTopK = 10 }: any = {},
): Promise<string | null> {
  const topK = Math.floor(rawTopK);
  if (!configured() || !query?.trim()) return null;
  try {
    const escaped = query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
    const records = await runCypher(
      `CALL db.index.fulltext.queryNodes('chunk_text', $query)
       YIELD node AS c, score
       WHERE ($kbId = '' OR c.kb_id = $kbId)
         AND ($userId = '' OR c.userId = $userId)
       OPTIONAL MATCH (c)-[:HAS_ENTITY]->(e:Entity)-[:RELATES_TO]-(re:Entity)
                                          <-[:HAS_ENTITY]-(rc:Chunk {kb_id: c.kb_id})
       RETURN c.chunk_text_content AS text, score,
              collect(DISTINCT rc.chunk_text_content)[..2] AS relatedChunks
       ORDER BY score DESC LIMIT $topK`,
      { query: escaped, kbId: kbId || '', userId: userId || '', topK },
    );
    const parts = records.map((r: any) => {
      let t = r.text || '';
      const related = (r.relatedChunks as string[] || []).filter(Boolean);
      if (related.length) t += '\n[Related]: ' + related.join(' | ');
      return t;
    }).filter(Boolean);
    return parts.length ? [...new Set(parts)].join('\n\n') : null;
  } catch (e: any) {
    console.warn('Neo4j graphSearch error:', e.message);
    return null;
  }
}

function rrfMerge(a: string[], b: string[], k = 60): string[] {
  const scores = new Map<string, number>();
  a.forEach((t, i) => scores.set(t, (scores.get(t) || 0) + 1 / (k + i + 1)));
  b.forEach((t, i) => scores.set(t, (scores.get(t) || 0) + 1 / (k + i + 1)));
  return [...scores.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t);
}

export async function hybridSearch(query: string, { userId, kbId, topK = 10 }: any = {}): Promise<string | null> {
  if (!configured() || !query?.trim()) return null;
  const opts = { userId, kbId, topK };
  const [graphResult, vectorResults] = await Promise.all([graphSearch(query, opts), vectorSearch(query, opts)]);
  const graphParts = graphResult ? graphResult.split('\n\n').filter((s) => s.trim()) : [];
  const merged = rrfMerge(graphParts, vectorResults);
  return merged.length ? merged.join('\n\n') : null;
}

export async function multiHopSearch(query: string, { userId, kbId, topK = 10, groqKey }: any = {}): Promise<string | null> {
  if (!configured() || !query?.trim()) return null;
  let subQueries: string[] = [query];
  if (groqKey && query.trim().split(/\s+/).length >= 4) {
    try {
      const decomRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'Decompose the user question into 1–3 short, specific retrieval sub-questions. Return ONLY a valid JSON array of strings, no explanation, no markdown.' },
            { role: 'user', content: query },
          ],
          temperature: 0, max_tokens: 200,
        }),
      });
      if (decomRes.ok) {
        const d = await (decomRes.json() as any);
        const match = (d.choices?.[0]?.message?.content || '').match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length) subQueries = parsed.slice(0, 3).map(String).filter(Boolean);
        }
      }
    } catch (e: any) { console.warn('Query decomposition failed:', e.message); }
  }
  const opts = { userId, kbId, topK: Math.ceil(topK / subQueries.length) + 3 };
  const results = await Promise.all(subQueries.map((q) => hybridSearch(q, opts)));
  const unique = [...new Set(results.filter((r): r is string => !!r).flatMap((r) => r.split('\n\n').filter((s) => s.trim())))];
  return unique.length ? unique.join('\n\n') : null;
}

// ── 3. Graph visualisation ────────────────────────────────────────────────────

export async function getDatasetGraph(userId: string, kbId?: string): Promise<{ nodes: any[]; edges: any[] } | null> {
  if (!configured()) return null;
  try {
    // Collect all nodes and relationships up to 3 hops from KnowledgeBase.
    // labels(n) gives the actual Neo4j node labels (e.g. ["Repo"], ["Chunk"]).
    const records = await runCypher(
      `MATCH (kb:KnowledgeBase)
       WHERE ($kbId = '' OR kb.kb_id = $kbId)
       WITH kb LIMIT 5
       MATCH p = (kb)-[*1..3]->(n)
       RETURN labels(kb) AS kbLabels, kb.kb_id AS kbId, kb.name AS kbName,
              labels(n)  AS nodeLabels, n.id AS nId, n.chunk_id AS nChunkId,
              n.kb_id AS nKbId, n AS nodeProps,
              [r IN relationships(p) | {type: type(r), startId: startNode(r).id, endId: endNode(r).id,
               startChunkId: startNode(r).chunk_id, endChunkId: endNode(r).chunk_id,
               startKbId: startNode(r).kb_id, endKbId: endNode(r).kb_id}] AS rels
       LIMIT 600`,
      { kbId: kbId || '', userId },
    );

    const nodeMap = new Map<string, any>();
    const edgeSet = new Set<string>();
    const edges: any[] = [];

    const nodeLabel = (labels: string[]): string =>
      (labels || []).find((l) => l !== 'Entity') || labels?.[0] || 'Node';

    const addNode = (labels: string[], props: any) => {
      const p = props?.properties || props || {};
      const id = p.id || p.chunk_id || p.kb_id;
      if (!id || nodeMap.has(id)) return;
      const primaryLabel = nodeLabel(labels);
      nodeMap.set(id, {
        id,
        type: primaryLabel,
        labels: labels || [],
        label: p.name || p.title || p.chunk_text_content?.split('\n')[0]?.slice(0, 60) || primaryLabel,
        properties: p,
      });
    };

    const addEdge = (src: string | null, tgt: string | null, relType: string) => {
      if (!src || !tgt || src === tgt) return;
      const key = `${src}-${relType}-${tgt}`;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edges.push({ source: src, target: tgt, label: relType });
    };

    for (const rec of records) {
      // Add KnowledgeBase node
      const kbNodeId = rec.kbId;
      if (kbNodeId && !nodeMap.has(kbNodeId)) {
        nodeMap.set(kbNodeId, {
          id: kbNodeId, type: 'KnowledgeBase', labels: ['KnowledgeBase'],
          label: rec.kbName || kbNodeId, properties: { kb_id: kbNodeId, name: rec.kbName },
        });
      }

      // Add the leaf node
      if (rec.nodeProps) addNode(rec.nodeLabels || [], rec.nodeProps);

      // Walk relationships and add edges
      const rels: any[] = rec.rels || [];
      for (const r of rels) {
        const srcId = r.startId || r.startChunkId || (r.startKbId === kbNodeId ? kbNodeId : null);
        const tgtId = r.endId || r.endChunkId || (r.endKbId !== kbNodeId ? r.endKbId : null);
        addEdge(srcId, tgtId, r.type);
      }
    }

    return { nodes: [...nodeMap.values()], edges };
  } catch (e: any) {
    console.warn('Neo4j getDatasetGraph error:', e.message);
    return null;
  }
}

// ── 4. Personal memory ────────────────────────────────────────────────────────

export async function rememberMemory(text: string, { userId }: any = {}): Promise<any> {
  if (!configured() || !text?.trim()) return null;
  try {
    const embedding = await embed(text, 'RETRIEVAL_DOCUMENT');
    await runCypher(
      `CREATE (m:PersonalMemory {id: $id, text: $text, embedding: $embedding, userId: $userId, createdAt: $now})`,
      { id: uid(), text, embedding, userId: userId || 'anon', now: new Date().toISOString() },
    );
    return { ok: true };
  } catch (e: any) { console.warn('Neo4j rememberMemory error:', e.message); return null; }
}

export async function recallMemory(query: string, { userId }: any = {}): Promise<string | null> {
  if (!configured() || !query?.trim()) return null;
  try {
    const queryEmbedding = await embed(query, 'RETRIEVAL_QUERY');
    const records = await runCypher(
      `CALL db.index.vector.queryNodes('personalMemory_embedding', 5, $embedding)
       YIELD node AS m, score
       WHERE m.userId = $userId AND score > 0.75
       RETURN m.text AS text`,
      { userId: userId || 'anon', embedding: queryEmbedding },
    );
    const texts = records.map((r: any) => r.text).filter(Boolean);
    return texts.length ? texts.join('\n') : null;
  } catch (e: any) { console.warn('Neo4j recallMemory error:', e.message); return null; }
}

// ── Back-compat shims ─────────────────────────────────────────────────────────

export async function rememberText(text: string, opts: any = {}): Promise<any> {
  return ingest(text, { userId: opts.userId, nodeSet: opts.nodeSet });
}
export async function recall(query: string, opts: any = {}): Promise<string | null> {
  return graphSearch(query, { userId: opts?.userId });
}

export function formatConnectorPayload(kbId: string, userId: string, userEmail: string, platform: string, selectedItems: { name: string; meta?: string }[]): string {
  const platformNames: Record<string, string> = {
    github: 'GitHub', gdocs: 'Google Docs', gslides: 'Google Slides',
    gsheets: 'Google Sheets', gcal: 'Google Calendar', jira: 'Jira',
    slack: 'Slack', salesforce: 'Salesforce',
  };
  const name = platformNames[platform] || platform;
  const itemLines = selectedItems.map((i) => `  - ${i.name}${i.meta ? ` [${i.meta}]` : ''}`).join('\n');
  return [
    `# hypr Knowledge Source: ${name}`, `Knowledge Base ID: ${kbId}`,
    `User: ${userEmail}  |  User ID: ${userId}`, `Connected at: ${new Date().toISOString()}`,
    ``, `The following ${name} items are authorized for ingestion into the knowledge graph:`, ``, itemLines,
  ].join('\n');
}
