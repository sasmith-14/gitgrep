import subprocess
import time
import uuid
import httpx


def check_degradation():
    with httpx.Client(base_url='http://127.0.0.1:5050', timeout=10) as client:
        try:
            subprocess.run(['docker', 'compose', 'stop', 'embedding'], check=True, timeout=30)
            response = client.get('/api/search', params={'q': 'fastapi ' + uuid.uuid4().hex})
            response.raise_for_status()
            data = response.json()
            assert data['degraded'] and data['degradedReason'] == 'embedding_unavailable'
            assert any(r['fullName'] == 'fastapi/fastapi' for r in data['results'])
            assert data['timings']['bm25Ms'] > 0 and response.headers['Server-Timing']
            ready = client.get('/readyz')
            assert ready.status_code == 503 and ready.json()['dependencies']['embedding'] == 'unavailable'
            print('embedding stopped: search=200, keyword result present, degraded=true, readiness=503')
        finally:
            subprocess.run(['docker', 'compose', 'up', '-d', '--wait', '--wait-timeout', '60', 'embedding'],
                           check=True, timeout=90)
        for _ in range(15):
            response = client.get('/api/search', params={'q': 'fastapi ' + uuid.uuid4().hex})
            if response.status_code == 200 and not response.json()['degraded']:
                assert client.get('/readyz').status_code == 200
                print('embedding restored: search=200, degraded=false, readiness=200')
                return
            time.sleep(1)
        raise AssertionError('embedding circuit did not recover within 15 seconds')


if __name__ == '__main__':
    check_degradation()
