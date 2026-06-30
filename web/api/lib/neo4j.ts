/// <reference types="node" />
import neo4j, { type Driver, type Session } from 'neo4j-driver';

let _driver: Driver | null = null;

export function configured(): boolean {
  return !!(process.env.NEO4J_URI && process.env.NEO4J_PASSWORD);
}


export function getDriver(): Driver {
  if (!_driver) {
    const uri = process.env.NEO4J_URI!;
    // Accept both NEO4J_USERNAME (Aura default) and NEO4J_USER
    const user = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD!;
    if (!uri || !password) throw new Error('NEO4J_URI and NEO4J_PASSWORD env vars are required');
    _driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 10_000,
    });
  }
  return _driver;
}

export async function runCypher(cypher: string, params: Record<string, any> = {}): Promise<any[]> {
  const session: Session = getDriver().session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject());
  } finally {
    await session.close();
  }
}

const VECTOR_INDEX_OPTIONS = `OPTIONS {indexConfig: {\`vector.dimensions\`: 3072, \`vector.similarity_function\`: 'cosine'}}`;

/** One-time schema setup — vector + full-text indexes. Safe to call on every startup. */
export async function ensureSchema(): Promise<void> {
  if (!configured()) return;
  const session = getDriver().session();
  const vi = async (name: string, label: string, prop: string) => {
    await session.run(
      `CREATE VECTOR INDEX ${name} IF NOT EXISTS FOR (n:${label}) ON n.${prop} ${VECTOR_INDEX_OPTIONS}`
    ).catch(() => {});
  };
  try {
    await vi('chunk_embedding',         'Chunk',         'embedding');
    await vi('entity_embedding',        'Entity',        'embedding');
    await vi('pr_embedding',            'PR',            'embedding');
    await vi('issue_embedding',         'Issue',         'embedding');
    await vi('commit_embedding',        'Commit',        'embedding');
    await vi('prcomment_embedding',     'PRComment',     'embedding');
    await vi('file_embedding',          'File',          'embedding');
    await vi('calendar_embedding',      'Calendar',      'embedding');
    await vi('calendarEvent_embedding', 'CalendarEvent', 'embedding');
    await vi('personalMemory_embedding','PersonalMemory','embedding');

    await session.run(
      `CREATE FULLTEXT INDEX chunk_text IF NOT EXISTS FOR (c:Chunk) ON EACH [c.chunk_text_content]`
    ).catch(() => {});
    await session.run(
      `CREATE FULLTEXT INDEX file_text IF NOT EXISTS FOR (f:File) ON EACH [f.file_text_content]`
    ).catch(() => {});
  } finally {
    await session.close();
  }
}
