import { getAsset, registerAsset } from '../registry.js';
import { drawSpaceship } from './spaceship.js';
import { drawPlanet } from './planet.js';
import { drawMoon } from './moon.js';
import { drawStar } from './star.js';
import { drawMountain } from './mountain.js';
import { drawTree } from './tree.js';
import { drawSuperman } from './superman.js';

export function registerBuiltins(): void {
  if (getAsset('spaceship')?.source === 'builtin') return;
  registerAsset({
    name: 'spaceship',
    description: 'a sleek triangular spacecraft with a thrust trail facing right',
    source: 'builtin',
    draw: drawSpaceship,
  });
  registerAsset({
    name: 'planet',
    description: 'a colored sphere with a shaded crescent (planet body)',
    source: 'builtin',
    draw: drawPlanet,
  });
  registerAsset({
    name: 'moon',
    description: 'a pale-grey sphere with a few darker craters',
    source: 'builtin',
    draw: drawMoon,
  });
  registerAsset({
    name: 'star',
    description: 'a compact bright dot with a radiating cross (large foreground star)',
    source: 'builtin',
    draw: drawStar,
  });
  registerAsset({
    name: 'mountain',
    description: 'a triangular peak with a white snow cap',
    source: 'builtin',
    draw: drawMountain,
  });
  registerAsset({
    name: 'tree',
    description: 'a coniferous tree: triangular foliage on a brown rectangular trunk',
    source: 'builtin',
    draw: drawTree,
  });
  registerAsset({
    name: 'superman',
    description: 'a flying superhero: head + cape billowing behind + outstretched arms; faces and flies up by default',
    source: 'builtin',
    draw: drawSuperman,
  });
}
