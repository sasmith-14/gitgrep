# Fixture evaluation

Run: 2026-11-04T04:10:48.685Z. Embedding timeout 10000 ms. 50 queries, 50 repositories. **PROVISIONAL_ASSISTANT_AUTHORED_OWNER_REVIEW_REQUIRED**. Labels are provisional assistant judgments, not human ground truth. Unlisted repos count as zero for this experiment, so recall is only relative to nominated positives. Owner review is required in queries.json. This tiny Python-only sample is a correctness/regression fixture, not evidence of generalization.

Reproduce: `make eval` after `make seed`. CI: `make eval-check` (absolute nDCG tolerance 0.05 against reviewed-in baseline identity).

| Mode | nDCG@10 | MRR@10 | Recall@10 |
|---|---:|---:|---:|
| keyword | 0.7784 | 0.8381 | 0.7917 |
| semantic | 0.8034 | 0.8407 | 0.9067 |
| hybrid-RRF | 0.8239 | 0.8683 | 0.8967 |
| weighted-score | 0.8084 | 0.8547 | 0.8717 |
| hybrid+rerank | not run | not run | not run |
| alternative model | not run | not run | not run |

Weighted baseline adds 0.5×raw BM25 + 0.5×ES cosine score on the same candidate lists. It has no per-query normalization or tuned weight. RRF k=60. Optional cross-encoder and alternative model were omitted pending owner-reviewed labels; no quality benefit is claimed.

## Failure analysis

- **animate mathematical explanations**: keyword 0.0000, semantic 1.0000, RRF 0.5000. Lexical #1: pandas-dev/pandas; semantic #1: 3b1b/manim; fused #1: pytorch/pytorch. The primary match manim is semantic #1 but absent from the keyword top 10. pandas and pytorch collect votes from both lists on generic terms and move above it. A single strong semantic vote can lose to two weaker votes in RRF.
- **high throughput large language model inference**: keyword 0.9639, semantic 0.6194, RRF 0.6399. Lexical #1: vllm-project/vllm; semantic #1: openai/whisper; fused #1: openai/whisper. vllm is keyword #1/semantic #2 while whisper is keyword #2/semantic #1. Those reciprocal-rank sums tie exactly; the stable repo-ID tie break places whisper first. RRF discards the lexical score margin, which is useful for this query.
- **download videos from websites**: keyword 0.2754, semantic 0.5697, RRF 0.2754. Lexical #1: ytdl-org/youtube-dl; semantic #1: ytdl-org/youtube-dl; fused #1: ytdl-org/youtube-dl. youtube-dl is ranked #1 by both modes, but is only grade 1 in these labels; yt-dlp is grade 2 and appears in the semantic top 10 but not the keyword top 10. Fusion drops the preferred alternative below the cutoff. This is also a label-sensitive distinction between two similar tools.
- **RAG application framework**: keyword 0.2487, semantic 0.6131, RRF 0.3558. Lexical #1: Shubhamsaboo/awesome-llm-apps; semantic #1: open-webui/open-webui; fused #1: fastapi/fastapi. langchain is semantic #2 and keyword #9; generic framework matches get stronger agreement. fastapi is keyword #5/semantic #4 and becomes fused #1. The acronym plus broad application/framework wording admits lexical noise; the provisional positives also need owner review.
- **machine learning classification and regression**: keyword 0.6131, semantic 0.1065, RRF 0.3735. Lexical #1: practical-tutorials/project-based-learning; semantic #1: vinta/awesome-python; fused #1: vinta/awesome-python. scikit-learn is keyword #2 but absent from the semantic top 10. Broad Python/ML collections overlap in both lists and outrank the specific library after fusion. The rank-only rule cannot preserve the lexical lead when semantic evidence is weak.

## Provenance

Model: sentence-transformers/all-MiniLM-L6-v2@c9745ed1d9f207416be6d2e6f8de32d1f16199bf. ES 9.4.3. Fixture SHA256 9d7b9a62ef5b2d28a04183b1385863c1f61542c34ab3b8b2856672d14dbd9315; labels SHA256 a2e9c6cf601e2b7328772eaa93df68c14ee09611d0ea59a6b273d05ed03e9e1b. Recorded per-query rankings: eval/fixture-run.json; latest local run is also in eval/runs/latest.json.
