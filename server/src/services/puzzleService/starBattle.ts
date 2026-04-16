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

// ── Step 1: valid star placement via backtracking ─────────────────────────────
// Constraints: exactly k stars per row and per column, no 8-directional adjacency.

function placeStars(size: number, k: number, rng: () => number): boolean[][] | null {
  const grid: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const colCount = new Array(size).fill(0);
  const callLimit = size > 10 ? 3_000_000 : 500_000;
  let calls = 0;

  function canPlace(r: number, c: number): boolean {
    if (colCount[c] >= k) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc]) return false;
      }
    }
    return true;
  }

  function bt(row: number, placed: number): boolean {
    if (++calls > callLimit) return false;
    if (row === size) return colCount.every(v => v === k);
    if (placed === k) return bt(row + 1, 0);

    for (const c of shuffle(Array.from({ length: size }, (_, i) => i), rng)) {
      if (canPlace(row, c)) {
        grid[row][c] = true;
        colCount[c]++;
        if (bt(row, placed + 1)) return true;
        grid[row][c] = false;
        colCount[c]--;
      }
    }
    return false;
  }

  return bt(0, 0) ? grid : null;
}

// ── Step 2: balanced region growth ────────────────────────────────────────────
// Each of the N regions starts from row r's star cells and grows outward.
// Balanced growth ensures regions are roughly equal in size (~N cells each).
// Returns null if any region is too small (triggers a full retry).

function buildRegions(size: number, k: number, stars: boolean[][], rng: () => number): number[][] | null {
  const regions: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const regionSizes = new Array(size).fill(0);

  // Assign star cells to their row's region
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (stars[r][c]) {
        regions[r][c] = r;
        regionSizes[r]++;
      }
    }
  }

  // For k >= 2, assign bridge cells between stars in the same row
  if (k >= 2) {
    for (let r = 0; r < size; r++) {
      const cols = Array.from({ length: size }, (_, c) => c).filter(c => stars[r][c]);
      if (cols.length >= 2) {
        const lo = Math.min(...cols);
        const hi = Math.max(...cols);
        for (let c = lo + 1; c < hi; c++) {
          if (regions[r][c] === -1) {
            regions[r][c] = r;
            regionSizes[r]++;
          }
        }
      }
    }
  }

  // Build initial per-region frontiers (encoded as r*size+c integers)
  const frontiers: Set<number>[] = Array.from({ length: size }, () => new Set());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] !== -1) {
        const reg = regions[r][c];
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1) {
            frontiers[reg].add(nr * size + nc);
          }
        }
      }
    }
  }

  const totalCells = size * size;
  let assigned = regionSizes.reduce((s, v) => s + v, 0);

  // Balanced growth: always expand the region(s) with fewest cells.
  // Among tied-smallest regions with frontier cells, pick randomly.
  while (assigned < totalCells) {
    // Find the minimum current size among regions that still have frontier cells
    let minSz = Infinity;
    for (let reg = 0; reg < size; reg++) {
      if (frontiers[reg].size > 0 && regionSizes[reg] < minSz) minSz = regionSizes[reg];
    }
    if (minSz === Infinity) break; // no region can grow further

    // Collect all regions tied at minimum size
    const tied: number[] = [];
    for (let reg = 0; reg < size; reg++) {
      if (frontiers[reg].size > 0 && regionSizes[reg] === minSz) tied.push(reg);
    }

    // Pick one at random, then pick a random frontier cell from it
    const chosenReg = tied[Math.floor(rng() * tied.length)];
    const candidates = [...frontiers[chosenReg]];
    const pick = candidates[Math.floor(rng() * candidates.length)];
    frontiers[chosenReg].delete(pick);

    const nr = Math.floor(pick / size);
    const nc = pick % size;
    if (regions[nr][nc] !== -1) continue; // already claimed by another region

    regions[nr][nc] = chosenReg;
    regionSizes[chosenReg]++;
    assigned++;

    // Expand frontier
    for (const [dr, dc] of dirs) {
      const nnr = nr + dr, nnc = nc + dc;
      if (nnr >= 0 && nnr < size && nnc >= 0 && nnc < size && regions[nnr][nnc] === -1) {
        frontiers[chosenReg].add(nnr * size + nnc);
      }
    }
  }

  // Flood-fill any cells still unassigned (can occur when a frontier is exhausted early)
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (regions[r][c] === -1) {
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] !== -1) {
              const reg = regions[nr][nc];
              regions[r][c] = reg;
              regionSizes[reg]++;
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  // Validate: every region must have at least `size` cells.
  // (N×N grid / N regions = N cells each is the target; reject anything smaller.)
  const minRequired = size;
  if (regionSizes.some(s => s < minRequired)) return null;

  // Validate: each region must be able to hold k non-adjacent stars.
  // (By construction the solution already places k stars in each region, so
  // this is always true — but we check anyway to catch degenerate shapes.)
  for (let reg = 0; reg < size; reg++) {
    const cells: [number, number][] = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (regions[r][c] === reg) cells.push([r, c]);
    if (!canPlaceKStarsInCells(cells, k)) return null;
  }

  return regions;
}

// ── Region feasibility check ──────────────────────────────────────────────────
// Returns true if k non-adjacent (king-move) stars can be placed anywhere in cells.

function canPlaceKStarsInCells(cells: [number, number][], k: number): boolean {
  function bt(start: number, placed: [number, number][]): boolean {
    if (placed.length === k) return true;
    const remaining = cells.length - start;
    if (remaining < k - placed.length) return false; // pruning
    for (let i = start; i < cells.length; i++) {
      const [r, c] = cells[i];
      let ok = true;
      for (const [pr, pc] of placed) {
        if (Math.abs(r - pr) <= 1 && Math.abs(c - pc) <= 1) { ok = false; break; }
      }
      if (ok) {
        placed.push([r, c]);
        if (bt(i + 1, placed)) return true;
        placed.pop();
      }
    }
    return false;
  }
  return bt(0, []);
}

// ── Hint selection (hard mode) ────────────────────────────────────────────────
// Picks numHints stars spread evenly across the grid as pre-revealed hints.

function pickHints(size: number, solution: boolean[][], numHints: number, rng: () => number): boolean[][] {
  const stars: [number, number][] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (solution[r][c]) stars.push([r, c]);

  const shuffled = shuffle(stars, rng);
  const step = Math.floor(shuffled.length / numHints);
  const hints: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  for (let i = 0; i < numHints; i++) {
    const [r, c] = shuffled[i * step];
    hints[r][c] = true;
  }
  return hints;
}

// ── Public API ────────────────────────────────────────────────────────────────
// easy:   8×8,  k=1
// medium: 10×10, k=2
// hard:   14×14, k=3  (6 pre-placed hint stars shown to players)

export function generateStarBattle(difficulty: string, seed: string): StarBattlePuzzle {
  let size: number, k: number;
  switch (difficulty) {
    case 'easy': size = 8;  k = 1; break;
    case 'hard': size = 14; k = 3; break;
    default:     size = 10; k = 2; break;
  }

  // More attempts — region validation can reject many candidates.
  const maxAttempts = difficulty === 'hard' ? 64 : 48;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(strToSeed(`${seed}:${difficulty}:${attempt}`));
    const solution = placeStars(size, k, rng);
    if (!solution) continue;

    // Verify star counts (belt-and-suspenders)
    const colCounts = new Array(size).fill(0);
    let ok = true;
    for (let r = 0; r < size; r++) {
      let rowTotal = 0;
      for (let c = 0; c < size; c++) {
        if (solution[r][c]) { rowTotal++; colCounts[c]++; }
      }
      if (rowTotal !== k) { ok = false; break; }
    }
    if (!ok || !colCounts.every(v => v === k)) continue;

    const regions = buildRegions(size, k, solution, rng);
    if (!regions) continue; // region validation failed — try next seed

    const hints = difficulty === 'hard' ? pickHints(size, solution, 6, rng) : undefined;

    return { size, starsPerUnit: k, regions, solution, hints };
  }

  // Fallback (practically never reached with 48–64 attempts)
  const fallbackSolution = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => c === r)
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
