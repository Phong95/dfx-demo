// Generate a large DXF file (~28,000 entities, 52 layers) to test performance.
// Run: node test/fixtures/generate-large-dxf.mjs

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LAYER_COUNT = 52;
const ENTITIES_PER_LAYER = 535; // ~52 * 535 = 27,820 entities
const COLORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

const layerNames = [];
const layerCategories = [
  'S-BEAM', 'S-COLUMN', 'S-WALL', 'S-SLAB', 'S-FOOTING',
  'S-GRID', 'S-DIMS', 'S-TEXT', 'S-NOTES', 'S-DETAIL',
  'S-REBAR', 'S-STIRRUP', 'S-SECTION', 'S-ELEV', 'S-PLAN',
  'A-WALL', 'A-DOOR', 'A-WINDOW', 'A-STAIR', 'A-ROOF',
  'A-DIMS', 'A-TEXT', 'A-NOTES', 'A-HATCH', 'A-FURNITURE',
  'M-DUCT', 'M-PIPE', 'M-EQUIP', 'M-DIMS', 'M-TEXT',
  'E-POWER', 'E-LIGHT', 'E-PANEL', 'E-CONDUIT', 'E-TEXT',
  'P-WASTE', 'P-SUPPLY', 'P-FIXTURE', 'P-DIMS', 'P-TEXT',
  'C-TOPO', 'C-BOUNDARY', 'C-ROAD', 'C-GRADE', 'C-UTILITY',
  'G-BORDER', 'G-TITLEBLK', 'G-LOGO', 'G-REVISION', 'G-KEYNOTE',
  'DEFPOINTS', '0',
];

for (let i = 0; i < LAYER_COUNT; i++) {
  layerNames.push(layerCategories[i] || `LAYER-${i}`);
}

let dxf = '';

function w(line) { dxf += line + '\n'; }

// HEADER
w('0'); w('SECTION');
w('2'); w('HEADER');
w('9'); w('$ACADVER');
w('1'); w('AC1015');
w('9'); w('$EXTMIN');
w('10'); w('0.0');
w('20'); w('0.0');
w('30'); w('0.0');
w('9'); w('$EXTMAX');
w('10'); w('50000.0');
w('20'); w('50000.0');
w('30'); w('0.0');
w('0'); w('ENDSEC');

// TABLES - LAYERS
w('0'); w('SECTION');
w('2'); w('TABLES');
w('0'); w('TABLE');
w('2'); w('LAYER');
w('70'); w(String(LAYER_COUNT));

for (let i = 0; i < LAYER_COUNT; i++) {
  w('0'); w('LAYER');
  w('2'); w(layerNames[i]);
  w('70'); w('0');
  w('62'); w(String(COLORS[i % COLORS.length]));
  w('6'); w('CONTINUOUS');
}

w('0'); w('ENDTAB');
w('0'); w('ENDSEC');

// BLOCKS
w('0'); w('SECTION');
w('2'); w('BLOCKS');
w('0'); w('ENDSEC');

// ENTITIES
w('0'); w('SECTION');
w('2'); w('ENTITIES');

let entityCount = 0;

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

for (let li = 0; li < LAYER_COUNT; li++) {
  const layer = layerNames[li];
  const rand = rng(li * 12345 + 67890);
  const baseX = (li % 8) * 6000;
  const baseY = Math.floor(li / 8) * 6000;

  for (let ei = 0; ei < ENTITIES_PER_LAYER; ei++) {
    const entityType = ei % 6;
    const x = baseX + rand() * 5000;
    const y = baseY + rand() * 5000;

    switch (entityType) {
      case 0: { // LINE
        const x2 = x + (rand() - 0.5) * 500;
        const y2 = y + (rand() - 0.5) * 500;
        w('0'); w('LINE');
        w('8'); w(layer);
        w('10'); w(x.toFixed(4));
        w('20'); w(y.toFixed(4));
        w('30'); w('0.0');
        w('11'); w(x2.toFixed(4));
        w('21'); w(y2.toFixed(4));
        w('31'); w('0.0');
        break;
      }
      case 1: { // CIRCLE
        const r = 10 + rand() * 100;
        w('0'); w('CIRCLE');
        w('8'); w(layer);
        w('10'); w(x.toFixed(4));
        w('20'); w(y.toFixed(4));
        w('30'); w('0.0');
        w('40'); w(r.toFixed(4));
        break;
      }
      case 2: { // ARC
        const r = 20 + rand() * 80;
        const startAngle = rand() * 180;
        const endAngle = startAngle + 30 + rand() * 150;
        w('0'); w('ARC');
        w('8'); w(layer);
        w('10'); w(x.toFixed(4));
        w('20'); w(y.toFixed(4));
        w('30'); w('0.0');
        w('40'); w(r.toFixed(4));
        w('50'); w(startAngle.toFixed(2));
        w('51'); w(endAngle.toFixed(2));
        break;
      }
      case 3: { // TEXT
        w('0'); w('TEXT');
        w('8'); w(layer);
        w('10'); w(x.toFixed(4));
        w('20'); w(y.toFixed(4));
        w('30'); w('0.0');
        w('40'); w((5 + rand() * 20).toFixed(2));
        w('1'); w(`L${li}-E${ei}`);
        break;
      }
      case 4: { // LWPOLYLINE (rectangle)
        const pw = 50 + rand() * 200;
        const ph = 50 + rand() * 200;
        w('0'); w('LWPOLYLINE');
        w('8'); w(layer);
        w('90'); w('4');
        w('70'); w('1'); // closed
        w('10'); w(x.toFixed(4));
        w('20'); w(y.toFixed(4));
        w('10'); w((x + pw).toFixed(4));
        w('20'); w(y.toFixed(4));
        w('10'); w((x + pw).toFixed(4));
        w('20'); w((y + ph).toFixed(4));
        w('10'); w(x.toFixed(4));
        w('20'); w((y + ph).toFixed(4));
        break;
      }
      case 5: { // LINE (diagonal)
        const len = 100 + rand() * 400;
        const angle = rand() * Math.PI * 2;
        w('0'); w('LINE');
        w('8'); w(layer);
        w('10'); w(x.toFixed(4));
        w('20'); w(y.toFixed(4));
        w('30'); w('0.0');
        w('11'); w((x + Math.cos(angle) * len).toFixed(4));
        w('21'); w((y + Math.sin(angle) * len).toFixed(4));
        w('31'); w('0.0');
        break;
      }
    }
    entityCount++;
  }
}

w('0'); w('ENDSEC');
w('0'); w('EOF');

const outPath = join(__dirname, 'large-structural.dxf');
writeFileSync(outPath, dxf);
console.log(`Generated ${outPath}`);
console.log(`  Layers: ${LAYER_COUNT}`);
console.log(`  Entities: ${entityCount}`);
console.log(`  File size: ${(dxf.length / 1024 / 1024).toFixed(2)} MB`);
