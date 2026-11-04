# Balanced-search acceptance, 2026-11-04

Commands actually run:

- `make lint test integration balanced-seed balanced-check`: lint passed; 6 Python tests and 16 Node unit/property/API tests passed; original integration suite passed 2 with the balanced-only test skipped; balanced integration passed all 3. The repeated balanced seed reported documents=50, changed=0, failed=0.
- `FRONTEND_PORT=5174 docker compose up -d --build --wait`: all four images/services built and healthy. The project moved from Documents/search_engine to Documents/projects/main/gitgrep during execution. The local pytest/uvicorn entry points were reinstalled after their virtualenv paths became invalid. Docker Desktop also stopped during the run; unavailable-upstream test failures were diagnosed, Docker restarted, then the full checks passed again.
- Old balanced-v1 format: an assert-based call to the real indexer verified ValueError before writes; balanced-v2 is the final flat-passage format.
- `uv run --frozen python -m infra.checks.smoke --output docs/evidence/local/balanced-release-api`: all expected 200/400/404 statuses and response/header checks passed.
- `npm --prefix backend run build`: passed. API response shapes remain unchanged.
- `make architecture-pdf`: reproducible command for the delivered guide. Authoring used ReportLab 4.4.3. PyMuPDF 1.26.4 rendered all 13 pages; all text blocks fit page bounds. Every page was visually inspected through a contact sheet, with full-page checks of the cover and architecture/balanced diagrams. Intermediate renders live outside the repo under /private/tmp/gitgrep-pdf-review.

Final measured comparison and conditions: [BALANCED.md](../BALANCED.md), [raw result artifact](../../eval/balanced-results.json). No process/container RAM saving or large-corpus shortlist recall is claimed. Chunk search remains the default because balanced was slower on this fixture. Remote CI and larger-corpus collection are unverified.
