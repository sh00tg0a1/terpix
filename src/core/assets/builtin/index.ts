import { getAsset, registerAsset } from '../registry.js';
import { drawSpaceship } from './spaceship.js';
import { drawPlanet } from './planet.js';
import { drawMoon } from './moon.js';
import { drawStar } from './star.js';
import { drawMountain } from './mountain.js';
import { drawTree } from './tree.js';
import { drawSuperman } from './superman.js';
import { drawHuman } from './human.js';
import { drawTable } from './table.js';
import {
  drawStarAscii,
  drawDroidAscii,
  drawHumanAscii,
  drawPlanetAscii,
  drawMoonAscii,
  drawMountainAscii,
  drawTreeAscii,
  drawSpaceshipAscii,
  drawSupermanAscii,
  drawTableAscii,
} from './ascii-art.js';

export function registerBuiltins(): void {
  if (getAsset('spaceship')?.source === 'builtin') return;
  registerAsset({
    name: 'spaceship',
    description: 'a sleek triangular spacecraft with a thrust trail facing right',
    source: 'builtin',
    metrics: { aspect: 1.2, anchor: 'center' },
    draw: drawSpaceship,
    drawAscii: drawSpaceshipAscii,
  });
  registerAsset({
    name: 'planet',
    description: 'a colored sphere with a shaded crescent (planet body)',
    source: 'builtin',
    metrics: { aspect: 1.0, anchor: 'center' },
    draw: drawPlanet,
    drawAscii: drawPlanetAscii,
  });
  registerAsset({
    name: 'moon',
    description: 'a pale-grey sphere with a few darker craters',
    source: 'builtin',
    metrics: { aspect: 1.0, anchor: 'center' },
    draw: drawMoon,
    drawAscii: drawMoonAscii,
  });
  registerAsset({
    name: 'star',
    description: 'a compact bright dot with a radiating cross (large foreground star)',
    source: 'builtin',
    metrics: { aspect: 1.0, anchor: 'center' },
    draw: drawStar,
    drawAscii: drawStarAscii,
  });
  registerAsset({
    name: 'droid',
    description: 'a small ASCII droid character (R2-D2-ish), only available in ascii renderer',
    source: 'builtin',
    metrics: { aspect: 0.7, anchor: 'bottom' },
    draw: () => {
      throw new Error("asset 'droid' is ascii-only; render with --renderer ascii");
    },
    drawAscii: drawDroidAscii,
  });
  registerAsset({
    name: 'human',
    description: 'a simple standing person silhouette: round head, torso, two arms, two legs (use for people / a crowd)',
    source: 'builtin',
    metrics: { aspect: 0.45, anchor: 'bottom' },
    draw: drawHuman,
    drawAscii: drawHumanAscii,
  });
  registerAsset({
    name: 'mountain',
    description: 'a triangular peak with a white snow cap',
    source: 'builtin',
    metrics: { aspect: 1.0, anchor: 'bottom' },
    draw: drawMountain,
    drawAscii: drawMountainAscii,
  });
  registerAsset({
    name: 'tree',
    description: 'a coniferous tree: triangular foliage on a brown rectangular trunk',
    source: 'builtin',
    metrics: { aspect: 0.6, anchor: 'bottom' },
    draw: drawTree,
    drawAscii: drawTreeAscii,
  });
  registerAsset({
    name: 'superman',
    description: 'a flying superhero: head + cape billowing behind + outstretched arms; faces and flies up by default',
    source: 'builtin',
    metrics: { aspect: 1.0, anchor: 'center' },
    draw: drawSuperman,
    drawAscii: drawSupermanAscii,
  });
  registerAsset({
    name: 'table',
    description: 'a simple side-on table: flat top surface on two legs (use for dining / interior scenes; rest food sprites just above its top)',
    source: 'builtin',
    metrics: { aspect: 2.0, anchor: 'bottom' },
    draw: drawTable,
    drawAscii: drawTableAscii,
  });
}
