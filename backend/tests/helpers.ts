import { Hit } from '../src/types';
export function hit(id: string, score = .8): Hit {
  return { _id: id, _score: score, _source: { id, name: id, fullName: `owner/${id}`, url: `https://github.com/owner/${id}`, description: 'test', language: 'Python', stars: 10, pushedAt: '2025-01-01T00:00:00Z', topics: ['cli'] },
    inner_hits: { chunks: { hits: { hits: [{ _score: score, _source: { heading: 'Install', body: 'Install the CLI tool for Rust today' } }] } } } };
}
