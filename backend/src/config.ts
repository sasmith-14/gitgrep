import { z } from 'zod';
const positive = (n: number) => z.coerce.number().int().positive().default(n);
const schema = z.object({
  PORT: positive(5050), ES_URL: z.string().url().default('http://127.0.0.1:9200'),
  ES_INDEX: z.string().regex(/^[a-z][a-z0-9_-]*$/).default('gitgrep'),
  ES_API_KEY: z.string().default(''), EMBED_URL: z.string().url().default('http://127.0.0.1:6001'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  MAX_DEPTH: positive(100).pipe(z.number().max(1000)), RRF_K: positive(60),
  EMBED_DIMENSION: positive(384), EMBED_TIMEOUT_MS: positive(800), ES_TIMEOUT_MS: positive(2000),
  EMBED_CACHE_SIZE: positive(1000), FACET_TTL_MS: positive(60000),
  RATE_LIMIT: positive(120), RATE_WINDOW_MS: positive(60000),
  BREAKER_FAILURES: positive(3), BREAKER_RESET_MS: positive(10000),
  LOG_LEVEL: z.enum(['silent','fatal','error','warn','info','debug','trace']).default('info'),
});
export type Config = z.infer<typeof schema>;
export const readConfig = (env: NodeJS.ProcessEnv = process.env): Config => schema.parse(env);
