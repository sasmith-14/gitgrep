# One VM deployment

I would run this on one Ubuntu 24.04 VM with 4 vCPU, 8 GiB RAM and at least 40 GiB SSD, Docker Engine + Compose v2, and Caddy on the host. This is an operational starting budget, not a measured capacity guarantee for the uncollected full corpus. I did not provision a VM or publish a live URL.

`docker-compose.prod.yml` is a standalone file, not an override of the development file. ES authentication is explicitly enabled; ES and the embedding service have no host ports. Internal HTTP is limited to the VM's Docker bridge. Caddy terminates public TLS. If services move to separate hosts, enable ES HTTP/transport TLS before doing so. Keep ports 5050/5173 loopback-only, and allow inbound 80/443 (SSH from an admin address only). Set vm.max_map_count=1048576 persistently before starting ES.

## Bootstrap ES and keys

Run from the checkout on the VM. Install Docker/Compose and Caddy from their vendor packages first. Use a DNS name that resolves to this VM for the Caddy configuration below. The existing frontend still fetches localhost:5050; the frontend session must migrate it to same-origin /api/search before remote browser search works. The API can be deployed independently.

Create `.env.prod` with mode 0600; it is ignored by git:

```dotenv
ELASTIC_PASSWORD=<generate-a-long-random-password>
ES_API_KEY=bootstrap-placeholder
CORS_ORIGIN=https://your-actual-domain
```

The placeholder only permits Compose to parse while starting ES; it is not a valid backend credential. Start ES alone:

```sh
chmod 600 .env.prod
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --wait elasticsearch
```

Create a read-only key. The password is expanded inside the container, not pasted into host command history:

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T elasticsearch \
  sh -c 'curl -fsS -u "elastic:$ELASTIC_PASSWORD" -H "Content-Type: application/json" -d @- http://localhost:9200/_security/api_key' <<'JSON'
{"name":"gitgrep-api","role_descriptors":{"search":{"cluster":["monitor"],"indices":[{"names":["gitgrep","gitgrep-v*"],"privileges":["read","view_index_metadata"]}]}}}
JSON
```

Copy the returned `encoded` value into ES_API_KEY in `.env.prod`. Do not commit it or print it in CI logs. Create a separate write key for indexing, with indices privileges `manage`, `read`, `write`, `create_index` on the same index names and cluster `monitor`. Keep that key out of the backend environment. Key creation is a one-time admin operation; use API keys afterward and rotate them if disclosed.

## Start and seed

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build --wait
# Generate vectors inside the same baked model image; output persists in the pipeline volume.
docker compose --env-file .env.prod -f docker-compose.prod.yml exec embedding \
  python -m scripts.generate_embeddings --input tests/fixtures/repos.json
# Read a write key without echoing it, and use it for this indexing process only.
read -rs ES_WRITE_API_KEY
export ES_WRITE_API_KEY
docker compose --env-file .env.prod -f docker-compose.prod.yml exec \
  -e ES_URL=http://elasticsearch:9200 -e ES_API_KEY="$ES_WRITE_API_KEY" embedding \
  python -m scripts.indexing_repos --index gitgrep-v1
unset ES_WRITE_API_KEY
curl -fsS http://127.0.0.1:5050/readyz
curl -fsS 'http://127.0.0.1:5050/api/search?q=fastapi&size=1'
```

The sample is appropriate for deployment checks. For a full corpus, collect with GITHUB_TOKEN on a trusted machine, generate vectors with `make rebuild-data` against a dedicated target, and move the resulting artifact securely to the VM's pipeline volume. Do not expose a write key in the public API image. Full collection was not run in this session. The provided rebuild target is intended for an explicit ES_INDEX/environment; do not run it against a live alias until you have reviewed the new corpus.

Use Caddy's automatic HTTPS and send API traffic directly to the API's single trusted proxy hop:

```caddyfile
your-actual-domain {
    @api path /api/* /search
    handle @api {
        reverse_proxy 127.0.0.1:5050
    }
    @private path /metrics /readyz /healthz
    respond @private 404
    handle {
        reverse_proxy 127.0.0.1:5173
    }
}
```

Validate/reload Caddy after replacing the domain. TRUST_PROXY_HOPS=1 is valid only with this private backend binding and one trusted proxy. Do not publish backend directly with that setting, since forwarded IPs would become spoofable. Metrics and health endpoints stay accessible locally for monitoring, not through Caddy.

## Roll forward and back

Build the next corpus into gitgrep-v2. The indexer writes batches, records per-item failures and only atomically moves gitgrep after successful refresh. Validate counts, the fixture smoke path or an appropriate corpus-specific query set, and new-corpus evaluation before deleting gitgrep-v1. To roll back, send an atomic `_aliases` remove/add action restoring gitgrep-v1, using the indexing key. Runtime binaries can roll back by checking out the previous release commit and rebuilding; never merge old pre-cleanup git history into the rewritten repository.

Back up ES with snapshots to storage outside the VM, not by copying a live data directory. Test restore into a separate index before relying on a backup. Monitor disk space, readiness failures, degraded counter, stage p95 and cache-hit ratio. A single VM has no host failover and default replica count is zero. Per-process rate/cache state needs a shared store or gateway limiter before adding API replicas. Optional Grafana JSON was omitted.

No DNS record, TLS certificate, cloud resource, public endpoint or remote push was created in this session. Local production authentication checks, image/runtime checks, and any unresolved deploy checks are recorded in docs/evidence/phase-6.md.
