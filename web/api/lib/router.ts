/**
 * GraphRAG-style query router (Microsoft GraphRAG: Local / Global / DRIFT).
 *
 * Classifies the user's intent and selects the optimal Cognee search type:
 *   - GLOBAL  (thematic / holistic "what are the main themes")  → GRAPH_SUMMARY_COMPLETION
 *             (map-reduce over community summaries — GraphRAG Global Search)
 *   - DRIFT   (relational / multi-hop "how does X relate to Y")  → GRAPH_COMPLETION_DECOMPOSITION
 *             (decomposes into follow-up questions — GraphRAG DRIFT Search)
 *   - LOCAL   (entity-specific, the default)                     → GRAPH_COMPLETION_CONTEXT_EXTENSION
 *             (entry entities + neighbour expansion — GraphRAG Local Search)
 *
 * This routes each question to the retrieval strategy GraphRAG shows is best for
 * it, instead of using one search type for everything.
 */

const GLOBAL = /\b(themes?|overview|summar(y|ise|ize)|main|across|overall|trends?|risks?|priorit(y|ies)|landscape|big picture|everything|patterns?|insights?|what'?s happening|high[- ]?level|in general|state of)\b/i;
const DRIFT = /\b(relate[ds]?|relationship|connect(ed|s|ion)?|how does|how do|why|impact|depend|trace|link(ed|s)?|between|tie[ds]? (in|to)|affect)\b/i;

export function routeQuery(query) {
  const q = String(query || '');
  if (GLOBAL.test(q)) return { searchType: 'GRAPH_SUMMARY_COMPLETION', mode: 'global' };
  if (DRIFT.test(q)) return { searchType: 'GRAPH_COMPLETION_DECOMPOSITION', mode: 'drift' };
  return { searchType: 'GRAPH_COMPLETION_CONTEXT_EXTENSION', mode: 'local' };
}
