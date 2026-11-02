import { Config } from './config';
import { fuse } from './fusion';
import { ApiError, Hit, Input, Query, SearchResponse, Timings } from './types';
import { Embeddings, Upstreams } from './upstreams';

type Json = Record<string, any>;
const textFields = ['name^5', 'name.prefix', 'description^2', 'topics'];
const chunkSource = ['chunks.heading', 'chunks.body'];
const source = { excludes: ['embedding', 'chunks'] };

function phrase(value: string): Json {
  return { bool: { should: [
    { multi_match: { query: value, fields: ['name','description','topics'], type: 'phrase' } },
    { nested: { path: 'chunks', query: { match_phrase: { 'chunks.body': value } } } },
  ], minimum_should_match: 1 } };
}
export function filters(query: Query, excludeId?: string): Json {
  const p = query.parsed;
  const filter: Json[] = [];
  if (p.lang) filter.push({ term: { language: p.lang.toLowerCase() } });
  if (p.minStars !== null) filter.push({ range: { stars: { gte: p.minStars } } });
  if (p.pushedAfter) filter.push({ range: { pushedAt: { gt: p.pushedAfter } } });
  for (const topic of p.topics) filter.push({ term: { topics: topic } });
  for (const term of p.phrases) filter.push(phrase(term));
  const must_not = p.exclude.map(phrase);
  if (excludeId) must_not.push({ ids: { values: [excludeId] } });
  return { bool: { filter, must_not } };
}
export function keywordRequest(query: Query, depth: number): Json {
  const match = query.text ? { match: { 'chunks.body': query.text } } : { match_all: {} };
  return { size: depth + 1, track_total_hits: depth + 1, _source: source,
    query: { bool: { filter: [filters(query)], should: [
      ...(query.text ? [{ multi_match: { query: query.text, fields: textFields } },
                       { match: { name: { query: query.text, fuzziness: 'AUTO', max_expansions: 10 } } }] : []),
      { nested: { path: 'chunks', query: match, score_mode: 'max',
                  inner_hits: { name: 'keyword', size: 1, _source: chunkSource } } },
    ], minimum_should_match: 1 } }, sort: ['_score', { id: 'asc' }] };
}
export function semanticRequest(query: Query, vector: number[], depth: number, similarId?: string): Json {
  return { size: depth + 1, track_total_hits: depth + 1, _source: source,
    knn: { field: similarId ? 'embedding' : 'chunks.embedding', query_vector: vector,
      k: depth + 1, num_candidates: Math.min(10000, (depth + 1) * 10), filter: filters(query, similarId),
      ...(similarId ? {} : { inner_hits: { name: 'semantic', size: 1, _source: chunkSource } }),
    }, sort: ['_score', { id: 'asc' }] };
}

export class Search {
  readonly upstream: Upstreams;
  readonly embeddings: Embeddings;
  private facetCache?: { expires: number; data: Json };
  private facetPending?: Promise<Json>;
  constructor(readonly config: Config, upstream?: Upstreams,
              readonly record: (kind: string) => void = () => {}) {
    this.upstream = upstream ?? new Upstreams(config);
    this.embeddings = new Embeddings(this.upstream, record);
  }
  private async retrieve(body: Json, stage: 'bm25Ms' | 'knnMs', timings: Timings) {
    const start = performance.now();
    try { return await this.upstream.request(`/${this.config.ES_INDEX}/_search`, body); }
    catch (error) { this.record('es_error'); throw error; }
    finally { timings[stage] += performance.now() - start; }
  }
  async lists(input: Input, timings: Timings, similar?: { id: string; vector: number[] }) {
    let degradedReason: string | null = null;
    const { query, mode } = input;
    // The keyword call starts before embedding; latency is max(BM25, embed + kNN).
    const keyword = mode === 'semantic' || similar ? Promise.resolve(null) :
      this.retrieve(keywordRequest(query, this.config.MAX_DEPTH), 'bm25Ms', timings);
    const semantic = (async () => {
      if (mode === 'keyword' && !similar) return null;
      let vector = similar?.vector;
      if (!vector) {
        const start = performance.now();
        try { vector = await this.embeddings.get(query.text || query.raw); }
        catch { degradedReason = 'embedding_unavailable'; }
        finally { timings.embedMs += performance.now() - start; }
      }
      if (!vector) return null;
      return this.retrieve(semanticRequest(query, vector, this.config.MAX_DEPTH, similar?.id), 'knnMs', timings);
    })();
    let [bm25, knn] = await Promise.all([keyword, semantic]);
    if (degradedReason && mode === 'semantic') bm25 = await this.retrieve(keywordRequest(query, this.config.MAX_DEPTH), 'bm25Ms', timings);
    if (degradedReason) this.record('degraded');
    return { keyword: (bm25?.hits.hits ?? []) as Hit[], semantic: (knn?.hits.hits ?? []) as Hit[],
      keywordTotal: bm25?.hits.total?.value ?? 0, semanticTotal: knn?.hits.total?.value ?? 0, degradedReason };
  }
  async search(input: Input, timings: Timings, similar?: { id: string; vector: number[] }): Promise<SearchResponse> {
    const start = performance.now();
    const lists = await this.lists(input, timings, similar);
    const fuseStart = performance.now();
    const all = fuse(lists.keyword, lists.semantic, input.query, this.config.RRF_K);
    const depth = this.config.MAX_DEPTH;
    const capped = all.length > depth || lists.keywordTotal > depth || lists.semanticTotal > depth;
    const total = Math.min(depth, all.length);
    const results = all.slice(0, depth).slice((input.page - 1) * input.size, input.page * input.size);
    timings.fuseMs += performance.now() - fuseStart;
    return { ...input, total, ...(capped ? { totalCapped: true as const } : {}),
      tookMs: performance.now() - start + timings.parseMs, degraded: !!lists.degradedReason,
      degradedReason: lists.degradedReason, timings, results };
  }
  async compare(input: Input, timings: Timings) {
    const start = performance.now();
    const lists = await this.lists({ ...input, mode: 'hybrid' }, timings);
    const fuseStart = performance.now();
    const response = { keyword: fuse(lists.keyword, [], input.query, this.config.RRF_K).slice(0, 10),
      semantic: fuse([], lists.semantic, input.query, this.config.RRF_K).slice(0, 10),
      fused: fuse(lists.keyword, lists.semantic, input.query, this.config.RRF_K).slice(0, 10),
      tookMs: performance.now() - start + timings.parseMs, degraded: !!lists.degradedReason };
    timings.fuseMs += performance.now() - fuseStart;
    response.tookMs = performance.now() - start + timings.parseMs;
    return response;
  }
  async similar(id: string, size: number, timings: Timings) {
    const start = performance.now();
    const response = await this.upstream.request(`/${this.config.ES_INDEX}/_doc/${encodeURIComponent(id)}?_source_exclude_vectors=false&_source_includes=embedding`);
    timings.knnMs += performance.now() - start;
    const vector = response?._source?.embedding;
    if (!response.found || !Array.isArray(vector)) throw new ApiError(404, 'NOT_FOUND', 'Repository not found');
    const query: Query = { raw: id, text: '', parsed: { lang: null, minStars: null, pushedAfter: null, topics: [], phrases: [], exclude: [] } };
    const result = await this.search({ query, mode: 'semantic', page: 1, size }, timings, { id, vector });
    result.tookMs = performance.now() - start;
    return result;
  }
  async facets() {
    if (this.facetCache && this.facetCache.expires > Date.now()) return this.facetCache.data;
    if (this.facetPending) return this.facetPending;
    this.facetPending = (async () => {
      const response = await this.upstream.request(`/${this.config.ES_INDEX}/_search`, {
        size: 0, aggs: { languages: { terms: { field: 'language', size: 100 } }, topics: { terms: { field: 'topics', size: 30 } } },
      });
      const data = Object.fromEntries(['languages','topics'].map(field => [field,
        response.aggregations[field].buckets.map((b: Json) => ({ name: b.key, count: b.doc_count }))]));
      this.facetCache = { expires: Date.now() + this.config.FACET_TTL_MS, data };
      return data;
    })();
    try { return await this.facetPending; }
    finally { this.facetPending = undefined; }
  }
}
