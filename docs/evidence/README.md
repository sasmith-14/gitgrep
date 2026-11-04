# Execution evidence

This directory contains recorded observations, not promises about a later run. Historical phase reports preserve the context at the time; references there to an unpushed repository predate the owner's subsequent publication request.

| Record | Contents |
|---|---|
| [Repository cleanup](organization.txt) | Tests before publication, moved operational checks, stack rebuild and repeat seed |
| [Final acceptance](phase-6.md) | Commands, outcomes and unresolved work from the backend overhaul |
| [Verification output](verification.txt) | Tests, endpoint smoke, evaluation gate, dependency audits and failure checks |
| [Compose build](compose-build.txt) | Full-stack image build/start output |
| [Repeat seed](seed-repeat.txt) | Cached vectors and zero changed index documents |
| [Benchmark run](benchmark-run.txt) | Recorded load-test command and output |
| [API responses](api/) | Actual response bodies and request/timing headers |
| [History cleanup](phase-1.md) | Backup, filter-repo command and original remote tip |

Phase reports [2](phase-2.md), [3](phase-3.md), [4](phase-4.md) and [5](phase-5.md) explain intermediate decisions and checks. The current [evaluation](../../eval/RESULTS.md) and [benchmark](../../eval/BENCHMARK.md) reports include the measured dataset/runtime conditions. Local scratch captures belong under ignored `local/`.
