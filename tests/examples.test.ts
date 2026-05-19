import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenePlan } from '../src/core/dsl.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';
import { assetNames } from '../src/core/assets/registry.js';

const examples = ['spaceship-nebula.plan.json', 'superman-flying.plan.json'];

describe('example plans', () => {
  for (const file of examples) {
    it(`${file} parses against ScenePlan`, () => {
      const raw = readFileSync(join(__dirname, '..', 'examples', file), 'utf8');
      const result = ScenePlan.safeParse(JSON.parse(raw));
      if (!result.success) console.error(JSON.stringify(result.error.format(), null, 2));
      expect(result.success).toBe(true);
    });
  }

  it('all sprite assets referenced in examples exist in registry', () => {
    registerBuiltins();
    const known = new Set(assetNames());
    for (const file of examples) {
      const raw = readFileSync(join(__dirname, '..', 'examples', file), 'utf8');
      const plan = ScenePlan.parse(JSON.parse(raw));
      for (const shot of plan.shots) {
        for (const layer of shot.layers) {
          if (layer.type === 'sprite') {
            expect(known.has(layer.asset), `unknown sprite '${layer.asset}' in ${file}`).toBe(true);
          }
        }
      }
    }
  });
});
