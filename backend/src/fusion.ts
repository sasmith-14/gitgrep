import { Hit, Query, Result } from './types';

export function passage(hit: Hit, query: Query): Result['match'] {
  const chunk = Object.values(hit.inner_hits ?? {}).flatMap(x => x.hits.hits)[0]?._source;
  if (!chunk || typeof chunk.body !== 'string') return null;
  const terms = [...query.parsed.phrases, ...query.text.split(/\s+/)].filter(Boolean);
  const lower = chunk.body.toLowerCase();
  const first = terms.map(t => lower.indexOf(t.toLowerCase())).filter(x => x >= 0).sort((a,b) => a - b)[0] ?? 0;
  const start = Math.max(0, first - 80);
  const text = chunk.body.slice(start, start + 400);
  const intervals: [number, number][] = [];
  // Compare slices rather than lowercasing the whole passage: Unicode case expansion can change offsets.
  for (const term of terms) {
    for (let at = 0; at <= text.length - term.length; at++) {
      if (text.slice(at, at + term.length).toLocaleLowerCase() === term.toLocaleLowerCase()) intervals.push([at, at + term.length]);
    }
  }
  const merged: [number, number][] = [];
  for (const interval of intervals.sort((a,b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return { heading: chunk.heading, passage: text, highlights: merged };
}

export function fuse(keyword: Hit[], semantic: Hit[], query: Query, k: number): Result[] {
  const items = new Map<string, Result>();
  for (const [list, field] of [[keyword, 'keywordRank'], [semantic, 'semanticRank']] as const) {
    list.forEach((hit, index) => {
      let result = items.get(hit._id);
      if (!result) {
        const repo = hit._source;
        result = { id: hit._id, fullName: repo.fullName, url: repo.url, description: repo.description,
          language: repo.language, stars: repo.stars, pushedAt: repo.pushedAt, topics: repo.topics,
          match: passage(hit, query), explain: { keywordRank: null, semanticRank: null, fusedScore: 0, cosine: null } };
        items.set(hit._id, result);
      }
      if (result.explain[field] !== null) return;
      result.explain[field] = index + 1;
      result.explain.fusedScore += 1 / (k + index + 1);
      if (field === 'semanticRank') {
        result.explain.cosine = Math.max(-1, Math.min(1, 2 * hit._score - 1));
        result.match = passage(hit, query) ?? result.match;
      }
    });
  }
  return [...items.values()].sort((a,b) => b.explain.fusedScore - a.explain.fusedScore || a.id.localeCompare(b.id));
}
