# Phase 1

Baseline: 25,784 tracked files, venv 654 MB, .git 181 MB. After rewriting: 41 tracked files, .git 284 KB (before new source/fixtures).

Commands run locally, no push:

```sh
git bundle create /private/tmp/gitgrep-before-cleanup/history.bundle --all
git switch -c phase-1-hygiene
uv tool run --from git-filter-repo git-filter-repo --force \
  --path venv/ --path node_modules/ --path backend/node_modules/ \
  --path data/repos.json --path data/repos_with_embeddings.json --invert-paths
git remote add origin https://github.com/sasmith-14/search_engine_project.git
```

The backup bundle and original data under /private/tmp/gitgrep-before-cleanup are intentionally outside the repo. filter-repo removes origin; I restored the actual original URL. Original main was 3 commits ahead; all first-party revisions remain in rewritten ancestry. Existing untracked .gitignore retained and extended. Fixture: 50 real records from the prior snapshot, README capped at 12,000 characters per record, 498,844 bytes. It is Python-only; it is a test corpus, not a claim of language coverage.

After review, coordinate with other clone owners; then replace the remote's branches explicitly (do not use --mirror):

```sh
# Check the actual destination before changing it.
git remote -v
git push --force-with-lease=refs/heads/main:3257ef90897cf19208e3d2eaeaa10d158131b3ce origin phase-6-infra:main
# Delete obsolete remote branches/tags individually if they retain old blobs.
# Other clone owners should re-clone, not merge the old history back.
```

No full-stack claim at this phase: original quickstart was already broken; ES image pull and environment installation started for the subsequent phase's smoke run. Sandbox DNS denied PyPI/npm; repeated with approved network access. Docker Desktop was started successfully.
