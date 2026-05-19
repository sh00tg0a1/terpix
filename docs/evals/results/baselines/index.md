# Baselines

Snapshot results live in this directory as JSON summaries:

```
2026-05-19-planner-capability.json
2026-05-19-encoder-snapshot.json
```

CI publishes the latest run as a workflow artifact and copies into git on `main` merges where a baseline-shift was reviewed.

Format (sketch):

```json
{
  "suite": "planner-capability",
  "run_id": "2026-05-19T10:00:00Z",
  "model": "claude-sonnet-4-6",
  "tasks": [
    { "id": "planner-spaceship-nebula", "trials": 3, "pass_at_1": 1.0, "pass_pow_3": 0.66 }
  ]
}
```
