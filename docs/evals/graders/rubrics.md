# LLM-as-judge rubrics

## prompt-fidelity

**Scoring**: 0–5 integer.

| Score | Criterion |
|---|---|
| 5 | Every shot's imagePrompt clearly evokes the user's prompt; motion choices reinforce mood. |
| 4 | Most shots align; one shot drifts but plausibly connects. |
| 3 | Half the shots align; rest are generic. |
| 2 | One shot aligns; rest are unrelated. |
| 1 | No shot reflects the user's prompt. |
| 0 | Output is unusable / non-JSON / hallucinated structure. |

**Escape hatch**: judge may output `"unknown"` if prompt is in language judge cannot read; mark task as needs-human-review.

**Calibration**: 10 human-labeled samples per quarter; if judge-human Spearman < 0.7, retune rubric.

## terminal-output-aesthetic (future)

Reserved for subjective evaluation of rendered frames vs ground-truth video.
