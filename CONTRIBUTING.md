# Contributing

Start with the [quickstart](README.md#quickstart) and [development guide](docs/DEVELOPMENT.md). The [repository map](docs/README.md#repository-map) identifies the code, fixtures and generated artifacts.

Keep changes focused: describe the behavior before and after, add a regression check for a bug, and record the commands you actually ran. `make verify` covers lint, unit/property tests, real Elasticsearch integration, endpoint smoke checks and the fixture evaluation gate. It needs the seeded development stack. Run `make test` for a change that only needs the isolated unit/API tests.

## Contracts and data

- Preserve the response shapes, errors, query operators and timing headers in [API.md](docs/API.md). Update that document and call out any intentional contract change in the PR.
- Keep relevance judgments visibly provisional until reviewed. Follow [eval/README.md](eval/README.md) when changing labels; do not replace the regression baseline just to make a failing gate pass.
- Keep full datasets, model files, credentials, installed packages and generated build output out of Git. The checked-in 50-repo fixture is shared by integration tests and evaluation; changes require deliberate baseline review.
- For schema or model changes, use a new versioned index. Keep the previous index until the replacement is verified; see [DESIGN.md](docs/DESIGN.md).

## Dependencies and review

Use the existing TypeScript, pytest and Ruff checks. Add a dependency only when the platform or an existing library does not cover the need; pin it and commit its lockfile. `make audit` checks the backend and Python runtime. Frontend changes and audits belong in a separate, explicitly scoped change.

Write short commits around one change. Include relevant evidence and limitations in the PR; avoid unrelated formatting or generated-result churn. Root `npm test` and `npm run build` remain compatibility shortcuts for the backend, while Make is the entry point for the whole repository.

The repository history was cleaned of installed artifacts and large datasets. Existing clones from before that rewrite should re-clone rather than merge the old history back. Historical commands are preserved in [phase-1 evidence](docs/evidence/phase-1.md).
