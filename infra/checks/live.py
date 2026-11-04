import hashlib
import json
import os
from itertools import product
from datetime import datetime, timezone
from pathlib import Path

import httpx
from services.config import Settings


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def check_live():
    settings = Settings()
    origin = os.environ.get('CORS_ORIGIN', 'http://localhost:5174')
    config = json.loads(Path('scripts/collection.live.json').read_text())
    expected = {language.casefold(): config['per_language'] for language in config['languages']}
    auth = {'Authorization': 'ApiKey ' + settings.es_api_key} if settings.es_api_key else {}
    with httpx.Client(base_url=str(settings.es_url), headers=auth, timeout=30) as es:
        response = es.get('/' + settings.es_index + '/_count')
        response.raise_for_status()
        count = response.json()['count']
        response = es.post('/' + settings.es_index + '/_search', json={
            'size': 0, 'aggs': {'languages': {'terms': {'field': 'language', 'size': 50}}}})
        response.raise_for_status()
        languages = {row['key']: row['doc_count'] for row in response.json()['aggregations']['languages']['buckets']}
        assert languages == expected, languages
        assert count == sum(expected.values())
        stats = es.get('/' + settings.es_index + '/_stats/docs,store')
        stats.raise_for_status()
        primaries = stats.json()['_all']['primaries']
        mapping = es.get('/' + settings.es_index + '/_mapping')
        mapping.raise_for_status()
        for index in mapping.json().values():
            props = index['mappings']['properties']
            assert props['embedding']['index_options']['type'] == 'int8_hnsw'
            assert props['chunks']['properties']['embedding']['index_options']['type'] == 'flat'
    examples = {}
    with httpx.Client(base_url='http://127.0.0.1:5050', headers={'Origin': origin}, timeout=15) as api:
        for language, mode in product(expected, ['keyword', 'semantic', 'hybrid']):
            response = api.get('/api/search', params={'q': 'framework', 'lang': language, 'mode': mode, 'size': 3})
            response.raise_for_status()
            data = response.json()
            assert not data['degraded'] and data['results'], language
            assert all(repo['language'].casefold() == language for repo in data['results'])
            assert response.headers['X-Request-Id'] and response.headers['Server-Timing']
            assert response.headers['Access-Control-Allow-Origin'] == origin
            if mode == 'hybrid':
                examples[language] = [repo['fullName'] for repo in data['results']]
        response = api.get('/search', params={'q': 'framework', 'language': 'Rust'})
        response.raise_for_status()
        assert response.json() and all(repo['_source']['language'].casefold() == 'rust' for repo in response.json())
        assert api.get('/readyz').status_code == 200
    artifact = {'recordedAt': datetime.now(timezone.utc).isoformat(), 'repositories': count,
                'languages': languages, 'passages': primaries['docs']['count'] - count,
                'indexBytes': primaries['store']['size_in_bytes'], 'alias': settings.es_index, 'source': 'GitHub REST API',
                'rawSha256': sha256('data/live-repos.json'),
                'documentsSha256': sha256('data/live-repos-with-embeddings.json'),
                'examples': examples, 'checkedModes': ['keyword', 'semantic', 'hybrid'], 'websiteCompatibilityRoute': 'passed', 'degraded': False}
    Path('eval/live-dataset.json').write_text(json.dumps(artifact, indent=2) + '\n')
    print(json.dumps(artifact, indent=2))


if __name__ == '__main__':
    check_live()
