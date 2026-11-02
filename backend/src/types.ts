export type Mode = 'keyword' | 'semantic' | 'hybrid';
export type Parsed = { lang: string | null; minStars: number | null; pushedAfter: string | null; topics: string[]; phrases: string[]; exclude: string[] };
export type Query = { raw: string; text: string; parsed: Parsed };
export type Input = { query: Query; mode: Mode; page: number; size: number };
export type Timings = { parseMs: number; embedMs: number; bm25Ms: number; knnMs: number; fuseMs: number };
export const timings = (): Timings => ({ parseMs: 0, embedMs: 0, bm25Ms: 0, knnMs: 0, fuseMs: 0 });
export type Chunk = { heading: string; body: string };
export type Repo = { id: string; fullName: string; name: string; url: string; description: string; language: string; stars: number; pushedAt: string; topics: string[]; embedding?: number[]; chunks?: Chunk[] };
export type Hit = { _id: string; _score: number; _source: Repo; inner_hits?: Record<string, { hits: { hits: { _source: Chunk; _score: number }[] } }> };
export type Result = Omit<Repo, 'name' | 'embedding' | 'chunks'> & {
  match: { heading: string; passage: string; highlights: [number, number][] } | null;
  explain: { keywordRank: number | null; semanticRank: number | null; fusedScore: number; cosine: number | null };
};
export type SearchResponse = { query: Query; mode: Mode; page: number; size: number; total: number; totalCapped?: true; tookMs: number; degraded: boolean; degradedReason: string | null; timings: Timings; results: Result[] };
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterMs: number | null = null) { super(message); }
}
