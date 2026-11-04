import json
from pathlib import Path
import pytest
from scripts.chunking import chunk_readme, sections
from scripts.fetch_repos import split_shard
from scripts.mapping import mapping


class Tokenizer:
    def encode(self, text, **_):
        return text.split()

    def decode(self, tokens, **_):
        return ' '.join(tokens)


def test_chunks_preserve_heading_overlap_and_strip_noise():
    text = '# Project\n![badge](https://x)\n<img src="x">\n\nIntro.\n## Install\n' + ' '.join(f'w{i}' for i in range(450))
    chunks = chunk_readme(text, Tokenizer())
    assert chunks[0] == {'heading': 'Project', 'body': 'Intro.'}
    assert chunks[1]['heading'] == 'Project / Install'
    assert all(len(c['body'].split()) <= 220 for c in chunks)
    assert chunks[1]['body'].split()[-32:] == chunks[2]['body'].split()[:32]
    assert 'badge' not in str(chunks) and 'src=' not in str(chunks)
    assert list(sections('## Contents\n- [Install](#install)\n## Install\nWorks')) == [('Install', 'Works')]


def test_shards_cover_dates_without_overlap():
    parts = split_shard(('Rust', 100, 999, '2020-01-01', '2020-12-31'))
    assert parts[0][3:] == ('2020-01-01', '2020-07-01')
    assert parts[1][3:] == ('2020-07-02', '2020-12-31')
    assert split_shard(('Rust', 1, 4, '2020-01-01', '2020-01-01'))[1][1:3] == (3, 4)
    with pytest.raises(RuntimeError):
        split_shard(('Rust', 1, 1, '2020-01-01', '2020-01-01'))


def test_fixture_and_mapping():
    repos = json.loads(Path('tests/fixtures/repos.json').read_text())
    assert len(repos) == len({r['id'] for r in repos}) == 50
    props = mapping()['mappings']['properties']
    assert props['chunks']['type'] == 'nested'
    assert props['embedding']['similarity'] == 'cosine'
    balanced = mapping(layout='balanced')['mappings']['properties']
    assert balanced['embedding']['index_options']['type'] == 'int8_hnsw'
    assert balanced['chunks']['properties']['embedding']['index_options']['type'] == 'flat'
    with pytest.raises(ValueError):
        mapping(layout='unknown')


def test_github_etag_rate_limit_and_resume_cache(tmp_path):
    import httpx
    from scripts.fetch_repos import GitHub
    from services.config import Settings
    waits, requests = [], []

    def respond(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(429, headers={'Retry-After': '1'})
        if len(requests) == 2:
            return httpx.Response(200, headers={'ETag': 'abc'}, json={'items': [], 'total_count': 0})
        assert request.headers['If-None-Match'] == 'abc'
        return httpx.Response(304)

    github = GitHub(Settings(), tmp_path / 'cache.sqlite', sleep=waits.append)
    github.client.close()
    github.client = httpx.Client(base_url='https://api.github.com', transport=httpx.MockTransport(respond))
    assert github.get('/search') == {'items': [], 'total_count': 0}
    assert github.get('/search') == {'items': [], 'total_count': 0}
    assert waits == [1]
    github.client.close()
    github.cache.close()


def test_collector_rejects_private_repos_before_checkpoint(monkeypatch, tmp_path):
    import scripts.fetch_repos as fetch

    class GitHub:
        def __init__(self, *_):
            pass

        def get(self, path, params):
            assert path == '/search/repositories'
            assert 'is:public' in params['q']
            return {'total_count': 1, 'items': [{'id': 1, 'private': True}]}

    monkeypatch.setattr(fetch, 'GitHub', GitHub)
    config = tmp_path / 'config.json'
    config.write_text(json.dumps({'languages': list('abcdefgh'), 'star_buckets': [[100, 100]],
                                 'created_start': '2025-01-01', 'created_end': '2025-01-01', 'per_language': 1}))
    checkpoint, output = tmp_path / 'checkpoint.json', tmp_path / 'repos.json'
    with pytest.raises(RuntimeError, match='non-public'):
        fetch.collect(config, checkpoint, output)
    assert not checkpoint.exists() and not output.exists()


def test_readme_pool_is_bounded_ordered_and_closes_clients(monkeypatch):
    import threading
    import time
    import scripts.fetch_repos as fetch
    active, peak, closed = [0], [0], []
    lock = threading.Lock()
    first_pair = threading.Barrier(2)

    class Resource:
        def close(self):
            closed.append(1)

    class GitHub:
        def __init__(self, *_):
            self.client, self.cache = Resource(), Resource()

        def get(self, path, raw):
            assert raw
            with lock:
                active[0] += 1
                peak[0] = max(peak[0], active[0])
            if path.endswith(('/0/readme', '/1/readme')):
                first_pair.wait(timeout=5)
            time.sleep(.01)
            with lock:
                active[0] -= 1
            return path.encode()

    monkeypatch.setattr(fetch, 'GitHub', GitHub)
    repos = [{'full_name': f'owner/{i}', 'private': False} for i in range(5)]
    rows = list(fetch.fetch_readmes(repos, None, 'unused', workers=2))
    assert [r for r, _ in rows] == repos
    assert rows[-1][1] == b'/repos/owner/4/readme'
    assert 1 < peak[0] <= 2 and len(closed) == 4
    with pytest.raises(RuntimeError, match='non-public'):
        list(fetch.fetch_readmes([{'private': True}], None, 'unused'))
