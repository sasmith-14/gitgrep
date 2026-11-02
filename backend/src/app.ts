import { randomUUID } from 'node:crypto';
import express, { ErrorRequestHandler, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pino from 'pino';
import { Counter, Histogram, Registry } from 'prom-client';
import { Config } from './config';
import { Search } from './search';
import { validateInput, validateSize } from './query';
import { ApiError, Timings, timings } from './types';

export function createApp(config: Config, supplied?: Search) {
  const app = express();
  const logger = pino({ level: config.LOG_LEVEL });
  const registry = new Registry();
  const events = new Counter({ name: 'gitgrep_events_total', help: 'Cache, degradation and upstream events', labelNames: ['kind'], registers: [registry] });
  const requests = new Counter({ name: 'gitgrep_requests_total', help: 'HTTP responses', labelNames: ['route','status'], registers: [registry] });
  const latency = new Histogram({ name: 'gitgrep_stage_seconds', help: 'Request stage latency', labelNames: ['stage'], buckets: [.001,.005,.01,.025,.05,.1,.25,.5,1,2,5], registers: [registry] });
  const search = supplied ?? new Search(config, undefined, kind => events.inc({ kind }));
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.locals.timings = timings();
    const start = performance.now();
    res.setHeader('X-Request-Id', res.locals.requestId);
    res.setHeader('Server-Timing', timingHeader(res.locals.timings));
    res.on('finish', () => {
      const route = req.route?.path ?? 'unmatched';
      requests.inc({ route, status: String(res.statusCode) });
      const stages = res.locals.timings as Timings;
      for (const [stage, ms] of Object.entries(stages)) if (ms > 0) latency.observe({ stage }, ms / 1000);
      latency.observe({ stage: 'total' }, (performance.now() - start) / 1000);
      logger.info({ requestId: res.locals.requestId, method: req.method, route, status: res.statusCode, timings: stages }, 'request');
    });
    next();
  });
  app.use(helmet());
  app.use(cors({ origin(origin, callback) {
    if (!origin || origin === config.CORS_ORIGIN) callback(null, true);
    else callback(new ApiError(403, 'INVALID_QUERY', 'Origin not allowed'));
  } }));
  app.use(express.json({ limit: '16kb' }));
  const limiter = rateLimit({ windowMs: config.RATE_WINDOW_MS, limit: config.RATE_LIMIT,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler(req, res) {
      const retry = Math.max(1, Math.ceil(((req as any).rateLimit.resetTime.getTime() - Date.now()) / 1000));
      res.setHeader('Retry-After', retry);
      send(res, { error: { code: 'RATE_LIMITED', message: 'Too many requests', retryAfterMs: retry * 1000 } }, 429);
    } });
  app.use(['/api', '/search'], limiter);
  const parse = (req: Request, res: Response) => {
    const start = performance.now();
    try { return validateInput(req.query, config.MAX_DEPTH); }
    finally { res.locals.timings.parseMs = performance.now() - start; }
  };
  app.get('/api/search', async (req, res) => send(res, await search.search(parse(req, res), res.locals.timings)));
  app.get('/api/compare', async (req, res) => send(res, await search.compare(parse(req, res), res.locals.timings)));
  app.get('/api/similar/:id', async (req, res) => {
    if (!/^\d{1,20}$/.test(req.params.id)) throw new ApiError(400, 'INVALID_QUERY', 'Invalid repository id');
    send(res, await search.similar(req.params.id, validateSize(req.query.size), res.locals.timings));
  });
  app.get('/api/facets', async (_req, res) => send(res, await search.facets()));
  // Keep the existing UI usable while its independent session moves to /api/search.
  app.get('/search', async (req, res) => {
    const input = validateInput({ ...req.query, lang: req.query.lang ?? req.query.language }, config.MAX_DEPTH);
    const data = await search.search(input, res.locals.timings);
    send(res, data.results.map(r => ({ _id: r.id, _score: r.explain.fusedScore,
      _source: { name: r.fullName, description: r.description, url: r.url, stars: r.stars, language: r.language } })));
  });
  app.get('/healthz', (_req, res) => send(res, { status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    const checks = await Promise.allSettled([
      search.upstream.request('/_cluster/health'), search.upstream.request('/health', undefined, true),
    ]);
    const es = checks[0], embed = checks[1];
    const elasticsearch = es.status === 'fulfilled' && es.value.status !== 'red' ? 'ok' : 'unavailable';
    const embedding = embed.status === 'fulfilled' && embed.value.ready && embed.value.dimension === config.EMBED_DIMENSION ? 'ok' : 'unavailable';
    const ready = elasticsearch === 'ok' && embedding === 'ok';
    send(res, { status: ready ? 'ready' : 'unavailable', dependencies: { elasticsearch, embedding },
      ...(ready ? {} : { error: { code: 'INTERNAL', message: 'Dependencies unavailable', retryAfterMs: null } }) }, ready ? 200 : 503);
  });
  app.get('/metrics', async (_req, res) => {
    res.setHeader('Server-Timing', timingHeader(res.locals.timings));
    res.type(registry.contentType).send(await registry.metrics());
  });
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Route not found')));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const known = error instanceof ApiError ? error :
      (error.type === 'entity.too.large' || error instanceof SyntaxError ? new ApiError(400, 'INVALID_QUERY', 'Invalid request body') :
      new ApiError(500, 'INTERNAL', 'Internal server error'));
    if (!(error instanceof ApiError)) logger.error({ requestId: res.locals.requestId, errorName: error.name }, 'request failed');
    send(res, { error: { code: known.code, message: known.message, retryAfterMs: known.retryAfterMs } }, known.status);
  };
  app.use(errors);
  return { app, search, registry };
}
function timingHeader(t: Timings) {
  return Object.entries(t).map(([name, ms]) => `${name};dur=${ms.toFixed(3)}`).join(', ');
}
function send(res: Response, body: unknown, status = 200) {
  res.setHeader('Server-Timing', timingHeader(res.locals.timings));
  return res.status(status).json(body);
}
