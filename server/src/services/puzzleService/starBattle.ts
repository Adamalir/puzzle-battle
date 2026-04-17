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

// ── Step 1: Region generation with guaranteed forcing shapes ─────────────────
//
// A "forcing region" gives players an immediate logical foothold:
//
//   Small       — ≤ k+2 cells total (players see at a glance where stars go)
//   Row-confined — all cells in ≤ k rows (confinement rule fires at once)
//   Col-confined — all cells in ≤ k cols
//
// Phase 1 pre-plants numForcing such regions grown within a tight row span.
// The remaining regions are filled with unbiased random Voronoi (Phase 3),
// producing organic irregular shapes — arms and protrusions rather than blobs.
//
// Forcing-region target sizes are chosen so k non-adjacent stars can always fit:
//   k=1 → 2–3 cells in 1 row   (a domino or tromino)
//   k=2 → 4–6 cells in 2 rows  (small tetromino / pentomino)
//   k=3 → 8–10 cells in 2 rows (wide enough for 3 stars with gaps)

function growRegions(size: number, k: number, rng: () => number): number[][] | null {
  const n = size;
  const regions: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const regSize   = new Array(n).fill(0);
  const regMinRow = new Array(n).fill(size);
  const regMaxRow = new Array(n).fill(-1);
  const regMinCol = new Array(n).fill(size);
  const regMaxCol = new Array(n).fill(-1);

  const seeds: [number, number][] = [];

  function addCell(reg: number, r: number, c: number): void {
    regions[r][c] = reg;
    regSize[reg]++;
    if (r < regMinRow[reg]) regMinRow[reg] = r;
    if (r > regMaxRow[reg]) regMaxRow[reg] = r;
    if (c < regMinCol[reg]) regMinCol[reg] = c;
    if (c > regMaxCol[reg]) regMaxCol[reg] = c;
  }

  // Forcing parameters by difficulty (indexed by k)
  const numForcing  = k >= 3 ? 2 : 3;
  const maxRowSpanF = k === 1 ? 1 : 2;
  // Target cell count: large enough that k non-adjacent stars can always fit
  // within the 2-row span, small enough to look constraining to the player.
  //   k=1: 2–3 cells  k=2: 4–6 cells  k=3: 8–10 cells
  const forceMin = k === 1 ? 2 : k === 2 ? 4 : 8;
  const forceMax = k === 1 ? 3 : k === 2 ? 6 : 10;

  const minForceSep = Math.max(3, Math.floor(size / (numForcing + 1)));
  const minSeedSep  = Math.max(2, Math.floor(size / Math.sqrt(n)));

  // Random cell sampler: try up to `trials` random positions before scanning
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
    // Linear scan fallback (relax distance by 1 each pass)
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

  // ── Phase 1: pre-plant forcing regions ─────────────────────────────────────
  for (let fi = 0; fi < numForcing; fi++) {
    const seed = pickFreeCell(minForceSep);
    if (!seed) return null;
    addCell(fi, seed[0], seed[1]);
    seeds.push(seed);

    // Grow to forceMin–forceMax cells within maxRowSpanF rows.
    // Growing stops at forceMax; if stuck before forceMin the region is still
    // valid as long as rowSpan <= k (the confinement-based forcing criterion).
    const target = forceMin + Math.floor(rng() * (forceMax - forceMin + 1));
    while (regSize[fi] < target) {
      const candidates: [number, number][] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (regions[r][c] !== fi) continue;
          for (const [dr, dc] of DIRS4) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            if (regions[nr][nc] !== -1) continue;
            if (Math.max(regMaxRow[fi], nr) - Math.min(regMinRow[fi], nr) + 1 > maxRowSpanF) continue;
            candidates.push([nr, nc]);
          }
        }
      }
      if (candidates.length === 0) break;
      addCell(fi, ...candidates[Math.floor(rng() * candidates.length)]);
    }
  }

  // ── Phase 2: spread seeds for remaining regions ─────────────────────────────
  for (let reg = numForcing; reg < n; reg++) {
    const seed = pickFreeCell(minSeedSep);
    if (!seed) return null;
    addCell(reg, seed[0], seed[1]);
    seeds.push(seed);
  }

  // ── Phase 3: unbiased Voronoi expansion (organic irregular shapes) ──────────
  // Regions grow by pure random frontier selection — no balance bias — so shapes
  // develop irregular arms and protrusions rather than compact rounded blobs.
  const MAXROWSPAN = k + 2;
  const MAXCOLSPAN = Math.ceil(size / k);

  // Build initial frontiers from all currently-assigned cells
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

  // Reusable order array (avoid allocating inside hot loop)
  const orderBuf = Array.from({ length: n - numForcing }, (_, i) => i + numForcing);

  while (assigned < total) {
    // Only expand non-forcing regions
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

  // ── Phase 4: flood-fill orphaned cells ───────────────────────────────────────
  // Multi-pass: prefer non-forcing neighbours; fall back to any neighbour.
  // Forcing regions are never expanded in the first pass; only as last resort.
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (regions[r][c] !== -1) continue;
        // First, prefer a non-forcing neighbour (preserves forcing shapes)
        let bestReg = -1, bestSize = Infinity;
        for (const [dr, dc] of DIRS4) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const reg = regions[nr][nc];
          if (reg >= numForcing && regSize[reg] < bestSize) { bestReg = reg; bestSize = regSize[reg]; }
        }
        if (bestReg === -1) {
          // All neighbours are forcing or edge — fall back to smallest forcing neighbour
          for (const [dr, dc] of DIRS4) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const reg = regions[nr][nc];
            if (reg >= 0 && regSize[reg] < bestSize) { bestReg = reg; bestSize = regSize[reg]; }
          }
        }
        if (bestReg !== -1) { addCell(bestReg, r, c); changed = true; }
      }
    }
  }
  // Absolute last resort: BFS outward for any remaining unassigned cells
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
          if (regions[nr][nc] >= 0) { addCell(regions[nr][nc], r, c); found = true; break; }
          q.push([nr, nc]);
        }
      }
    }
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
// Each fallback is a valid Star Battle puzzle (k stars per row/col/region,
// no two stars adjacent). They may not be logically unique without hints.

const FALLBACK_EASY: StarBattlePuzzle = {
  size: 8, starsPerUnit: 1,
  regions: [[0,0,0,0,0,0,0,0],[0,0,0,0,3,3,3,0],[6,3,3,3,3,3,3,0],[6,6,3,3,3,4,4,4],[6,6,6,6,4,4,2,2],[5,5,5,4,4,2,2,2],[5,5,5,1,1,2,2,7],[5,5,5,1,1,7,7,7]],
  solution: [[false,false,true,false,false,false,false,false],[false,false,false,false,true,false,false,false],[true,false,false,false,false,false,false,false],[false,false,false,false,false,true,false,false],[false,false,false,false,false,false,false,true],[false,true,false,false,false,false,false,false],[false,false,false,true,false,false,false,false],[false,false,false,false,false,false,true,false]],
};

const FALLBACK_MEDIUM: StarBattlePuzzle = {
  size: 10, starsPerUnit: 2,
  regions: [[3,3,3,1,1,1,0,0,0,0],[3,3,1,1,1,1,0,0,0,0],[3,1,1,1,1,0,0,0,4,4],[3,1,1,1,7,0,7,0,4,4],[3,3,7,7,7,7,7,4,4,4],[2,2,7,7,7,7,4,4,8,8],[2,2,7,7,7,5,9,8,8,8],[2,2,2,5,5,5,9,8,8,8],[2,2,2,6,6,5,9,9,8,9],[2,2,6,6,6,5,5,9,9,9]],
  solution: [[false,false,false,false,false,true,false,false,true,false],[false,true,false,true,false,false,false,false,false,false],[false,false,false,false,false,false,true,false,true,false],[true,false,false,false,true,false,false,false,false,false],[false,false,true,false,false,false,false,true,false,false],[true,false,false,false,false,false,false,false,false,true],[false,false,false,false,false,true,false,true,false,false],[false,true,false,true,false,false,false,false,false,false],[false,false,false,false,false,false,true,false,false,true],[false,false,true,false,true,false,false,false,false,false]],
};

const FALLBACK_HARD: StarBattlePuzzle = {
  size: 14, starsPerUnit: 3,
  regions: [[10,10,10,10,4,4,4,9,9,9,2,2,2,2],[10,10,10,10,4,4,4,9,9,9,2,2,2,2],[10,10,4,4,4,4,9,9,0,9,2,2,2,2],[10,10,7,7,4,9,9,0,0,2,2,2,2,2],[10,10,10,7,7,9,0,0,0,0,2,2,3,3],[5,5,5,7,7,7,7,0,0,0,0,3,3,12],[5,5,5,5,7,7,7,0,0,0,3,3,12,12],[1,5,5,5,7,7,11,11,11,3,3,12,12,12],[1,1,5,5,5,7,11,11,11,3,12,12,12,12],[1,1,1,1,5,8,8,8,11,11,12,12,6,6],[1,13,13,1,1,8,8,11,11,11,11,6,6,6],[13,13,13,8,8,8,8,11,11,11,11,6,6,6],[13,13,13,13,13,8,8,8,11,6,6,6,6,6],[13,13,13,13,13,8,8,8,8,6,6,6,6,6]],
  solution: [[true,false,false,false,true,false,false,false,true,false,false,false,false,false],[false,false,false,false,false,false,true,false,false,false,false,true,false,true],[false,true,false,true,false,false,false,false,false,true,false,false,false,false],[false,false,false,false,false,true,false,true,false,false,false,true,false,false],[false,true,false,true,false,false,false,false,false,false,false,false,false,true],[false,false,false,false,false,true,false,false,false,true,false,true,false,false],[false,true,false,false,false,false,false,true,false,false,false,false,false,true],[false,false,false,true,false,true,false,false,false,true,false,false,false,false],[true,false,false,false,false,false,false,true,false,false,false,false,true,false],[false,false,true,false,true,false,false,false,false,false,true,false,false,false],[true,false,false,false,false,false,true,false,false,false,false,false,true,false],[false,false,true,false,false,false,false,false,true,false,true,false,false,false],[false,false,false,false,true,false,true,false,false,false,false,false,true,false],[false,false,true,false,false,false,false,false,true,false,true,false,false,false]],
};

// ── Public API ────────────────────────────────────────────────────────────────

export function generateStarBattle(difficulty: string, seed: string): StarBattlePuzzle {
  let size: number, k: number;
  switch (difficulty) {
    case 'easy': size = 8; k = 1; break;
    case 'hard': size = 14; k = 3; break;
    default:     size = 10; k = 2; break;
  }

  const maxAttempts = difficulty === 'easy' ? 1200 : difficulty === 'medium' ? 2000 : 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(strToSeed(`${seed}:${difficulty}:${attempt}`));

    let regions: number[][] | null = null;
    let solution: boolean[][] | null = null;

    regions = growRegions(size, k, rng);
    if (!regions) continue;

    // Require at least 2 forcing-shape regions so players have an obvious start
    if (countForcingRegions(size, k, regions) < 2) continue;

    solution = placeStarsRowByRow(size, k, regions, rng);
    if (!solution) continue;

    if (!regions || !solution) continue;

    // Sanity-check solution
    const rowC = new Array(size).fill(0);
    const colC = new Array(size).fill(0);
    const regC = new Array(size).fill(0);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (solution[r][c]) { rowC[r]++; colC[c]++; regC[regions[r][c]]++; }
    if (!rowC.every(v => v === k) || !colC.every(v => v === k) || !regC.every(v => v === k)) continue;

    // Pick hints and check solvability with them pre-applied.
    // Easy: 1 hint (starter star) reliably bridges the uniqueness gap.
    // Medium: 4 hints bridge the larger uniqueness gap for k=2.
    // Hard: 14 hints (~33% of 42 stars) needed since 14×14 k=3 puzzles are rarely
    //       unique on their own; the remaining 28 stars are still logically deducible.
    const numHints = difficulty === 'hard' ? 14 : difficulty === 'medium' ? 4 : 1;
    const hints = numHints > 0 ? pickHints(size, solution, numHints, rng) : undefined;

    // Gate 1: puzzle must be logically solvable with the given hints
    const { solved } = logicalSolve(size, k, regions, hints);
    if (!solved) continue;

    // Gate 2: puzzle must have at least one obvious starting move visible at load
    const { dots, hasStartingMove } = computeInitialDots(size, k, regions, hints);
    if (!hasStartingMove) continue;

    return { size, starsPerUnit: k, regions, solution, hints, initialMarks: dots };
  }

  // Pre-computed valid fallbacks — add initial dots on the fly
  const fb = difficulty === 'hard' ? FALLBACK_HARD : difficulty === 'medium' ? FALLBACK_MEDIUM : FALLBACK_EASY;
  const { dots } = computeInitialDots(fb.size, fb.starsPerUnit, fb.regions, fb.hints);
  return { ...fb, initialMarks: dots };
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
