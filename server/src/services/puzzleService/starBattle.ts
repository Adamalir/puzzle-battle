import type { StarBattlePuzzle } from '../../types/index';

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function strToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIRS4: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIRS8: [number, number][] = [
  [-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],
];

// ── Step 1: Region generation with guaranteed corner + edge forcing shapes ────
//
// Two forcing region types are pre-planted before random Voronoi fills the rest:
//
//   CORNER regions — k+1 cells anchored at a grid corner (L-shape or straight).
//     Player sees a tiny region; with one row/col exclusion the star is forced.
//
//   EDGE-STRIP region — exactly k adjacent rows (or k cols) along a grid edge,
//     k+2 to 2k cells wide.  rowSpan = k → confinement rule fires immediately,
//     eliminating those rows from every other region's candidates.
//
// numCornerRegions = 2 for k≤2 (easy/medium), 1 for k≥3 (hard).
// Always 1 edge-strip region regardless of difficulty.
// Remaining n - numForcing regions fill via unbiased random Voronoi (Phase 3),
// producing organic irregular shapes rather than uniform blobs.

function growRegions(size: number, k: number, rng: () => number): number[][] | null {
  const n = size;
  const regions: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const regSize   = new Array(n).fill(0);
  const regMinRow = new Array(n).fill(size);
  const regMaxRow = new Array(n).fill(-1);
  const regMinCol = new Array(n).fill(size);
  const regMaxCol = new Array(n).fill(-1);

  const seeds: [number, number][] = [];
  let nextReg = 0;

  function addCell(reg: number, r: number, c: number): void {
    regions[r][c] = reg;
    regSize[reg]++;
    if (r < regMinRow[reg]) regMinRow[reg] = r;
    if (r > regMaxRow[reg]) regMaxRow[reg] = r;
    if (c < regMinCol[reg]) regMinCol[reg] = c;
    if (c > regMaxCol[reg]) regMaxCol[reg] = c;
  }

  const minSeedSep = Math.max(2, Math.floor(size / Math.sqrt(n)));

  function pickFreeCell(minSep: number, trials = 8000): [number, number] | null {
    for (let t = 0; t < trials; t++) {
      const r = Math.floor(rng() * size);
      const c = Math.floor(rng() * size);
      if (regions[r][c] !== -1) continue;
      let ok = true;
      for (const [sr, sc] of seeds)
        if (Math.abs(r - sr) + Math.abs(c - sc) < minSep) { ok = false; break; }
      if (ok) return [r, c];
    }
    for (let sep = minSep - 1; sep >= 1; sep--) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (regions[r][c] !== -1) continue;
          let ok = true;
          for (const [sr, sc] of seeds)
            if (Math.abs(r - sr) + Math.abs(c - sc) < sep) { ok = false; break; }
          if (ok) return [r, c];
        }
      }
    }
    return null;
  }

  // ── Phase 1A: Corner-strip regions (k ≤ 2 only) ─────────────────────────────
  // A straight strip of k+2 cells along one edge of a grid corner.
  // Example for k=1: (0,0)→(0,1)→(0,2) — 3 cells; 1 star forced once a row/col used.
  // Example for k=2: (0,0)→(0,1)→(0,2)→(0,3) — 4 cells; stars at (0,0)&(0,2) etc.
  //
  // WHY straight-line only: L-shaped corners with k+2 cells cannot hold k non-adjacent
  // stars (every cell pair is within 8-directional reach), so placeStarsRowByRow fails.
  // k=3 corner regions need ≥7 cells to hold 3 non-adjacent stars — too large to look
  // like a "corner" — so we skip corners for k≥3 and use two edge strips instead.
  if (k <= 2) {
    const cornerTarget = k + 2; // straight strip of k+2 cells from corner
    const cornerList   = shuffle<[number, number]>(
      [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]], rng,
    );

    for (let ci = 0; ci < 2; ci++) {
      const [cr, cc] = cornerList[ci];
      const reg = nextReg++;
      addCell(reg, cr, cc);
      seeds.push([cr, cc]);

      // Grow in ONE direction only (horizontal or vertical) along the corner edge.
      const horizontal = rng() < 0.5;
      const dirR = horizontal ? 0 : (cr === 0 ? 1 : -1);
      const dirC = horizontal ? (cc === 0 ? 1 : -1) : 0;

      for (let step = 1; step < cornerTarget; step++) {
        const nr = cr + dirR * step;
        const nc = cc + dirC * step;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
        if (regions[nr][nc] !== -1) break; // blocked by another region
        addCell(reg, nr, nc);
      }
      if (regSize[reg] < k + 1) return null; // not enough room for k stars
    }
  }

  // ── Phase 1B: Edge-strip region(s) ───────────────────────────────────────────
  // A strip confined to exactly k adjacent rows (or k cols) along a grid edge.
  // rowSpan = k  ⟹  the confinement rule fires immediately (those k rows are "used").
  //
  // k ≤ 2: 1 strip (complements the 2 corner regions).
  // k = 3: 2 strips (replaces corners entirely — one row-strip, one col-strip).
  //        Two strips give the player two immediate logical footholds on hard puzzles.
  const numEdgeStrips = k >= 3 ? 2 : 1;
  const edgeChoices   = shuffle<'top' | 'bottom' | 'left' | 'right'>(
    ['top', 'bottom', 'left', 'right'], rng,
  );

  for (let si = 0; si < numEdgeStrips; si++) {
    const edgeReg = nextReg++;
    const edge    = edgeChoices[si];
    const minW = k + 2; // free-dimension width: enough for k non-adjacent stars + gaps
    const maxW = k + 4;
    const w    = minW + Math.floor(rng() * (maxW - minW + 1));

    if (edge === 'top' || edge === 'bottom') {
      const rowStart = edge === 'top' ? 0 : size - k;
      const maxCS = size - w;
      if (maxCS < 0) return null;
      const cStart = Math.floor(rng() * (maxCS + 1));
      for (let r = rowStart; r < rowStart + k; r++)
        for (let c = cStart; c < cStart + w; c++)
          if (r >= 0 && r < size && c >= 0 && c < size && regions[r][c] === -1)
            addCell(edgeReg, r, c);
      seeds.push([rowStart + Math.floor(k / 2), cStart + Math.floor(w / 2)]);
    } else {
      const colStart = edge === 'left' ? 0 : size - k;
      const maxRS = size - w;
      if (maxRS < 0) return null;
      const rStart = Math.floor(rng() * (maxRS + 1));
      for (let r = rStart; r < rStart + w; r++)
        for (let c = colStart; c < colStart + k; c++)
          if (r >= 0 && r < size && c >= 0 && c < size && regions[r][c] === -1)
            addCell(edgeReg, r, c);
      seeds.push([rStart + Math.floor(w / 2), colStart + Math.floor(k / 2)]);
    }
    if (regSize[edgeReg] < k + 1) return null; // too few cells
  }

  const numForcing = nextReg; // forcing regions: indices 0..numForcing-1

  // ── Phase 2: spread seeds for remaining regions ────────────────────────────
  for (let reg = numForcing; reg < n; reg++) {
    const seed = pickFreeCell(minSeedSep);
    if (!seed) return null;
    addCell(reg, seed[0], seed[1]);
    seeds.push(seed);
  }

  // ── Phase 3: unbiased Voronoi expansion (organic irregular shapes) ───────────
  // Only non-forcing regions grow — forcing regions keep their planted shape.
  const MAXROWSPAN = k + 2;
  const MAXCOLSPAN = Math.ceil(size / k);

  const frontiers: [number, number][][] = Array.from({ length: n }, () => []);
  for (let reg = 0; reg < n; reg++) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (regions[r][c] !== reg) continue;
        for (const [dr, dc] of DIRS4) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1)
            frontiers[reg].push([nr, nc]);
        }
      }
    }
  }

  let assigned = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (regions[r][c] !== -1) assigned++;
  const total = size * size;

  const orderBuf = Array.from({ length: n - numForcing }, (_, i) => i + numForcing);

  while (assigned < total) {
    shuffle(orderBuf, rng);
    let anyExpanded = false;

    for (const reg of orderBuf) {
      frontiers[reg] = frontiers[reg].filter(([r, c]) => regions[r][c] === -1);
      if (frontiers[reg].length === 0) continue;

      const valid = frontiers[reg].filter(([r, c]) => {
        if (Math.max(regMaxRow[reg], r) - Math.min(regMinRow[reg], r) + 1 > MAXROWSPAN) return false;
        if (Math.max(regMaxCol[reg], c) - Math.min(regMinCol[reg], c) + 1 > MAXCOLSPAN) return false;
        return true;
      });
      if (valid.length === 0) continue;

      const [nr, nc] = valid[Math.floor(rng() * valid.length)];
      const fi = frontiers[reg].findIndex(([r, c]) => r === nr && c === nc);
      if (fi !== -1) frontiers[reg].splice(fi, 1);

      addCell(reg, nr, nc);
      assigned++;
      anyExpanded = true;

      for (const [dr, dc] of DIRS4) {
        const nnr = nr + dr, nnc = nc + dc;
        if (nnr >= 0 && nnr < size && nnc >= 0 && nnc < size && regions[nnr][nnc] === -1)
          frontiers[reg].push([nnr, nnc]);
      }
    }

    if (!anyExpanded) break;
  }

  // ── Phase 4: flood-fill orphaned cells ────────────────────────────────────────
  // CRITICAL: never expand a forcing region in a way that destroys its property.
  // A forcing region remains forcing as long as any one of these holds:
  //   size ≤ k+2  |  rowSpan ≤ k  |  colSpan ≤ k
  function canAddToForcing(reg: number, nr: number, nc: number): boolean {
    const newRowSpan = Math.max(regMaxRow[reg], nr) - Math.min(regMinRow[reg], nr) + 1;
    const newColSpan = Math.max(regMaxCol[reg], nc) - Math.min(regMinCol[reg], nc) + 1;
    const newSize    = regSize[reg] + 1;
    return newSize <= k + 2 || newRowSpan <= k || newColSpan <= k;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (regions[r][c] !== -1) continue;
        let bestReg = -1, bestSize = Infinity;
        // First preference: non-forcing neighbour (never harms forcing shapes)
        for (const [dr, dc] of DIRS4) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const reg = regions[nr][nc];
          if (reg >= numForcing && regSize[reg] < bestSize) { bestReg = reg; bestSize = regSize[reg]; }
        }
        if (bestReg === -1) {
          // Only forcing neighbours available; add only if property is preserved
          for (const [dr, dc] of DIRS4) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const reg = regions[nr][nc];
            if (reg >= 0 && reg < numForcing && regSize[reg] < bestSize && canAddToForcing(reg, r, c))
              { bestReg = reg; bestSize = regSize[reg]; }
          }
        }
        if (bestReg !== -1) { addCell(bestReg, r, c); changed = true; }
      }
    }
  }
  // BFS last resort for isolated orphans (all neighbours would destroy forcing props)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] !== -1) continue;
      const q: [number, number][] = [[r, c]];
      const vis = new Set<number>([r * size + c]);
      let found = false;
      while (q.length && !found) {
        const [qr, qc] = q.shift()!;
        for (const [dr, dc] of DIRS4) {
          const nr = qr + dr, nc = qc + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const key = nr * size + nc;
          if (vis.has(key)) continue;
          vis.add(key);
          // Prefer non-forcing; allow forcing only if property preserved
          const reg = regions[nr][nc];
          if (reg >= numForcing) { addCell(reg, r, c); found = true; break; }
          if (reg >= 0 && canAddToForcing(reg, r, c)) { addCell(reg, r, c); found = true; break; }
          if (reg === -1) q.push([nr, nc]);
        }
      }
      // Absolute last resort — assign to nearest region regardless of forcing impact
      if (!found) {
        const q2: [number, number][] = [[r, c]];
        const vis2 = new Set<number>([r * size + c]);
        while (q2.length && !found) {
          const [qr, qc] = q2.shift()!;
          for (const [dr, dc] of DIRS4) {
            const nr = qr + dr, nc = qc + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const key = nr * size + nc;
            if (vis2.has(key)) continue;
            vis2.add(key);
            if (regions[nr][nc] >= 0) { addCell(regions[nr][nc], r, c); found = true; break; }
            q2.push([nr, nc]);
          }
        }
      }
    }
  }

  // ── Post-validate: forcing regions must still be forcing ──────────────────────
  // If Phase 4 had to expand a forcing region beyond its property, discard this
  // attempt entirely rather than return a puzzle with no obvious starting moves.
  for (let reg = 0; reg < numForcing; reg++) {
    const rowSpan = regMaxRow[reg] - regMinRow[reg] + 1;
    const colSpan = regMaxCol[reg] - regMinCol[reg] + 1;
    if (regSize[reg] > k + 2 && rowSpan > k && colSpan > k) return null;
  }

  return regions;
}

// Count how many regions are "forcing" — immediately constraining for the player.
// Used to gate puzzle acceptance in generateStarBattle.
function countForcingRegions(size: number, k: number, regions: number[][]): number {
  const regCells: [number, number][][] = Array.from({ length: size }, () => []);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const reg = regions[r][c];
      if (reg >= 0 && reg < size) regCells[reg].push([r, c]);
    }
  let count = 0;
  for (let reg = 0; reg < size; reg++) {
    const cells = regCells[reg];
    if (cells.length === 0) continue;
    const rowSpan = new Set(cells.map(([r]) => r)).size;
    const colSpan = new Set(cells.map(([, c]) => c)).size;
    // Small region OR tightly row/col-confined
    if (cells.length <= k + 2 || rowSpan <= k || colSpan <= k) count++;
  }
  return count;
}

// ── Step 2: place stars via row-by-row backtracking ───────────────────────────

function placeStarsRowByRow(
  size: number,
  k: number,
  regions: number[][],
  rng: () => number,
): boolean[][] | null {
  const grid: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const colCount = new Array(size).fill(0);
  const regCount = new Array(size).fill(0);

  const regRowAvail: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      regRowAvail[regions[r][c]][r]++;

  const rowColOrder: number[][] = Array.from(
    { length: size },
    (_, r) => shuffle(Array.from({ length: size }, (_, c) => c), rng),
  );

  const callLimit = size > 10 ? 500_000 : size > 8 ? 500_000 : 200_000;
  let calls = 0;

  function adjacent(r: number, c: number): boolean {
    for (const [dr, dc] of DIRS8) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc]) return true;
    }
    return false;
  }

  function bt(row: number, placed: number, colIdx: number): boolean {
    if (++calls > callLimit) return false;
    if (placed === k) {
      if (row + 1 === size) {
        return colCount.every(v => v === k) && regCount.every(v => v === k);
      }
      for (let reg = 0; reg < size; reg++) {
        const need = k - regCount[reg];
        if (need <= 0) continue;
        let avail = 0;
        for (let r = row + 1; r < size; r++) avail += regRowAvail[reg][r];
        if (avail < need) return false;
      }
      return bt(row + 1, 0, 0);
    }
    const cols = rowColOrder[row];
    for (let i = colIdx; i < cols.length; i++) {
      const c = cols[i];
      const reg = regions[row][c];
      if (colCount[c] < k && regCount[reg] < k && !adjacent(row, c)) {
        grid[row][c] = true; colCount[c]++; regCount[reg]++;
        if (bt(row, placed + 1, i + 1)) return true;
        grid[row][c] = false; colCount[c]--; regCount[reg]--;
      }
    }
    return false;
  }

  return bt(0, 0, 0) ? grid : null;
}

// ── Step 3: logical solvability check ────────────────────────────────────────
//
// Rules:
//   1. Saturation    – unit with k stars → exclude rest
//   2. Forced        – unit with exactly k remaining cells → confirm
//   3. Confinement   – region confined to one row/col → exclude other cells
//   4. Rev-confine   – row/col confined to one region → exclude region elsewhere
//   5. Subset-confine– regions confined to row r with total need ≥ k−rowSt[r]
//                      → no other region may use row r
//   6. Trial elim    – placing a star leaves some unit infeasible → exclude
//
// feasible() uses Hall's theorem: sum of needs of regions confined to a single
// row (or col) must not exceed that unit's remaining capacity.

function logicalSolve(
  size: number,
  k: number,
  regions: number[][],
  preHints?: boolean[][],
): { solved: boolean; initialMarks: boolean[][] } {
  const poss: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(true));
  const conf: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const rowSt = new Array(size).fill(0);
  const colSt = new Array(size).fill(0);
  const regSt = new Array(size).fill(0);

  const regCells: [number,number][][] = Array.from({ length: size }, () => []);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const reg = regions[r][c];
      if (reg >= 0 && reg < size) regCells[reg].push([r, c]);
    }

  let firstConfirmed = false;
  const initialMarks: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  let anyChange = false;

  function excl(r: number, c: number): void {
    if (!poss[r][c] || conf[r][c]) return;
    poss[r][c] = false;
    if (!firstConfirmed) initialMarks[r][c] = true;
    anyChange = true;
  }

  function confirm(r: number, c: number): void {
    if (conf[r][c] || !poss[r][c]) return;
    if (!firstConfirmed) firstConfirmed = true;
    conf[r][c] = true;
    rowSt[r]++; colSt[c]++; regSt[regions[r][c]]++;
    for (const [dr, dc] of DIRS8) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) excl(nr, nc);
    }
    anyChange = true;
  }

  function feasible(): boolean {
    for (let r = 0; r < size; r++) {
      let av = 0;
      for (let c = 0; c < size; c++) if (poss[r][c] && !conf[r][c]) av++;
      if (rowSt[r] + av < k) return false;
    }
    for (let c = 0; c < size; c++) {
      let av = 0;
      for (let r = 0; r < size; r++) if (poss[r][c] && !conf[r][c]) av++;
      if (colSt[c] + av < k) return false;
    }
    for (let reg = 0; reg < size; reg++) {
      let av = 0;
      for (const [r, c] of regCells[reg]) if (poss[r][c] && !conf[r][c]) av++;
      if (regSt[reg] + av < k) return false;
    }
    // Hall's theorem — rows
    for (let r = 0; r < size; r++) {
      let rowNeeds = 0;
      for (let reg = 0; reg < size; reg++) {
        if (regSt[reg] >= k) continue;
        const av = regCells[reg].filter(([r2, c2]) => poss[r2][c2] && !conf[r2][c2]);
        if (av.length === 0) continue;
        if (av.every(([r2]) => r2 === r)) rowNeeds += k - regSt[reg];
      }
      if (rowNeeds > k - rowSt[r]) return false;
    }
    // Hall's theorem — cols
    for (let c = 0; c < size; c++) {
      let colNeeds = 0;
      for (let reg = 0; reg < size; reg++) {
        if (regSt[reg] >= k) continue;
        const av = regCells[reg].filter(([r2, c2]) => poss[r2][c2] && !conf[r2][c2]);
        if (av.length === 0) continue;
        if (av.every(([, c2]) => c2 === c)) colNeeds += k - regSt[reg];
      }
      if (colNeeds > k - colSt[c]) return false;
    }
    return true;
  }

  function isSolved(): boolean {
    return rowSt.every(v => v === k) && colSt.every(v => v === k) && regSt.every(v => v === k);
  }

  function applyRules(): void {
    anyChange = false;

    // Rule 1: Saturation
    for (let r = 0; r < size; r++)
      if (rowSt[r] === k) for (let c = 0; c < size; c++) excl(r, c);
    for (let c = 0; c < size; c++)
      if (colSt[c] === k) for (let r = 0; r < size; r++) excl(r, c);
    for (let reg = 0; reg < size; reg++)
      if (regSt[reg] === k) for (const [r, c] of regCells[reg]) excl(r, c);

    // Rule 2: Forced placement
    for (let r = 0; r < size; r++) {
      const av: number[] = [];
      for (let c = 0; c < size; c++) if (poss[r][c] && !conf[r][c]) av.push(c);
      if (k - rowSt[r] > 0 && av.length === k - rowSt[r]) av.forEach(c => confirm(r, c));
    }
    for (let c = 0; c < size; c++) {
      const av: number[] = [];
      for (let r = 0; r < size; r++) if (poss[r][c] && !conf[r][c]) av.push(r);
      if (k - colSt[c] > 0 && av.length === k - colSt[c]) av.forEach(r => confirm(r, c));
    }
    for (let reg = 0; reg < size; reg++) {
      const av = regCells[reg].filter(([r, c]) => poss[r][c] && !conf[r][c]);
      if (k - regSt[reg] > 0 && av.length === k - regSt[reg]) av.forEach(([r, c]) => confirm(r, c));
    }

    // Rule 3: Region confined to single row/col
    for (let reg = 0; reg < size; reg++) {
      const need = k - regSt[reg];
      if (need <= 0) continue;
      const av = regCells[reg].filter(([r, c]) => poss[r][c] && !conf[r][c]);
      if (av.length === 0) continue;
      const rows = new Set(av.map(([r]) => r));
      const cols = new Set(av.map(([, c]) => c));
      if (rows.size === 1) {
        const row = [...rows][0];
        if (need >= k - rowSt[row])
          for (let c = 0; c < size; c++) if (regions[row][c] !== reg) excl(row, c);
      }
      if (cols.size === 1) {
        const col = [...cols][0];
        if (need >= k - colSt[col])
          for (let r = 0; r < size; r++) if (regions[r][col] !== reg) excl(r, col);
      }
    }

    // Rule 4: Row/col confined to single region
    for (let r = 0; r < size; r++) {
      const need = k - rowSt[r];
      if (need <= 0) continue;
      const regs = new Set<number>();
      for (let c = 0; c < size; c++) if (poss[r][c] && !conf[r][c]) regs.add(regions[r][c]);
      if (regs.size === 1) {
        const reg = [...regs][0];
        if (need === k - regSt[reg])
          for (const [r2, c2] of regCells[reg]) if (r2 !== r) excl(r2, c2);
      }
    }
    for (let c = 0; c < size; c++) {
      const need = k - colSt[c];
      if (need <= 0) continue;
      const regs = new Set<number>();
      for (let r = 0; r < size; r++) if (poss[r][c] && !conf[r][c]) regs.add(regions[r][c]);
      if (regs.size === 1) {
        const reg = [...regs][0];
        if (need === k - regSt[reg])
          for (const [r2, c2] of regCells[reg]) if (c2 !== c) excl(r2, c2);
      }
    }

    // Rule 5: Subset confinement
    for (let r = 0; r < size; r++) {
      const rowNeed = k - rowSt[r];
      if (rowNeed <= 0) continue;
      const confinedRegs: number[] = [];
      let needSum = 0;
      for (let reg = 0; reg < size; reg++) {
        if (regSt[reg] >= k) continue;
        const av = regCells[reg].filter(([r2, c2]) => poss[r2][c2] && !conf[r2][c2]);
        if (av.length === 0) continue;
        if (av.every(([r2]) => r2 === r)) { confinedRegs.push(reg); needSum += k - regSt[reg]; }
      }
      if (needSum >= rowNeed) {
        const cs = new Set(confinedRegs);
        for (let c = 0; c < size; c++)
          if (poss[r][c] && !conf[r][c] && !cs.has(regions[r][c])) excl(r, c);
      }
    }
    for (let c = 0; c < size; c++) {
      const colNeed = k - colSt[c];
      if (colNeed <= 0) continue;
      const confinedRegs: number[] = [];
      let needSum = 0;
      for (let reg = 0; reg < size; reg++) {
        if (regSt[reg] >= k) continue;
        const av = regCells[reg].filter(([r2, c2]) => poss[r2][c2] && !conf[r2][c2]);
        if (av.length === 0) continue;
        if (av.every(([, c2]) => c2 === c)) { confinedRegs.push(reg); needSum += k - regSt[reg]; }
      }
      if (needSum >= colNeed) {
        const cs = new Set(confinedRegs);
        for (let r = 0; r < size; r++)
          if (poss[r][c] && !conf[r][c] && !cs.has(regions[r][c])) excl(r, c);
      }
    }
  }

  function trialElimination(): boolean {
    let progress = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!poss[r][c] || conf[r][c]) continue;
        const sPoss = poss.map(row => [...row]);
        const sConf = conf.map(row => [...row]);
        const sRowSt = [...rowSt]; const sColSt = [...colSt]; const sRegSt = [...regSt];
        const sInit = initialMarks.map(row => [...row]);
        const sFirstConf = firstConfirmed;

        confirm(r, c);
        let trialChange = true;
        while (trialChange) { applyRules(); trialChange = anyChange; }
        const contradiction = !feasible();

        for (let r2 = 0; r2 < size; r2++) {
          poss[r2] = sPoss[r2]; conf[r2] = sConf[r2]; initialMarks[r2] = sInit[r2];
        }
        rowSt.splice(0, size, ...sRowSt);
        colSt.splice(0, size, ...sColSt);
        regSt.splice(0, size, ...sRegSt);
        firstConfirmed = sFirstConf;
        anyChange = false;

        if (contradiction) { excl(r, c); progress = true; }
      }
    }
    return progress;
  }

  // Pre-confirm any hint stars (pre-placed for easy/medium/hard)
  if (preHints) {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (preHints[r][c]) confirm(r, c);
    firstConfirmed = false; // reset so initialMarks records pre-hint eliminations
  }

  while (true) {
    let progress = true;
    while (progress) { applyRules(); progress = anyChange; }
    if (isSolved()) return { solved: true, initialMarks };
    if (!feasible()) return { solved: false, initialMarks };
    if (trialElimination()) continue;
    break;
  }

  return { solved: isSolved(), initialMarks };
}

// ── Hint selection ────────────────────────────────────────────────────────────

function pickHints(size: number, solution: boolean[][], numHints: number, rng: () => number): boolean[][] {
  const stars: [number, number][] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (solution[r][c]) stars.push([r, c]);
  const shuffled = shuffle(stars, rng);
  const step = Math.max(1, Math.floor(shuffled.length / numHints));
  const hints: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  for (let i = 0; i < numHints; i++) {
    const [r, c] = shuffled[i * step];
    hints[r][c] = true;
  }
  return hints;
}

// ── Initial-dots computation ──────────────────────────────────────────────────
//
// Produces the set of cells that are LOGICALLY EXCLUDED at puzzle load time
// (using only non-trial deduction, Rules 1–5), so players always start with
// visible dots that provide an obvious logical entry point.
//
// Crucially, this captures adjacency exclusions from hint stars that logicalSolve
// misses due to the firstConfirmed timing issue.

function computeInitialDots(
  size: number,
  k: number,
  regions: number[][],
  hints?: boolean[][],
): { dots: boolean[][]; hasStartingMove: boolean } {
  const poss: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(true));
  const conf: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const rowSt = new Array(size).fill(0);
  const colSt = new Array(size).fill(0);
  const regSt = new Array(size).fill(0);
  const dots: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const regCells: [number, number][][] = Array.from({ length: size }, () => []);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const reg = regions[r][c];
      if (reg >= 0 && reg < size) regCells[reg].push([r, c]);
    }

  let anyChange = false;

  function excl(r: number, c: number): void {
    if (!poss[r][c] || conf[r][c]) return;
    poss[r][c] = false;
    dots[r][c] = true;
    anyChange = true;
  }

  function star(r: number, c: number): void {
    if (conf[r][c] || !poss[r][c]) return;
    conf[r][c] = true;
    rowSt[r]++; colSt[c]++; regSt[regions[r][c]]++;
    // Exclude all 8 neighbours
    for (const [dr, dc] of DIRS8) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) excl(nr, nc);
    }
    anyChange = true;
  }

  // Confirm all hint stars — adjacency exclusions are captured as dots right away
  if (hints) {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (hints[r][c]) star(r, c);
    // Hint cells themselves should not appear as dots
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (hints[r][c]) dots[r][c] = false;
  }

  // Propagate Rules 1–5 (no trial elimination) until stable
  function applyRules(): void {
    anyChange = false;

    // Rule 1: Saturation — unit already has k stars → exclude all remaining
    for (let r = 0; r < size; r++)
      if (rowSt[r] === k) for (let c = 0; c < size; c++) excl(r, c);
    for (let c = 0; c < size; c++)
      if (colSt[c] === k) for (let r = 0; r < size; r++) excl(r, c);
    for (let reg = 0; reg < size; reg++)
      if (regSt[reg] === k) for (const [r, c] of regCells[reg]) excl(r, c);

    // Rule 2: Forced — only k cells remain in unit → all are stars
    for (let r = 0; r < size; r++) {
      const av: number[] = [];
      for (let c = 0; c < size; c++) if (poss[r][c] && !conf[r][c]) av.push(c);
      if (k - rowSt[r] > 0 && av.length === k - rowSt[r]) av.forEach(c => star(r, c));
    }
    for (let c = 0; c < size; c++) {
      const av: number[] = [];
      for (let r = 0; r < size; r++) if (poss[r][c] && !conf[r][c]) av.push(r);
      if (k - colSt[c] > 0 && av.length === k - colSt[c]) av.forEach(r => star(r, c));
    }
    for (let reg = 0; reg < size; reg++) {
      const av = regCells[reg].filter(([r, c]) => poss[r][c] && !conf[r][c]);
      if (k - regSt[reg] > 0 && av.length === k - regSt[reg]) av.forEach(([r, c]) => star(r, c));
    }

    // Rule 3: Region confined to one row/col → exclude other cells in that row/col
    for (let reg = 0; reg < size; reg++) {
      const need = k - regSt[reg];
      if (need <= 0) continue;
      const av = regCells[reg].filter(([r, c]) => poss[r][c] && !conf[r][c]);
      if (av.length === 0) continue;
      const rows = new Set(av.map(([r]) => r));
      const cols = new Set(av.map(([, c]) => c));
      if (rows.size === 1) {
        const row = [...rows][0];
        if (need >= k - rowSt[row])
          for (let c = 0; c < size; c++) if (regions[row][c] !== reg) excl(row, c);
      }
      if (cols.size === 1) {
        const col = [...cols][0];
        if (need >= k - colSt[col])
          for (let r = 0; r < size; r++) if (regions[r][col] !== reg) excl(r, col);
      }
    }

    // Rule 4: Row/col confined to one region → exclude other cells in that region
    for (let r = 0; r < size; r++) {
      const need = k - rowSt[r];
      if (need <= 0) continue;
      const regs = new Set<number>();
      for (let c = 0; c < size; c++) if (poss[r][c] && !conf[r][c]) regs.add(regions[r][c]);
      if (regs.size === 1) {
        const reg = [...regs][0];
        if (need === k - regSt[reg])
          for (const [r2, c2] of regCells[reg]) if (r2 !== r) excl(r2, c2);
      }
    }
    for (let c = 0; c < size; c++) {
      const need = k - colSt[c];
      if (need <= 0) continue;
      const regs = new Set<number>();
      for (let r = 0; r < size; r++) if (poss[r][c] && !conf[r][c]) regs.add(regions[r][c]);
      if (regs.size === 1) {
        const reg = [...regs][0];
        if (need === k - regSt[reg])
          for (const [r2, c2] of regCells[reg]) if (c2 !== c) excl(r2, c2);
      }
    }

    // Rule 5: Subset confinement (Hall's theorem rows/cols)
    for (let r = 0; r < size; r++) {
      const rowNeed = k - rowSt[r];
      if (rowNeed <= 0) continue;
      const confinedRegs: number[] = [];
      let needSum = 0;
      for (let reg = 0; reg < size; reg++) {
        if (regSt[reg] >= k) continue;
        const av = regCells[reg].filter(([r2, c2]) => poss[r2][c2] && !conf[r2][c2]);
        if (av.length === 0) continue;
        if (av.every(([r2]) => r2 === r)) { confinedRegs.push(reg); needSum += k - regSt[reg]; }
      }
      if (needSum >= rowNeed) {
        const cs = new Set(confinedRegs);
        for (let c = 0; c < size; c++)
          if (poss[r][c] && !conf[r][c] && !cs.has(regions[r][c])) excl(r, c);
      }
    }
    for (let c = 0; c < size; c++) {
      const colNeed = k - colSt[c];
      if (colNeed <= 0) continue;
      const confinedRegs: number[] = [];
      let needSum = 0;
      for (let reg = 0; reg < size; reg++) {
        if (regSt[reg] >= k) continue;
        const av = regCells[reg].filter(([r2, c2]) => poss[r2][c2] && !conf[r2][c2]);
        if (av.length === 0) continue;
        if (av.every(([, c2]) => c2 === c)) { confinedRegs.push(reg); needSum += k - regSt[reg]; }
      }
      if (needSum >= colNeed) {
        const cs = new Set(confinedRegs);
        for (let r = 0; r < size; r++)
          if (poss[r][c] && !conf[r][c] && !cs.has(regions[r][c])) excl(r, c);
      }
    }
  }

  let changed = true;
  while (changed) { applyRules(); changed = anyChange; }

  const dotCount = dots.flat().filter(Boolean).length;
  return { dots, hasStartingMove: dotCount > 0 };
}

// ── Diagnostic API ────────────────────────────────────────────────────────────

export function _debugGenerate(difficulty: string, seed: string, attempt: number): {
  regions: number[][] | null;
  solution: boolean[][] | null;
  solved: boolean;
  regRowSpans?: number[];
  regColSpans?: number[];
} {
  let size: number, k: number;
  switch (difficulty) {
    case 'easy': size = 8; k = 1; break;
    case 'hard': size = 14; k = 3; break;
    default:     size = 10; k = 2; break;
  }
  const rng = mulberry32(strToSeed(`${seed}:${difficulty}:${attempt}`));

  let regions: number[][] | null = null;
  let solution: boolean[][] | null = null;

  regions = growRegions(size, k, rng);
  if (!regions) return { regions: null, solution: null, solved: false };
  solution = placeStarsRowByRow(size, k, regions, rng);

  if (!regions) return { regions: null, solution: null, solved: false };

  const regMin = new Array(size).fill(size);
  const regMax = new Array(size).fill(-1);
  const regMinC = new Array(size).fill(size);
  const regMaxC = new Array(size).fill(-1);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const reg = regions[r][c];
      if (r < regMin[reg]) regMin[reg] = r;
      if (r > regMax[reg]) regMax[reg] = r;
      if (c < regMinC[reg]) regMinC[reg] = c;
      if (c > regMaxC[reg]) regMaxC[reg] = c;
    }
  const regRowSpans = regMin.map((mn, i) => regMax[i] - mn + 1);
  const regColSpans = regMinC.map((mn, i) => regMaxC[i] - mn + 1);

  if (!solution) return { regions, solution: null, solved: false, regRowSpans, regColSpans };
  const { solved } = logicalSolve(size, k, regions);
  return { regions, solution, solved, regRowSpans, regColSpans };
}

export function _debugSolve(size: number, k: number, regions: number[][]): {
  solved: boolean;
  rulesOnlyProgress: number;
  trialContradictions: number;
  possibleCellsStart: number;
  possibleCellsAfterRules: number;
} {
  const { solved, initialMarks } = logicalSolve(size, k, regions);
  // Count initial marks as "rules only progress" heuristic
  const rulesOnlyProgress = initialMarks.reduce((s, row) => s + row.filter(Boolean).length, 0);
  return { solved, rulesOnlyProgress, trialContradictions: 0, possibleCellsStart: size*size, possibleCellsAfterRules: size*size - rulesOnlyProgress };
}

// ── Pre-computed fallback puzzles ─────────────────────────────────────────────
// Used when random generation fails to find a logically-unique puzzle.
// Fallback puzzles: pre-computed valid puzzles with corner/edge forcing regions.
// Used when generation exhausts its attempt budget. All have ≥2 forcing-shape regions
// and logically solvable solutions.

const FALLBACK_EASY: StarBattlePuzzle = {
  size: 8, starsPerUnit: 1,
  regions: [[4,4,4,4,4,1,1,1],[4,4,4,4,4,4,4,4],[2,4,4,4,4,4,4,4],[2,5,5,5,5,5,5,5],[2,5,5,5,3,7,7,7],[2,5,5,5,3,3,7,7],[2,3,3,3,3,6,7,7],[0,0,0,6,6,6,6,6]],
  solution: [[false,false,false,false,false,false,true,false],[false,false,false,true,false,false,false,false],[true,false,false,false,false,false,false,false],[false,false,true,false,false,false,false,false],[false,false,false,false,true,false,false,false],[false,false,false,false,false,false,false,true],[false,false,false,false,false,true,false,false],[false,true,false,false,false,false,false,false]],
};

const FALLBACK_MEDIUM: StarBattlePuzzle = {
  size: 10, starsPerUnit: 2,
  regions: [[3,2,2,2,2,2,0,0,0,0],[3,3,2,2,2,2,2,2,2,9],[3,3,6,6,6,6,6,9,9,9],[3,3,3,6,3,6,6,6,9,9],[3,3,3,3,3,6,6,4,9,9],[3,3,3,5,3,4,4,4,4,4],[5,5,5,5,3,8,4,4,4,4],[5,5,5,5,8,8,8,8,4,7],[5,5,5,5,8,8,7,7,7,7],[1,1,1,1,8,8,7,7,7,7]],
  solution: [[false,false,false,false,false,false,true,false,true,false],[false,false,true,false,true,false,false,false,false,false],[true,false,false,false,false,false,false,false,true,false],[false,false,false,true,false,true,false,false,false,false],[false,false,false,false,false,false,false,true,false,true],[false,true,false,true,false,false,false,false,false,false],[false,false,false,false,false,true,false,true,false,false],[false,true,false,false,false,false,false,false,false,true],[false,false,false,false,true,false,true,false,false,false],[true,false,true,false,false,false,false,false,false,false]],
};

const FALLBACK_HARD: StarBattlePuzzle = {
  size: 14, starsPerUnit: 3,
  regions: [[13,13,13,13,13,2,2,2,3,5,5,5,5,5],[13,13,13,2,13,2,2,2,3,3,3,5,5,5],[1,1,1,2,2,2,2,3,3,3,3,5,5,5],[1,1,1,2,2,2,2,2,4,3,3,3,5,5],[1,1,1,2,4,4,4,4,4,3,3,0,0,0],[1,1,1,4,4,4,4,4,10,10,3,0,0,0],[1,1,1,7,6,4,4,10,10,8,8,0,0,0],[1,1,1,7,6,4,10,10,10,8,8,0,0,0],[1,1,1,7,6,6,6,10,10,8,8,0,0,0],[7,7,7,7,6,6,6,6,6,8,8,0,0,0],[11,11,7,7,7,12,12,6,6,8,8,8,8,8],[11,11,7,7,7,12,12,12,12,9,9,9,9,9],[11,11,11,11,12,12,12,12,12,9,9,9,9,9],[11,11,11,11,11,12,12,12,12,9,9,9,9,9]],
  solution: [[true,false,false,false,false,false,false,false,false,false,true,false,true,false],[false,false,true,false,true,false,false,true,false,false,false,false,false,false],[true,false,false,false,false,false,false,false,false,true,false,false,false,true],[false,false,false,true,false,true,false,false,false,false,false,true,false,false],[false,false,false,false,false,false,false,true,false,true,false,false,false,true],[false,true,false,true,false,true,false,false,false,false,false,false,false,false],[false,false,false,false,false,false,false,false,true,false,true,false,true,false],[false,false,true,false,true,false,true,false,false,false,false,false,false,false],[false,false,false,false,false,false,false,false,true,false,true,false,true,false],[true,false,true,false,false,false,true,false,false,false,false,false,false,false],[false,false,false,false,true,false,false,false,true,false,false,true,false,false],[false,true,false,false,false,false,true,false,false,false,false,false,false,true],[false,false,false,true,false,false,false,false,false,true,false,true,false,false],[false,true,false,false,false,true,false,true,false,false,false,false,false,false]],
};

// ── Public API ────────────────────────────────────────────────────────────────

export function generateStarBattle(difficulty: string, seed: string): StarBattlePuzzle {
  let size: number, k: number;
  switch (difficulty) {
    case 'easy': size = 8; k = 1; break;
    case 'hard': size = 14; k = 3; break;
    default:     size = 10; k = 2; break;
  }

  // Generation attempt limits — each attempt is fast, so we can afford many.
  // If no puzzle found within the budget, the fallback is returned.
  const maxAttempts = difficulty === 'easy' ? 2000 : difficulty === 'medium' ? 3000 : 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(strToSeed(`${seed}:${difficulty}:${attempt}`));

    // Step 1: grow regions with forced corner + edge-strip shapes
    const regions = growRegions(size, k, rng);
    if (!regions) continue;
    if (countForcingRegions(size, k, regions) < 2) continue; // sanity check

    // Step 2: place stars
    const solution = placeStarsRowByRow(size, k, regions, rng);
    if (!solution) continue;

    // Sanity-check star counts
    const rowC = new Array(size).fill(0);
    const colC = new Array(size).fill(0);
    const regC = new Array(size).fill(0);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (solution[r][c]) { rowC[r]++; colC[c]++; regC[regions[r][c]]++; }
    if (!rowC.every(v => v === k) || !colC.every(v => v === k) || !regC.every(v => v === k)) continue;

    // Step 3+4: logical solvability gate.
    // Hard: pre-place ~24% of stars as locked hints shown to the player.
    // Easy/medium: no hints; the corner+edge forcing regions must carry the solve.
    if (difficulty === 'hard') {
      const numHints = Math.round(size * k * 0.33); // ~14 of 42 stars (needed for solver to succeed)
      const hints    = pickHints(size, solution, numHints, rng);
      const { solved } = logicalSolve(size, k, regions, hints);
      if (!solved) continue;
      return { size, starsPerUnit: k, regions, solution, hints };
    } else {
      const { solved } = logicalSolve(size, k, regions);
      if (!solved) continue;
      return { size, starsPerUnit: k, regions, solution };
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────────
  // Pre-computed valid puzzles used when generation times out.
  // Hard fallback gets dynamically assigned hints from its solution.
  const fb = difficulty === 'hard' ? FALLBACK_HARD : difficulty === 'medium' ? FALLBACK_MEDIUM : FALLBACK_EASY;
  if (difficulty === 'hard') {
    const rng = mulberry32(strToSeed(`${seed}:${difficulty}:fallback`));
    const numHints = Math.round(fb.size * fb.starsPerUnit * 0.33);
    const hints = pickHints(fb.size, fb.solution, numHints, rng);
    return { ...fb, hints };
  }
  return fb;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function checkStarBattleSolved(grid: number[][], puzzle: StarBattlePuzzle): boolean {
  const { size, starsPerUnit, regions } = puzzle;
  const rowCounts = new Array(size).fill(0);
  const colCounts = new Array(size).fill(0);
  const regCounts = new Array(size).fill(0);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 1) continue;
      rowCounts[r]++;
      colCounts[c]++;
      regCounts[regions[r][c]]++;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 1) return false;
        }
    }
  }

  return (
    rowCounts.every(v => v === starsPerUnit) &&
    colCounts.every(v => v === starsPerUnit) &&
    regCounts.every(v => v === starsPerUnit)
  );
}

export function calcStarBattleProgress(grid: number[][], puzzle: StarBattlePuzzle): number {
  const { size, solution } = puzzle;
  let correct = 0, total = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (solution[r][c]) { total++; if (grid[r][c] === 1) correct++; }
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}
