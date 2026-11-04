import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import sqlite3
import time
import threading

import httpx
from services.config import Settings


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False))
    temporary.replace(path)


class GitHub:
    def __init__(self, settings, cache_path, sleep=time.sleep):
        self.sleep = sleep
        # Workers own connections; the coordinator closes them only after joining the pool.
        self.cache = sqlite3.connect(cache_path, check_same_thread=False)
        self.cache.execute('CREATE TABLE IF NOT EXISTS responses (url TEXT PRIMARY KEY, etag TEXT, body BLOB)')
        headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
        if settings.github_token:
            headers['Authorization'] = 'Bearer ' + settings.github_token
        self.client = httpx.Client(base_url=str(settings.github_api_url), headers=headers, timeout=30)

    def get(self, path, params=None, raw=False):
        request = self.client.build_request('GET', path, params=params)
        key = str(request.url)
        cached = self.cache.execute('SELECT etag,body FROM responses WHERE url=?', (key,)).fetchone()
        if cached and cached[0]:
            request.headers['If-None-Match'] = cached[0]
        if raw:
            request.headers['Accept'] = 'application/vnd.github.raw+json'
        for attempt in range(8):
            try:
                with closing(self.client.send(request, stream=True)) as response:
                    if response.status_code == 304 and cached:
                        return bytes(cached[1]) if raw else json.loads(cached[1])
                    if raw and response.status_code == 404:
                        return b''
                    if response.status_code in (403, 429):
                        body = response.read().decode(errors='replace')
                        if response.status_code == 403 and not (
                            response.headers.get('X-RateLimit-Remaining') == '0' or
                            'secondary rate limit' in body.lower() or 'Retry-After' in response.headers
                        ):
                            response.raise_for_status()
                        delay = max(float(response.headers.get('Retry-After', '0')),
                                    float(response.headers.get('X-RateLimit-Reset', '0')) - time.time() + 1,
                                    min(2 ** attempt, 120))
                        print(f'github rate limit; sleep {delay:.0f}s', flush=True)
                        self.sleep(delay)
                        continue
                    if response.status_code >= 500:
                        self.sleep(min(2 ** attempt, 120))
                        continue
                    response.raise_for_status()
                    body = bytearray()
                    for part in response.iter_bytes():
                        body.extend(part[:max(0, 200_000 - len(body))] if raw else part)
                        if raw and len(body) >= 200_000:
                            break
                    self.cache.execute('INSERT OR REPLACE INTO responses VALUES (?,?,?)',
                                       (key, response.headers.get('ETag'), bytes(body)))
                    self.cache.commit()
                    if response.headers.get('X-RateLimit-Remaining') == '0':
                        self.sleep(max(1, float(response.headers.get('X-RateLimit-Reset', '0')) - time.time() + 1))
                    return bytes(body) if raw else json.loads(body)
            except (httpx.TimeoutException, httpx.NetworkError):
                self.sleep(min(2 ** attempt, 120))
        raise RuntimeError('GitHub retry budget exhausted; checkpoint retained')



def fetch_readmes(repos, settings, cache_path, workers=8):
    if any(repo.get('private') is not False for repo in repos):
        raise RuntimeError('Refusing to fetch a non-public or unknown-visibility repository')
    local, clients = threading.local(), []
    lock, next_start = threading.Lock(), [time.monotonic()]

    def fetch(repo):
        with lock:
            delay = max(0, next_start[0] - time.monotonic())
            next_start[0] = max(time.monotonic(), next_start[0]) + .125
        time.sleep(delay)
        if not hasattr(local, 'github'):
            local.github = GitHub(settings, cache_path)
            clients.append(local.github)
        return local.github.get('/repos/' + repo['full_name'] + '/readme', raw=True)

    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            yield from zip(repos, pool.map(fetch, repos))
    finally:
        for client in clients:
            client.client.close()
            client.cache.close()


def split_shard(shard):
    lang, low, high, start, end = shard
    start_date, end_date = date.fromisoformat(start), date.fromisoformat(end)
    if start_date < end_date:
        middle = start_date + (end_date - start_date) // 2
        return [(lang, low, high, start, middle.isoformat()),
                (lang, low, high, (middle + timedelta(days=1)).isoformat(), end)]
    if low < high:
        middle = (low + high) // 2
        return [(lang, low, middle, start, end), (lang, middle + 1, high, start, end)]
    raise RuntimeError(f'Unsplittable >1000-result shard {shard}; add pushed-date partition before continuing')


def collect(config_path, checkpoint='data/checkpoint.json', output='data/repos.json', refresh=False):
    config = json.loads(Path(config_path).read_text())
    if len(set(config['languages'])) < 8 or config['per_language'] < 1:
        raise ValueError('configure at least eight distinct languages and positive per_language')
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    Path(checkpoint).parent.mkdir(parents=True, exist_ok=True)
    state = json.loads(Path(checkpoint).read_text()) if Path(checkpoint).exists() and not refresh else {
        'configHash': fingerprint, 'done': [], 'repos': {}}
    if any(repo.get('private') is not False for repo in state['repos'].values()):
        raise ValueError('Checkpoint visibility is unknown; use --refresh or a new checkpoint')
    if state['configHash'] != fingerprint:
        raise ValueError('config changed: use --refresh or a different checkpoint')
    github = GitHub(Settings(), str(Path(checkpoint).with_suffix('.sqlite')))
    done = set(state['done'])
    for language in config['languages']:
        queue = [(language, low, high, config['created_start'], config['created_end'])
                 for low, high in config['star_buckets']]
        while queue:
            count = sum((r.get('language') or '').casefold() == language.casefold() for r in state['repos'].values())
            if count >= config['per_language']:
                break
            shard = queue.pop(0)
            lang, low, high, start, end = shard
            query = f'language:"{lang}" stars:{low}..{high} created:{start}..{end} fork:false is:public'
            first = github.get('/search/repositories', {'q': query, 'per_page': 100, 'page': 1, 'sort': 'stars'})
            if first.get('incomplete_results'):
                raise RuntimeError('GitHub returned incomplete_results; retry this checkpoint')
            if first['total_count'] > 1000:
                queue[:0] = split_shard(shard)
                continue
            for page in range(1, (first['total_count'] + 99) // 100 + 1):
                page_key = query + f' page:{page}'
                if page_key in done:
                    continue
                response = first if page == 1 else github.get('/search/repositories',
                           {'q': query, 'per_page': 100, 'page': page, 'sort': 'stars'})
                if response.get('incomplete_results'):
                    raise RuntimeError('incomplete page; checkpoint retained')
                if any(repo.get('private') is not False for repo in response['items']):
                    raise RuntimeError('Refusing to checkpoint a non-public or unknown-visibility repository')
                pending = [repo for repo in response['items'] if str(repo['id']) not in state['repos']]
                pending = pending[:max(0, config['per_language'] - count)]
                for repo, readme in fetch_readmes(pending, Settings(), str(Path(checkpoint).with_suffix('.sqlite'))):
                    key = str(repo['id'])
                    state['repos'][key] = {field: repo.get(field) for field in (
                        'id', 'name', 'full_name', 'html_url', 'description', 'language', 'private',
                        'stargazers_count', 'pushed_at', 'topics')}
                    state['repos'][key]['readme'] = readme.decode('utf-8', errors='replace')
                    if len(state['repos']) % 20 == 0:
                        atomic_json(checkpoint, state)
                count = sum((r.get('language') or '').casefold() == language.casefold() for r in state['repos'].values())
                done.add(page_key)
                state['done'] = sorted(done)
                atomic_json(checkpoint, state)
                print(f'fetch {language} {count}/{config["per_language"]} total={len(state["repos"])}', flush=True)
                if count >= config['per_language']:
                    break
    atomic_json(output, list(state['repos'].values()))
    github.client.close()
    github.cache.close()
    print(f'wrote {len(state["repos"])} repositories to {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='scripts/collection.json')
    parser.add_argument('--checkpoint', default='data/checkpoint.json')
    parser.add_argument('--output', default='data/repos.json')
    parser.add_argument('--refresh', action='store_true', help='revisit shards with conditional ETag requests')
    args = parser.parse_args()
    collect(args.config, args.checkpoint, args.output, args.refresh)
