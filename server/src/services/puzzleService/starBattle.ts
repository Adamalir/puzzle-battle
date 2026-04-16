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

// ── Step 1: grow blob regions ─────────────────────────────────────────────────
// Places N seeds spread across a 2-D sub-grid, then expands them simultaneously
// using balanced Voronoi growth (smallest region always grows next).

function growRegions(size: number, rng: () => number): number[][] | null {
  const n = size;
  const regions: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const regionSizes = new Array(n).fill(0);

  // ── Seed placement ──────────────────────────────────────────────────────────
  // Divide into a coarse gridRows×gridCols sub-grid (e.g. 2×5 for n=10) so
  // seeds spread across the whole board.
  let gridRows = 1, gridCols = n;
  for (let f = 2; f * f <= n; f++) {
    if (n % f === 0) { gridRows = f; gridCols = n / f; }
  }
  if (gridCols < gridRows) { [gridRows, gridCols] = [gridCols, gridRows]; }

  const rowStep = size / gridRows;
  const colStep = size / gridCols;
  const candidateSeeds: [number, number][] = [];

  for (let ri = 0; ri < gridRows; ri++) {
    for (let ci = 0; ci < gridCols; ci++) {
      const r = Math.min(size - 1, Math.floor(ri * rowStep + rng() * rowStep));
      const c = Math.min(size - 1, Math.floor(ci * colStep + rng() * colStep));
      candidateSeeds.push([r, c]);
    }
  }

  // Shuffle seed→region assignment so blob shapes vary between seeds
  const shuffledSeeds = shuffle(candidateSeeds, rng);

  const frontiers: [number, number][][] = Array.from({ length: n }, () => []);

  for (let reg = 0; reg < n; reg++) {
    let [sr, sc] = shuffledSeeds[reg];

    // If collision, spiral outward to find the nearest free cell
    if (regions[sr][sc] !== -1) {
      let found = false;
      outer: for (let dist = 1; dist < size; dist++) {
        for (let dr = -dist; dr <= dist; dr++) {
          for (let dc = -dist; dc <= dist; dc++) {
            if (Math.abs(dr) !== dist && Math.abs(dc) !== dist) continue;
            const nr = sr + dr, nc = sc + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1) {
              sr = nr; sc = nc; found = true; break outer;
            }
          }
        }
      }
      if (!found) return null;
    }

    regions[sr][sc] = reg;
    regionSizes[reg]++;

    for (const [dr, dc] of DIRS4) {
      const nr = sr + dr, nc = sc + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1) {
        frontiers[reg].push([nr, nc]);
      }
    }
  }

  // ── Strict round-robin growth ────────────────────────────────────────────────
  // Each round gives every region exactly one expansion (skip if no frontier).
  // This guarantees sizes stay within ±1 of each other, so all regions end up
  // within 1–2 cells of the target (N cells each for N×N ÷ N regions).
  let assigned = regionSizes.reduce((s, v) => s + v, 0);
  const total = size * size;

  while (assigned < total) {
    const order = shuffle(Array.from({ length: n }, (_, i) => i), rng);
    let anyExpanded = false;

    for (const reg of order) {
      if (frontiers[reg].length === 0) continue;

      // Try frontier cells until we claim a free one
      while (frontiers[reg].length > 0) {
        const idx = Math.floor(rng() * frontiers[reg].length);
        const [nr, nc] = frontiers[reg].splice(idx, 1)[0];
        if (regions[nr][nc] !== -1) continue; // stale entry — already claimed

        regions[nr][nc] = reg;
        regionSizes[reg]++;
        assigned++;
        anyExpanded = true;

        for (const [dr, dc] of DIRS4) {
          const nnr = nr + dr, nnc = nc + dc;
          if (nnr >= 0 && nnr < size && nnc >= 0 && nnc < size && regions[nnr][nnc] === -1) {
            frontiers[reg].push([nnr, nnc]);
          }
        }
        break; // one expansion per region per round
      }
    }

    if (!anyExpanded) break; // all frontiers exhausted
  }

  // ── Flood-fill any remaining unassigned cells ────────────────────────────────
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (regions[r][c] !== -1) continue;
        for (const [dr, dc] of DIRS4) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] !== -1) {
            regions[r][c] = regions[nr][nc];
            regionSizes[regions[r][c]]++;
            changed = true;
            break;
          }
        }
      }
    }
  }

  return regions;
}

// ── Step 2: place stars via row-by-row backtracking ───────────────────────────
// Places exactly k stars per row. Maintains column counts (≤ k) and region
// counts (≤ k) during placement. Forward-checks after each completed row that
// every region still has enough remaining cells to reach its k-star quota.
// After all rows, verifies column and region counts are all exactly k.

function placeStarsRowByRow(
  size: number,
  k: number,
  regions: number[][],
  rng: () => number,
): boolean[][] | null {
  const grid: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const colCount = new Array(size).fill(0);
  const regCount = new Array(size).fill(0);

  // Pre-build: for each (region, row) how many columns are available.
  // Used by the forward check.
  const regRowAvail: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      regRowAvail[regions[r][c]][r]++;

  // Shuffle column order per row once up front for randomness
  const rowColOrder: number[][] = Array.from(
    { length: size },
    (_, r) => shuffle(Array.from({ length: size }, (_, c) => c), rng),
  );

  const callLimit = size > 10 ? 12_000_000 : 2_000_000;
  let calls = 0;

  function adjacent(r: number, c: number): boolean {
    for (const [dr, dc] of DIRS8) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc]) return true;
    }
    return false;
  }

  // bt(row, placed, colIdx):
  //   row      = current row being filled
  //   placed   = stars placed so far in this row
  //   colIdx   = index into rowColOrder[row] to try next
  function bt(row: number, placed: number, colIdx: number): boolean {
    if (++calls > callLimit) return false;

    if (placed === k) {
      // Row complete → forward check, then recurse
      if (row + 1 === size) {
        return colCount.every(v => v === k) && regCount.every(v => v === k);
      }
      // Forward check: each region must still be able to reach k stars
      for (let reg = 0; reg < size; reg++) {
        const need = k - regCount[reg];
        if (need <= 0) continue;
        // Count available cells in remaining rows (rough upper bound)
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

// ── Hint selection (hard mode) ────────────────────────────────────────────────

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

// ── Public API ────────────────────────────────────────────────────────────────
// easy:   8×8,  k=1  (8 blob regions)
// medium: 10×10, k=2 (10 blob regions)
// hard:   14×14, k=3 (14 blob regions, 6 pre-placed hint stars)

export function generateStarBattle(difficulty: string, seed: string): StarBattlePuzzle {
  let size: number, k: number;
  switch (difficulty) {
    case 'easy': size = 8;  k = 1; break;
    case 'hard': size = 14; k = 3; break;
    default:     size = 10; k = 2; break;
  }

  const maxAttempts = 80;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(strToSeed(`${seed}:${difficulty}:${attempt}`));

    // ── 1. Grow blob regions ──────────────────────────────────────────────────
    const regions = growRegions(size, rng);
    if (!regions) continue;

    // ── 2. Place stars (row-by-row with region forward checking) ──────────────
    const solution = placeStarsRowByRow(size, k, regions, rng);
    if (!solution) continue;

    // ── 3. Final sanity check ─────────────────────────────────────────────────
    const rowC = new Array(size).fill(0);
    const colC = new Array(size).fill(0);
    const regC = new Array(size).fill(0);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (solution[r][c]) { rowC[r]++; colC[c]++; regC[regions[r][c]]++; }
    if (!rowC.every(v => v === k) || !colC.every(v => v === k) || !regC.every(v => v === k)) continue;

    const hints = difficulty === 'hard' ? pickHints(size, solution, 6, rng) : undefined;

    return { size, starsPerUnit: k, regions, solution, hints };
  }

  // Fallback (practically unreachable with 80 attempts)
  const fallbackSolution = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => c === r % size && r < size)
  );
  const fallbackRegions = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (r + c) % size)
  );
  return { size, starsPerUnit: k, regions: fallbackRegions, solution: fallbackSolution };
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
