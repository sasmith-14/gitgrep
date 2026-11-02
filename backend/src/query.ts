import { z } from 'zod';
import { ApiError, Input, Query } from './types';
const invalid = () => new ApiError(400, 'INVALID_QUERY', 'Invalid search parameters');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const integer = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe());
const params = z.object({
  q: z.string().min(1).max(300).refine(s => s.trim().length > 0),
  mode: z.enum(['keyword','semantic','hybrid']).default('hybrid'),
  lang: z.string().trim().min(1).max(80).optional(), minStars: integer.optional(),
  pushedAfter: date.optional(), topic: z.union([z.string(), z.array(z.string()).max(20)]).optional(),
  page: integer.pipe(z.number().min(1)).default(1),
  size: integer.pipe(z.number().min(1).max(50)).default(10),
});

export function tokenize(raw: string) {
  const tokens: { value: string; quoted: boolean; negative: boolean }[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i].trim() === '') { i++; continue; }
    let value = '', inside = false;
    const negative = raw[i] === '-' && i + 1 < raw.length && raw[i + 1].trim() !== '';
    if (negative) i++;
    const quoted = raw[i] === '"';
    while (i < raw.length && (inside || raw[i].trim() !== '')) {
      const char = raw[i++];
      if (char === '\\' && i < raw.length && (raw[i] === '"' || raw[i] === '\\')) value += raw[i++];
      else if (char === '"') inside = !inside;
      else value += char;
    }
    // An unfinished quote is searchable text; typing a query should not fail halfway through.
    if (value) tokens.push({ value, quoted, negative });
  }
  return tokens;
}

export function parseQuery(raw: string): Query {
  const parsed: Query['parsed'] = { lang: null, minStars: null, pushedAfter: null, topics: [], phrases: [], exclude: [] };
  const text: string[] = [];
  for (const token of tokenize(raw)) {
    const { value } = token;
    if (token.negative) { parsed.exclude.push(value); continue; }
    if (token.quoted) { parsed.phrases.push(value); text.push(value); continue; }
    const colon = value.indexOf(':');
    const name = value.slice(0, colon), operand = value.slice(colon + 1);
    if (colon > 0 && operand) {
      if (name === 'lang' && operand.length <= 80) { parsed.lang = operand; continue; }
      if (name === 'topic') { parsed.topics.push(operand); continue; }
      if (name === 'stars' && operand.startsWith('>')) {
        const stars = integer.safeParse(operand.slice(1));
        if (stars.success && stars.data < Number.MAX_SAFE_INTEGER) { parsed.minStars = stars.data + 1; continue; }
      }
      if (name === 'pushed' && operand.startsWith('>') && date.safeParse(operand.slice(1)).success) {
        parsed.pushedAfter = operand.slice(1); continue;
      }
    }
    text.push(value);
  }
  parsed.topics = [...new Set(parsed.topics)];
  return { raw, text: text.join(' '), parsed };
}

export function validateInput(raw: unknown, maxDepth: number): Input {
  const result = params.safeParse(raw);
  if (!result.success) throw invalid();
  const p = result.data;
  if ((p.page - 1) * p.size >= maxDepth) throw new ApiError(400, 'INVALID_QUERY', `Page starts beyond MAX_DEPTH=${maxDepth}`);
  const query = parseQuery(p.q);
  if (p.lang !== undefined) query.parsed.lang = p.lang;
  if (p.minStars !== undefined) query.parsed.minStars = p.minStars;
  if (p.pushedAfter !== undefined) query.parsed.pushedAfter = p.pushedAfter;
  if (p.topic !== undefined) {
    const topics = Array.isArray(p.topic) ? p.topic : [p.topic];
    if (topics.some(x => !x.trim() || x.length > 100)) throw invalid();
    query.parsed.topics = [...new Set(topics.map(x => x.trim()))];
  }
  return { query, mode: p.mode, page: p.page, size: p.size };
}
export function validateSize(size: unknown): number {
  const result = integer.pipe(z.number().min(1).max(50)).safeParse(size ?? '10');
  if (!result.success) throw invalid();
  return result.data;
}
