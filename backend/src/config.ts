import { z } from 'zod';
const positive = (n: number) => z.coerce.number().int().positive().default(n);
const httpUrl = z.string().url().refine(s => ['http:','https:'].includes(new URL(s).protocol));
const schema = z.object({
  PORT: positive(5050).pipe(z.number().max(65535)), ES_URL: httpUrl.default('http://127.0.0.1:9200'),
  ES_INDEX: z.string().regex(/^[a-z][a-z0-9_-]*$/).default('gitgrep'),
  ES_API_KEY: z.string().default(''), EMBED_URL: httpUrl.default('http://127.0.0.1:6001'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
  CORS_ORIGIN: httpUrl.default('http://localhost:5173'),
  MAX_DEPTH: positive(100).pipe(z.number().max(1000)), RRF_K: positive(60),
  SEARCH_STRATEGY: z.enum(['chunks', 'balanced']).default('chunks'),
  REPO_CANDIDATES: positive(200).pipe(z.number().max(2000)),
  EMBED_DIMENSION: positive(384), EMBED_TIMEOUT_MS: positive(800), ES_TIMEOUT_MS: positive(2000),
  EMBED_CACHE_SIZE: positive(1000), FACET_TTL_MS: positive(60000),
  RATE_LIMIT: positive(120), RATE_WINDOW_MS: positive(60000),
  BREAKER_FAILURES: positive(3), BREAKER_RESET_MS: positive(10000),
  LOG_LEVEL: z.enum(['silent','fatal','error','warn','info','debug','trace']).default('info'),
});
export type Config = z.infer<typeof schema>;
export const readConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
