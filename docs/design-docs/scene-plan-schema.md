# Scene plan schema

NL planner output is a JSON document. Strict zod schema at adapter boundary. Vocabulary (shot / scene / sequence / keyframe / transition) is defined in [video-vocabulary.md](video-vocabulary.md); this file specifies the wire format per version.

## Shape (draft)

```ts
{
  version: 1,
  title: string,
  totalDurationMs: number,
  shots: Array<{
    id: string,
    startMs: number,
    durationMs: number,
    imagePrompt: string,      // for image-gen adapter
    motion?: 'pan-left' | 'pan-right' | 'zoom-in' | 'zoom-out' | 'static',
    audioCue?: string,
  }>,
  audio?: { trackPath?: string, gainDb?: number },
}
```

## Constraints

- `sum(shots[i].durationMs) === totalDurationMs` within ±50ms.
- Shot ids unique.
- `imagePrompt` non-empty, ≤500 chars.

## Failure modes

- Malformed JSON → planner retries up to 3 times with stricter system prompt.
- Schema validation fail after retries → exit with diagnostic.
