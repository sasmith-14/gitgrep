import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseQuery, tokenize, validateInput } from '../src/query';
import { fuse } from '../src/fusion';
import { keywordRequest, semanticRequest, repositoryRequest, passageRequest } from '../src/search';
import { hit } from './helpers';
test('tokenizer handles operators, quotes, exclusions, empty values and unknown operators', () => {
  const q = parseQuery('lang:rust tool stars:>500 "exact phrase" -excluded pushed:>2025-01-01 topic:cli lang:go unknown:yes lang:');
  assert.deepEqual(q.parsed, { lang: 'go', minStars: 501, pushedAfter: '2025-01-01', topics: ['cli'], phrases: ['exact phrase'], exclude: ['excluded'] });
  assert.equal(q.text, 'tool exact phrase unknown:yes lang:');
  assert.deepEqual(parseQuery('-"not this" "héllo 世界"').parsed.exclude, ['not this']);
  assert.equal(parseQuery('pushed:>2025-02-30 stars:>x').text, 'pushed:>2025-02-30 stars:>x');
  assert.equal(tokenize('"unfinished quote')[0].value, 'unfinished quote');
  assert.equal(tokenize('"a\\"b"')[0].value, 'a"b');
});
test('explicit parameters override operators, duplicates are deterministic and limits reject bad input', () => {
  const input = validateInput({ q: 'lang:rust stars:>500 topic:cli topic:cli pushed:>2025-01-01', lang: 'Python', minStars: '0', topic: ['web','api'], pushedAfter: '2024-01-01' }, 100);
  assert.deepEqual(input.query.parsed, { lang: 'Python', minStars: 0, topics: ['web','api'], pushedAfter: '2024-01-01', phrases: [], exclude: [] });
  for (const raw of [{q:''}, {q:' '.repeat(10)}, {q:'x'.repeat(301)}, {q:['a','b']}, {q:'x',size:'51'}, {q:'x',minStars:'1x'}, {q:'x',page:'11'}, {q:'x',mode:'bad'}, {q:'x',pushedAfter:'2025-02-30'}]) assert.throws(() => validateInput(raw,100));
});
test('property: arbitrary Unicode/quotes terminate, retain raw and produce bounded text', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 0x10ffff }).filter(x => x < 0xd800 || x > 0xdfff), { maxLength: 300 }), codepoints => {
    const raw = String.fromCodePoint(...codepoints);
    const parsed = parseQuery(raw);
    assert.equal(parsed.raw, raw);
    assert.ok(parsed.text.length <= raw.length);
    assert.ok(parsed.parsed.topics.length <= tokenize(raw).length);
  }), { numRuns: 1000 });
  fc.assert(fc.property(fc.string({ maxLength: 200 }), value => {
    for (const q of [`lang:rust ${value}`, `${value} lang:rust`, `a lang:rust ${value}`]) {
      const result = validateInput({ q, lang: 'Go' }, 100);
      assert.equal(result.query.parsed.lang, 'Go');
    }
  }), { numRuns: 300 });
});
test('RRF matches hand calculation, removes duplicates, and does not depend on raw score scales', () => {
  const q = parseQuery('CLI Rust');
  const result = fuse([hit('a',100),hit('b',1)], [hit('b',.9),hit('c',.7)], q, 60);
  assert.deepEqual(result.map(x=>x.id), ['b','a','c']);
  assert.equal(result[0].explain.fusedScore, 1/62 + 1/61);
  assert.deepEqual(result[0].explain, { keywordRank: 2, semanticRank: 1, fusedScore: 1/62 + 1/61, cosine: .8 });
  assert.equal(result[1].explain.semanticRank, null);
  assert.equal(fuse([hit('a'),hit('a')],[],q,60).length,1);
  for (const r of result) for (const [start,end] of r.match!.highlights) assert.ok(start >= 0 && end <= r.match!.passage.length && start < end);
});
test('every constraint is shared by lexical and knn prefilters', () => {
  const query = parseQuery('lang:rust stars:>500 pushed:>2025-01-01 topic:cli "exact phrase" -excluded');
  assert.deepEqual(keywordRequest(query,100).query.bool.filter[0], semanticRequest(query,[1,0],100).knn.filter);
  assert.equal(semanticRequest(query,[1,0],100).knn.num_candidates,1010);
});
test('balanced retrieval prefilters both stages and confines exact passage scoring to shortlisted IDs', () => {
  const query = parseQuery('lang:rust stars:>500 topic:cli "install" -deprecated');
  const root = repositoryRequest(query, [1, 0], 200);
  const passages = passageRequest(query, [1, 0], ['42', '99'], 100);
  assert.equal(root.knn.field, 'embedding');
  assert.deepEqual(root.knn.filter, passages.query.bool.filter[0]);
  assert.deepEqual(passages.query.bool.filter[1], { ids: { values: ['42', '99'] } });
  assert.equal(passages.size, 101);
  assert.ok(passages.query.bool.must[0].nested.query.script_score.script.source.includes('/ 2.0'));
});
