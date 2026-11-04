import argparse
import json
from pathlib import Path
import httpx


def smoke(base_url, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    endpoints = {
        'search': '/api/search?q=fastapi&size=1', 'compare': '/api/compare?q=fastapi',
        'similar': '/api/similar/160919119?size=3', 'facets': '/api/facets',
        'health': '/healthz', 'ready': '/readyz', 'metrics': '/metrics',
        'invalid': '/api/search?q=fastapi&size=51', 'missing': '/api/similar/99999999999999999',
        'filtered': '/api/search?q=lang:Rust&size=50',
    }
    seed_id = None
    with httpx.Client(base_url=base_url, timeout=10) as client:
        for name, path in endpoints.items():
            if name == 'similar':
                assert seed_id, 'Seed the corpus before smoke checks'
                path = f'/api/similar/{seed_id}?size=3'
            response = client.get(path)
            expected = {'invalid': 400, 'missing': 404}.get(name, 200)
            assert response.status_code == expected, (name, response.status_code, response.text)
            assert response.headers.get('X-Request-Id')
            assert response.headers.get('Server-Timing')
            body = response.text if name == 'metrics' else response.json()
            if name in {'search', 'filtered', 'similar'}:
                assert body['degraded'] is False, body
                assert all('embedding' not in r for r in body['results'])
                if name == 'search':
                    assert body['results'], 'Seed the corpus before smoke checks'
                    seed_id = body['results'][0]['id']
                if name == 'filtered':
                    assert all(r['language'].casefold() == 'rust' for r in body['results'])
                if name == 'similar':
                    assert all(r['id'] != seed_id for r in body['results'])
            evidence = {'path': path, 'status': response.status_code,
                        'headers': {k: response.headers[k] for k in ('x-request-id', 'server-timing')}, 'body': body}
            (output / (name + '.json')).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
            print(f'{response.status_code} {path}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5050')
    parser.add_argument('--output', default='docs/evidence/api')
    args = parser.parse_args()
    smoke(args.url, args.output)
