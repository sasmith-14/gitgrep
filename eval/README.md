# Labels need owner review

I wrote 50 provisional query judgments against the 50 checked-in repositories. They include exact names, intents, synonyms, acronyms and typos. This is not a human-labeled benchmark or a held-out evaluation. Grade 2 means direct fit, grade 1 a related alternative, grade 0 other fixture records. False zeros can materially change nDCG and recall.

Owner task: edit `queries.json`, inspect all fixture repos for each query, correct grades and explanations, and fill `ownerReview.reviewedBy` / `reviewedAt`. Re-run `make eval`. Change the baseline only with an explicit review using `make eval-baseline`; `make eval-check` never overwrites it. Report both label revisions if comparing results.

The metrics implementation is tested against a hand-calculated list. All retrievals use the production Node search code and actual ES + embeddings. Degradation aborts evaluation. Optional reranker and alternative embedding model are explicitly unrun; they should be evaluated after label review, using a dedicated index for each model.
