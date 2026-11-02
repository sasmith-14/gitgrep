import { Config } from './config';
import { ApiError } from './types';

export class Upstreams {
  constructor(readonly config: Config, readonly fetcher: typeof fetch = fetch) {}
  async request(path: string, body?: unknown, embedding = false): Promise<any> {
    const c = this.config;
    try {
      const response = await this.fetcher((embedding ? c.EMBED_URL : c.ES_URL).replace(/\/$/, '') + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...(!embedding && c.ES_API_KEY ? { authorization: `ApiKey ${c.ES_API_KEY}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(embedding ? c.EMBED_TIMEOUT_MS : c.ES_TIMEOUT_MS),
      });
      if (response.status === 404 && !embedding) throw new ApiError(404, 'NOT_FOUND', 'Repository or index not found');
      if (!response.ok) throw new Error('upstream response failed');
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const timeout = error instanceof Error && ['TimeoutError','AbortError'].includes(error.name);
      throw new ApiError(timeout ? 504 : 502, timeout ? 'UPSTREAM_TIMEOUT' : 'INTERNAL', timeout ? 'Upstream timed out' : 'Upstream unavailable');
    }
  }
}

export class Embeddings {
  readonly cache = new Map<string, number[]>();
  readonly pending = new Map<string, Promise<number[]>>();
  failures = 0;
  openUntil = 0;
  private probing = false;
  constructor(readonly upstream: Upstreams, readonly record: (kind: string) => void = () => {}) {}
  async get(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) { this.cache.delete(text); this.cache.set(text, cached); this.record('hit'); return cached; }
    this.record('miss');
    const existing = this.pending.get(text);
    if (existing) return existing;
    if (Date.now() < this.openUntil || this.probing) throw new Error('embedding circuit open');
    if (this.openUntil) this.probing = true;
    const promise = this.load(text);
    this.pending.set(text, promise);
    try { return await promise; }
    finally { this.pending.delete(text); this.probing = false; }
  }
  private async load(text: string): Promise<number[]> {
    const c = this.upstream.config;
    try {
      const data = await this.upstream.request('/embed', { texts: [text] }, true);
      const vector = data?.embeddings?.[0];
      if (!Array.isArray(vector) || vector.length !== c.EMBED_DIMENSION || !vector.every(x => typeof x === 'number' && Number.isFinite(x))) throw new Error('invalid embedding');
      const norm = Math.sqrt(vector.reduce((s: number,x: number) => s + x*x, 0));
      if (Math.abs(norm - 1) > 0.01) throw new Error('embedding must be normalized');
      this.failures = 0; this.openUntil = 0;
      this.cache.set(text, vector);
      while (this.cache.size > c.EMBED_CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
      return vector;
    } catch (error) {
      this.record('embedding_error');
      if (++this.failures >= c.BREAKER_FAILURES) this.openUntil = Date.now() + c.BREAKER_RESET_MS;
      throw error;
    }
  }
}
