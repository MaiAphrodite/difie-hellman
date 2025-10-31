// Conway's Game of Life as a subtle animated background with engineered patterns
// Non-intrusive: fixed canvas behind content, pointer-events: none
// Choose pattern via URL query, e.g., ?life=gosper or ?life=glider&pulsar
// Options: life=(mix|guns|gliders|spaceships|gosper|pulsar|glider|lwss|mwss|hwss|rpentomino|acorn|random|dense|ultra|battle)
//          speed=FPS (default 24), cell=px (default auto 8..12), color=hex or css, alpha=0..1, density=0.5..3 (or dens=)
//          battle-specific: ally=<css color>, enemy=<css color>, wave=<ms>, growth=<num>, base=<num>

(() => {
  'use strict';

  // Skip if SSR or canvas unsupported
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Read URL params
  const params = new URLSearchParams(window.location.search);
  const patternParam = (params.get('life') || '').toLowerCase();
  const emitParam = (params.get('emit') || '').toLowerCase();
  const speedParam = parseFloat(params.get('speed') || '') || 24;
  const cellParam = parseInt(params.get('cell') || '', 10);
  const colorParam = params.get('color') || 'rgb(99 102 241)'; // indigo-500
  const alphaParam = Math.max(0, Math.min(1, parseFloat(params.get('alpha') || '0.12')));
  const densRaw = params.get('density') || params.get('dens');
  let densityFactor = Number.isFinite(parseFloat(densRaw)) ? parseFloat(densRaw) : 1.5; // default slightly denser
  if (patternParam === 'dense') densityFactor = Math.max(densityFactor, 1.8);
  if (patternParam === 'ultra') densityFactor = Math.max(densityFactor, 2.5);
  densityFactor = Math.max(0.5, Math.min(3.0, densityFactor));
  const isBattle = patternParam === 'battle' || /^(1|true|on)$/i.test(params.get('battle') || '');
  const allyColorParam = params.get('ally') || 'rgb(16 185 129)'; // emerald-500
  const enemyColorParam = params.get('enemy') || 'rgb(239 68 68)'; // red-500
  const waveMs = Math.max(1200, parseInt(params.get('wave') || '3500', 10));
  const waveGrowth = Math.max(0, parseInt(params.get('growth') || '1', 10));
  const waveBase = Math.max(1, parseInt(params.get('base') || '3', 10));

  // Canvas setup
  const canvas = document.createElement('canvas');
  canvas.className = 'life-bg';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });

  // Sizing
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 0, H = 0, cols = 0, rows = 0, cell = 10;

  // Grids
  let gridA = null, gridB = null;
  // Ownership grids (for battle mode): 0 none, 1 ally, 2 enemy
  let ownerA = null, ownerB = null;

  // Timing
  const fps = Math.max(6, Math.min(60, speedParam));
  const stepMs = 1000 / fps;
  let lastTs = 0;
  let stableFrames = 0;
  let lastAlive = 0;
  let emitTimer = null;
  const emitEnabled = !(emitParam === '0' || emitParam === 'false' || emitParam === 'off');

  // Drawing style
  const fillStyle = alphaParam < 1 ? withAlpha(colorParam, alphaParam) : colorParam;
  const allyFill = alphaParam < 1 ? withAlpha(allyColorParam, alphaParam) : allyColorParam;
  const enemyFill = alphaParam < 1 ? withAlpha(enemyColorParam, alphaParam) : enemyColorParam;

  // Pattern definitions (relative coordinates)
  const PATTERNS = {
    glider: [ [1,0],[2,1],[0,2],[1,2],[2,2] ],
    lwss: [
      [1,0],[2,0],[3,0],[4,0],
      [0,1],[4,1],
      [4,2],
      [0,3],[3,3]
    ],
    mwss: [
      [1,0],[2,0],[3,0],[4,0],[5,0],
      [0,1],[5,1],
      [5,2],
      [0,3],[4,3],
      [2,4]
    ],
    hwss: [
      [1,0],[2,0],[3,0],[4,0],[5,0],[6,0],
      [0,1],[6,1],
      [6,2],
      [0,3],[5,3],
      [2,4],[3,4]
    ],
    rpentomino: [ [1,0],[2,0],[0,1],[1,1],[1,2] ],
    acorn: [ [1,0],[3,1],[0,2],[1,2],[4,2],[5,2],[6,2] ],
    // basic oscillators
    blinker: [ [0,0],[1,0],[2,0] ],
    toad: [ [1,0],[2,0],[3,0],[0,1],[1,1],[2,1] ],
    beacon: [ [0,0],[1,0],[0,1],[1,1],[2,2],[3,2],[2,3],[3,3] ],
    pentadecathlon: (() => {
      const lines = [
        '..1....1..',
        '11.1111.11',
        '..1....1..'
      ];
      const coords = [];
      for (let y = 0; y < lines.length; y++) {
        const row = lines[y];
        for (let x = 0; x < row.length; x++) if (row[x] === '1') coords.push([x, y]);
      }
      return coords;
    })(),
    // still lifes for texture
    block: [ [0,0],[1,0],[0,1],[1,1] ],
    beehive: [ [1,0],[2,0],[0,1],[3,1],[1,2],[2,2] ],
    loaf: [ [1,0],[2,0],[0,1],[3,1],[1,2],[3,2],[2,3] ],
    boat: [ [0,0],[1,0],[0,1],[2,1],[1,2] ],
    tub: [ [1,0],[0,1],[2,1],[1,2] ],
    // Pulsar: 48-cell period-3 oscillator (size 13x13). Define via lines for brevity
    pulsar: (() => {
      const coords = [];
      const lines = [
        '0000000000000',
        '0001110001110',
        '0000000000000',
        '1000010000010',
        '1000010000010',
        '1000010000010',
        '0001110001110',
        '0000000000000',
        '0001110001110',
        '1000010000010',
        '1000010000010',
        '1000010000010',
        '0000000000000'
      ];
      for (let y = 0; y < lines.length; y++) {
        const row = lines[y];
        for (let x = 0; x < row.length; x++) {
          if (row[x] === '1') coords.push([x, y]);
        }
      }
      return coords;
    })(),
    // Gosper glider gun
    gosper: (() => {
      // From canonical pattern; origin near left
      const c = [];
      const add = (x, y) => c.push([x, y]);
      // left square
      add(1,5); add(1,6); add(2,5); add(2,6);
      // left launcher
      add(13,3); add(14,3); add(12,4); add(16,4); add(11,5); add(17,5); add(11,6); add(15,6); add(17,6); add(18,6); add(11,7); add(17,7); add(12,8); add(16,8); add(13,9); add(14,9);
      // right launcher
      add(25,1); add(23,2); add(25,2); add(21,3); add(22,3); add(21,4); add(22,4); add(21,5); add(22,5); add(23,6); add(25,6); add(25,7);
      // far right square
      add(35,3); add(36,3); add(35,4); add(36,4);
      return c;
    })()
  };

  function withAlpha(color, alpha) {
    // If color is hex, convert to rgba; else wrap current color into rgba via canvas
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.fillStyle = color;
    const norm = tmp.fillStyle; // resolved color
    // Extract rgb(...) -> numbers
    const m = /rgb[a]?\(([^)]+)\)/.exec(norm);
    if (m) {
      const parts = m[1].split(',').map(s => parseFloat(s.trim()));
      const [r,g,b] = parts;
      return `rgba(${r|0}, ${g|0}, ${b|0}, ${alpha})`;
    }
    return color; // fallback
  }

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = window.innerWidth;
    H = window.innerHeight;
    // Auto cell size by viewport; aim ~30k cells max
    if (Number.isFinite(cellParam) && cellParam >= 4 && cellParam <= 40) {
      cell = cellParam;
    } else {
      const targetCells = 32000;
      const approx = Math.sqrt((W * H) / targetCells);
      cell = Math.max(6, Math.min(14, Math.round(approx)));
    }
    cols = Math.max(10, Math.floor(W / cell));
    rows = Math.max(10, Math.floor(H / cell));

    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    gridA = new Uint8Array(cols * rows);
    gridB = new Uint8Array(cols * rows);
    ownerA = new Uint8Array(cols * rows);
    ownerB = new Uint8Array(cols * rows);

    seed();
  }

  function idx(x, y) { return y * cols + x; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < cols && y < rows; }

  function stamp(coords, ox, oy) {
    for (const [dx, dy] of coords) {
      const x = (ox + dx + cols) % cols;
      const y = (oy + dy + rows) % rows;
      gridA[idx(x, y)] = 1;
    }
  }

  function stampOwner(coords, ox, oy, own) {
    for (const [dx, dy] of coords) {
      const x = (ox + dx + cols) % cols;
      const y = (oy + dy + rows) % rows;
      gridA[idx(x, y)] = 1;
      ownerA[idx(x, y)] = own;
    }
  }

  function rotate(coords, times = 0) {
    // rotate within bounding box by 90 degrees times
    let out = coords.map(([x, y]) => [x, y]);
    for (let t = 0; t < (times % 4 + 4) % 4; t++) {
      // find bbox
      let maxX = 0, maxY = 0;
      for (const [x, y] of out) { if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
      const next = out.map(([x, y]) => [y, maxX - x]);
      out = next;
    }
    return out;
  }

  function seed() {
    gridA.fill(0);
    ownerA && ownerA.fill(0);

    const preset = patternParam || 'mix';

    if (isBattle) { seedBattle(); return; }

    const placeGuns = () => {
      const base = PATTERNS.gosper;
      const yTop = Math.max(1, Math.floor(rows*0.2) - 6);
      const yMid = Math.max(1, Math.floor(rows*0.5) - 6);
      const yBot = Math.max(1, Math.floor(rows*0.8) - 6);
      const spacing = Math.max(40, Math.floor(cols/3));
      for (let x = 2; x < cols - 40; x += spacing) {
        stamp(base, x, yTop);
      }
      if (cols > 70) {
        for (let x = Math.floor(spacing/2); x < cols - 40; x += spacing) {
          stamp(base, x, yBot);
        }
      }
      // Optional middle one if huge
      if (cols > 120 && rows > 50) {
        stamp(base, Math.floor(cols*0.5 - 20), yMid);
      }
    };

    const placeGliders = (countMul = 1) => {
      const base = PATTERNS.glider;
      const baseCount = (cols*rows)/7000;
      const count = Math.max(8, Math.floor(baseCount * densityFactor * countMul));
      for (let i = 0; i < count; i++) {
        const r = Math.floor(Math.random()*4);
        const pattern = rotate(base, r);
        const ox = Math.floor(Math.random()*(cols-10)) + 1;
        const oy = Math.floor(Math.random()*(rows-10)) + 1;
        stamp(pattern, ox, oy);
      }
    };

    const placeShips = (countMul = 1) => {
      const types = [PATTERNS.lwss, PATTERNS.mwss, PATTERNS.hwss];
      const baseCount = (cols*rows)/15000;
      const count = Math.max(6, Math.floor(baseCount * densityFactor * countMul));
      for (let i = 0; i < count; i++) {
        const base = types[i % types.length];
        const r = Math.floor(Math.random()*4);
        const pattern = rotate(base, r);
        const ox = Math.floor(Math.random()*(cols-24)) + 1;
        const oy = Math.floor(Math.random()*(rows-24)) + 1;
        stamp(pattern, ox, oy);
      }
    };

    const placeOsc = () => {
      // Rich oscillator tiling with probability scaled by density
      const oscList = [
        { p: PATTERNS.pulsar, w:13, h:13 },
        { p: PATTERNS.pentadecathlon, w:10, h:3 },
        { p: PATTERNS.beacon, w:4, h:4 },
        { p: PATTERNS.toad, w:4, h:2 },
        { p: PATTERNS.blinker, w:3, h:1 }
      ];
      const cellW = 18, cellH = 18;
      const nx = Math.max(1, Math.floor(cols / cellW));
      const ny = Math.max(1, Math.floor(rows / cellH));
      const prob = Math.min(0.6, 0.25 * densityFactor);
      for (let yi = 0; yi < ny; yi++) {
        for (let xi = 0; xi < nx; xi++) {
          if (Math.random() < prob) {
            const sel = oscList[Math.floor(Math.random()*oscList.length)];
            const ox = xi*cellW + Math.floor((cellW - sel.w)/2);
            const oy = yi*cellH + Math.floor((cellH - sel.h)/2);
            stamp(sel.p, ox, oy);
          }
        }
      }
    };

    const placeStill = () => {
      const stills = [PATTERNS.block, PATTERNS.beehive, PATTERNS.loaf, PATTERNS.boat, PATTERNS.tub];
      const baseCount = (cols*rows)/9000;
      const count = Math.floor(baseCount * densityFactor);
      for (let i = 0; i < count; i++) {
        const base = stills[i % stills.length];
        const ox = Math.floor(Math.random()*(cols-8)) + 1;
        const oy = Math.floor(Math.random()*(rows-8)) + 1;
        stamp(base, ox, oy);
      }
    };

    if (preset === 'guns') {
      placeGuns();
      placeOsc();
      placeGliders(1);
    } else if (preset === 'gliders') {
      placeGliders(2);
    } else if (preset === 'spaceships') {
      placeShips(2);
    } else if (preset === 'gosper') {
      // Backward compat
      placeGuns();
      placeGliders(1);
    } else if (preset === 'pulsar') {
      placeOsc();
    } else if (preset === 'lwss' || preset === 'mwss' || preset === 'hwss') {
      // Sprinkle only that ship type
      const base = PATTERNS[preset];
      const count = Math.max(4, Math.floor((cols*rows)/14000));
      for (let i = 0; i < count; i++) {
        const r = Math.floor(Math.random()*4);
        const pattern = rotate(base, r);
        const ox = Math.floor(Math.random()*(cols-24)) + 1;
        const oy = Math.floor(Math.random()*(rows-24)) + 1;
        stamp(pattern, ox, oy);
      }
    } else if (preset === 'glider') {
      placeGliders();
    } else {
      // mix (default): a bit of everything for a fuller background
      if (cols > 60 && rows > 30) placeGuns();
      placeOsc();
      placeGliders(1);
      placeShips(1);
      placeStill();
      // tiny random dust to avoid empty patches
      const density = 0.015 * densityFactor;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (Math.random() < density) gridA[idx(x,y)] = 1;
        }
      }
    }
  }

  function seedBattle() {
    // Two sides: ally (1) from left/top; enemy (2) from right/bottom
    const leftY = Math.floor(rows*0.25);
    const midY = Math.floor(rows*0.5);
    const rightY = Math.floor(rows*0.75);
    const margin = 2;
    const allyShips = [PATTERNS.lwss, PATTERNS.mwss, PATTERNS.hwss];
    const enemyShips = [PATTERNS.lwss, PATTERNS.mwss, PATTERNS.hwss];

    // Ally: left edge moving right (rot 0)
    for (const y of [leftY, midY, rightY]) {
      stampOwner(rotate(allyShips[0], 0), margin, Math.max(1, y-2), 1);
      if (cols > 60) stampOwner(rotate(allyShips[1], 0), margin+10, Math.max(1, y+3), 1);
    }
    // Ally: top row moving down (rot 1)
    for (let x = 8; x < cols*0.35; x += 18) {
      stampOwner(rotate(allyShips[(x/18)%3|0], 1), x, margin, 1);
    }

    // Enemy: right edge moving left (rot 2)
    for (const y of [leftY, midY, rightY]) {
      stampOwner(rotate(enemyShips[0], 2), cols - 10, Math.max(1, y-3), 2);
      if (cols > 60) stampOwner(rotate(enemyShips[1], 2), cols - 20, Math.max(1, y+2), 2);
    }
    // Enemy: bottom row moving up (rot 3)
    for (let x = Math.floor(cols*0.65); x < cols - 8; x += 18) {
      stampOwner(rotate(enemyShips[(x/18)%3|0], 3), x, rows - 10, 2);
    }

    // Optional: mirrored gosper guns toward center
    if (cols > 70 && rows > 35) {
      const gun = PATTERNS.gosper;
      stampOwner(rotate(gun, 0), 2, Math.max(2, Math.floor(rows/2) - 6), 1);
      stampOwner(rotate(gun, 2), Math.max(2, cols - 40), Math.max(2, Math.floor(rows/2) - 6), 2);
    }
  }

  // Inject dynamic movers over time to prevent stagnation
  function injectGliders(count = 4) {
    const base = PATTERNS.glider;
    for (let i = 0; i < count; i++) {
      if (isBattle) {
        const side = Math.random() < 0.5 ? 1 : 2;
        const rot = side === 1 ? (Math.random()<0.5?0:1) : (Math.random()<0.5?2:3);
        const pattern = rotate(base, rot);
        const x = side === 1 ? 1 : (cols - 10);
        const y = Math.floor(Math.random()*(rows-10)) + 2;
        stampOwner(pattern, x, y, side);
      } else {
        const r = Math.floor(Math.random()*4);
        const pattern = rotate(base, r);
        const ox = Math.floor(Math.random()*(cols-10)) + 1;
        const oy = Math.floor(Math.random()*(rows-10)) + 1;
        stamp(pattern, ox, oy);
      }
    }
  }

  function injectShips(count = 3) {
    const types = [PATTERNS.lwss, PATTERNS.mwss, PATTERNS.hwss];
    for (let i = 0; i < count; i++) {
      const base = types[i % types.length];
      if (isBattle) {
        const side = Math.random() < 0.5 ? 1 : 2;
        const rot = side === 1 ? (Math.random()<0.5?0:1) : (Math.random()<0.5?2:3);
        const pattern = rotate(base, rot);
        const x = side === 1 ? 1 : (cols - 24);
        const y = Math.floor(Math.random()*(rows-24)) + 1;
        stampOwner(pattern, x, y, side);
      } else {
        const r = Math.floor(Math.random()*4);
        const pattern = rotate(base, r);
        const ox = Math.floor(Math.random()*(cols-24)) + 1;
        const oy = Math.floor(Math.random()*(rows-24)) + 1;
        stamp(pattern, ox, oy);
      }
    }
  }

  function emitSpaceship() {
    // Emit a spaceship from a random edge moving inward
    const edges = ['left','right','top','bottom'];
    const edge = edges[Math.floor(Math.random()*edges.length)];
    const ship = [PATTERNS.lwss, PATTERNS.mwss, PATTERNS.hwss][Math.floor(Math.random()*3)];
    let rotation = 0, ox = 1, oy = 1;
    if (edge === 'left') { rotation = 0; ox = 1; oy = Math.floor(Math.random()*(rows-10)) + 2; }
    if (edge === 'right') { rotation = 2; ox = cols - 8; oy = Math.floor(Math.random()*(rows-10)) + 2; }
    if (edge === 'top') { rotation = 1; oy = 1; ox = Math.floor(Math.random()*(cols-10)) + 2; }
    if (edge === 'bottom') { rotation = 3; oy = rows - 8; ox = Math.floor(Math.random()*(cols-10)) + 2; }
    const pattern = rotate(ship, rotation);
    if (isBattle) {
      const side = (edge === 'left' || edge === 'top') ? 1 : 2;
      stampOwner(pattern, ox, oy, side);
    } else {
      stamp(pattern, ox, oy);
    }
  }

  function startEmitters() {
    if (!emitEnabled) return;
    if (emitTimer) clearInterval(emitTimer);
    // Emit every few seconds; adjust by density
    const interval = Math.max(1500, 4000 / densityFactor);
    emitTimer = setInterval(emitSpaceship, interval);
  }

  // Battle wave spawner: increases wave size over time
  let waveTimer = null, waveIndex = 0;
  function startBattleWaves() {
    if (!isBattle) return;
    if (waveTimer) clearInterval(waveTimer);
    waveIndex = 0;
    waveTimer = setInterval(() => {
      const count = waveBase + waveIndex * waveGrowth;
      for (let i = 0; i < count; i++) {
        // Ally wave (left/top)
        const sidePick = Math.random() < 0.5 ? 'left' : 'top';
        const ship = [PATTERNS.lwss, PATTERNS.mwss, PATTERNS.hwss][Math.floor(Math.random()*3)];
        const rot = sidePick === 'left' ? 0 : 1;
        const x = sidePick === 'left' ? 1 : Math.floor(Math.random()*(cols-10)) + 2;
        const y = sidePick === 'left' ? Math.floor(Math.random()*(rows-10)) + 2 : 1;
        stampOwner(rotate(ship, rot), x, y, 1);

        // Enemy wave (right/bottom)
        const sidePick2 = Math.random() < 0.5 ? 'right' : 'bottom';
        const ship2 = [PATTERNS.lwss, PATTERNS.mwss, PATTERNS.hwss][Math.floor(Math.random()*3)];
        const rot2 = sidePick2 === 'right' ? 2 : 3;
        const x2 = sidePick2 === 'right' ? cols - 10 : Math.floor(Math.random()*(cols-10)) + 2;
        const y2 = sidePick2 === 'right' ? Math.floor(Math.random()*(rows-10)) + 2 : rows - 10;
        stampOwner(rotate(ship2, rot2), x2, y2, 2);
      }
      waveIndex++;
    }, waveMs);
  }

  function step() {
    const a = gridA, b = gridB;
    const w = cols, h = rows;
    let aliveNext = 0;
    let changed = 0;
    for (let y = 0; y < h; y++) {
      const yUp = (y === 0 ? h-1 : y-1);
      const yDn = (y === h-1 ? 0 : y+1);
      for (let x = 0; x < w; x++) {
        const xLt = (x === 0 ? w-1 : x-1);
        const xRt = (x === w-1 ? 0 : x+1);
        const n00 = a[idx(xLt, yUp)], n10 = a[idx(x, yUp)], n20 = a[idx(xRt, yUp)];
        const n01 = a[idx(xLt, y   )],            n21 = a[idx(xRt, y   )];
        const n02 = a[idx(xLt, yDn)], n12 = a[idx(x, yDn)], n22 = a[idx(xRt, yDn)];
        const n = n00 + n10 + n20 + n01 + n21 + n02 + n12 + n22;
        const cur = a[idx(x, y)];
        const nxt = (n === 3 || (cur === 1 && n === 2)) ? 1 : 0;
        b[idx(x, y)] = nxt;
        aliveNext += nxt;
        if (nxt !== cur) changed++;

        if (isBattle) {
          // Determine ownership by majority of living neighbors; tie -> keep current owner if alive
          let allyN = 0, enemyN = 0;
          if (n00) (ownerA[idx(xLt, yUp)] === 1 ? allyN++ : ownerA[idx(xLt, yUp)] === 2 ? enemyN++ : 0);
          if (n10) (ownerA[idx(x, yUp)] === 1 ? allyN++ : ownerA[idx(x, yUp)] === 2 ? enemyN++ : 0);
          if (n20) (ownerA[idx(xRt, yUp)] === 1 ? allyN++ : ownerA[idx(xRt, yUp)] === 2 ? enemyN++ : 0);
          if (n01) (ownerA[idx(xLt, y)] === 1 ? allyN++ : ownerA[idx(xLt, y)] === 2 ? enemyN++ : 0);
          if (n21) (ownerA[idx(xRt, y)] === 1 ? allyN++ : ownerA[idx(xRt, y)] === 2 ? enemyN++ : 0);
          if (n02) (ownerA[idx(xLt, yDn)] === 1 ? allyN++ : ownerA[idx(xLt, yDn)] === 2 ? enemyN++ : 0);
          if (n12) (ownerA[idx(x, yDn)] === 1 ? allyN++ : ownerA[idx(x, yDn)] === 2 ? enemyN++ : 0);
          if (n22) (ownerA[idx(xRt, yDn)] === 1 ? allyN++ : ownerA[idx(xRt, yDn)] === 2 ? enemyN++ : 0);
          let ownNext = 0;
          if (nxt) {
            if (allyN > enemyN) ownNext = 1; else if (enemyN > allyN) ownNext = 2; else ownNext = cur ? ownerA[idx(x,y)] : 0;
          }
          ownerB[idx(x,y)] = ownNext;
        }
      }
    }
    // swap
    const tmp = gridA; gridA = gridB; gridB = tmp;
    if (isBattle) { const t2 = ownerA; ownerA = ownerB; ownerB = t2; }
    // stagnation detection: if almost no cells changed or alive is tiny, inject movers
    const total = w * h;
    if (changed < total * 0.002 || aliveNext < total * 0.003 || aliveNext === lastAlive) {
      stableFrames++;
    } else {
      stableFrames = 0;
    }
    lastAlive = aliveNext;
    if (!isBattle) {
      if (stableFrames > Math.max(60, 150 / densityFactor)) { // ~2-6 seconds
        injectShips(4);
        injectGliders(6);
        stableFrames = 0;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const size = cell;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (gridA[idx(x,y)]) {
          if (isBattle) {
            const own = ownerA[idx(x,y)];
            ctx.fillStyle = own === 1 ? allyFill : own === 2 ? enemyFill : fillStyle;
          } else {
            ctx.fillStyle = fillStyle;
          }
          ctx.fillRect(x*size, y*size, size, size);
        }
      }
    }
  }

  function animate(ts) {
    if (!lastTs) lastTs = ts;
    const delta = ts - lastTs;
    if (delta >= stepMs) {
      step();
      draw();
      lastTs = ts;
    }
    requestAnimationFrame(animate);
  }

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); }, 120);
  }

  // Init
  resize();
  window.addEventListener('resize', onResize);
  if (isBattle) {
    startBattleWaves();
  } else {
    startEmitters();
  }
  requestAnimationFrame(animate);
})();
