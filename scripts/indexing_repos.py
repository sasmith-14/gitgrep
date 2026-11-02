import argparse
import json
from pathlib import Path

import httpx
from services.config import Settings
from scripts.mapping import mapping


def index(source, target=None):
    settings = Settings()
    target = target or settings.es_index + "-v1"
    if target == settings.es_index or not target.startswith(settings.es_index + "-v"):
        raise ValueError("target must be a versioned index behind ES_INDEX alias")
    headers = {"Authorization": "ApiKey " + settings.es_api_key} if settings.es_api_key else {}
    with httpx.Client(base_url=str(settings.es_url), headers=headers,
                      timeout=settings.es_timeout_ms / 1000) as client:
        exists = client.head('/' + target)
        if exists.status_code == 404:
            client.put('/' + target, json=mapping(settings.embed_dimension)).raise_for_status()
        else:
            exists.raise_for_status()
        documents = json.loads(Path(source).read_text())
        if not documents or len({d['id'] for d in documents}) != len(documents):
            raise ValueError('dataset must be nonempty with unique IDs')
        failures, changed = [], 0
        for start in range(0, len(documents), 50):
            batch = documents[start:start + 50]
            existing = client.post('/' + target + '/_mget', json={"ids": [d['id'] for d in batch]},
                                   params={"_source_includes": "contentHash"})
            existing.raise_for_status()
            hashes = {d['_id']: d.get('_source', {}).get('contentHash') for d in existing.json()['docs']}
            dirty = [d for d in batch if hashes.get(d['id']) != d['contentHash']]
            if not dirty:
                continue
            payload = ''.join(json.dumps({'index': {'_index': target, '_id': d['id']}}) + '\n' +
                              json.dumps(d) + '\n' for d in dirty)
            response = client.post('/_bulk', content=payload, headers={'Content-Type': 'application/x-ndjson'})
            response.raise_for_status()
            items = response.json()['items']
            failures.extend(item['index'] for item in items if item['index']['status'] >= 300)
            changed += sum(item['index']['status'] < 300 for item in items)
        Path('data').mkdir(exist_ok=True)
        Path('data/bulk-failures.json').write_text(json.dumps(failures, indent=2))
        if failures:
            raise RuntimeError(f'{len(failures)} bulk failures; alias unchanged, see data/bulk-failures.json')
        client.post('/' + target + '/_refresh').raise_for_status()
        current = client.get('/_alias/' + settings.es_index)
        if current.status_code not in (200, 404):
            current.raise_for_status()
        actions = [{'remove': {'index': name, 'alias': settings.es_index}} for name in
                   (current.json() if current.status_code == 200 else {}) if name != target]
        actions.append({'add': {'index': target, 'alias': settings.es_index}})
        client.post('/_aliases', json={'actions': actions}).raise_for_status()
        print(json.dumps({'index': target, 'documents': len(documents), 'changed': changed, 'failed': len(failures)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='data/repos_with_embeddings.json')
    parser.add_argument('--index')
    args = parser.parse_args()
    index(args.input, args.index)
