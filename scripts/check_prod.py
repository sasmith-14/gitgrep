import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile


def check_prod():
    with tempfile.TemporaryDirectory(prefix='gitgrep-prod-check-') as directory:
        env = Path(directory) / '.env'
        env.write_text('ELASTIC_PASSWORD=' + secrets.token_hex(32) +
                       '\nES_API_KEY=bootstrap\nCORS_ORIGIN=https://example.invalid\n')
        env.chmod(0o600)
        compose = ['docker', 'compose', '-p', f'gitgrep-check-{os.getpid()}', '--env-file', str(env),
                   '-f', 'docker-compose.prod.yml']

        def run(args, input=None, timeout=30):
            result = subprocess.run(compose + args, input=input, text=True, capture_output=True, timeout=timeout)
            if result.returncode:
                raise RuntimeError('Production check command failed: ' + result.stderr[-1000:])
            return result.stdout

        def http(path, method='GET', data=None, key=None, admin=False):
            auth = ' -u "elastic:$ELASTIC_PASSWORD"' if admin else (
                ' -H "Authorization: ApiKey ' + key + '"' if key else '')
            body = " -H 'Content-Type: application/json' -d '" + json.dumps(data) + "'" if data is not None else ''
            output = run(['exec', '-T', 'elasticsearch', 'sh'], input=(
                f"curl --max-time 5 -sS -w '\\n%{{http_code}}' -X {method}{auth}{body} http://localhost:9200{path}\n"))
            text, code = output.rsplit('\n', 1)
            return int(code), json.loads(text)

        try:
            run(['up', '-d', '--wait', '--wait-timeout', '120', 'elasticsearch'], timeout=150)
            code, _ = http('/')
            assert code == 401, 'Production ES must reject anonymous requests'
            code, _ = http('/gitgrep-vcheck', 'PUT', {}, admin=True)
            assert code == 200
            role = {'cluster': ['monitor'], 'indices': [{'names': ['gitgrep', 'gitgrep-v*'],
                    'privileges': ['read', 'view_index_metadata']}]}
            code, created = http('/_security/api_key', 'POST',
                                 {'name': 'gitgrep-read-check', 'role_descriptors': {'search': role}}, admin=True)
            assert code == 200, 'API key creation requires a usable security configuration'
            key = created['encoded']
            code, _ = http('/gitgrep-vcheck/_search', key=key)
            assert code == 200, 'Read key must retrieve search results'
            code, _ = http('/gitgrep-vcheck/_doc/1', 'PUT', {'id': '1'}, key=key)
            assert code == 403, 'Read key must not modify documents'
            print('production ES: anonymous=401, read key search=200, read key write=403')
        finally:
            run(['down', '--volumes', '--timeout', '10'], timeout=60)


if __name__ == '__main__':
    check_prod()
