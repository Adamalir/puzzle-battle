import type { StarBattlePuzzle } from '../../types/index';

// ── Seeded PRNG helpers ───────────────────────────────────────────────────────

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

// ── Step 1: generate a valid star placement ───────────────────────────────────
//
// Constraints: exactly k stars per row, k per column, no two stars adjacent
// (including diagonally). Uses seeded row-by-row backtracking.

function placeStars(size: number, k: number, rng: () => number): boolean[][] | null {
  const grid: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const colCount = new Array(size).fill(0);
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
    if (++calls > 500_000) return false;           // safety escape hatch
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

// ── Step 2: build connected regions from a solved star placement ──────────────
//
// Region index = row index (k=1: one star per region; k=2: both stars in a
// row belong to that row's region).
//
// Connectivity guarantee for k=2: before BFS expansion we pre-claim the
// horizontal bridge between the two stars in each row. Since bridges are
// confined to a single row they cannot conflict with each other.

function buildRegions(size: number, k: number, stars: boolean[][], rng: () => number): number[][] {
  const regions: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Seed every star cell with its row's region index
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (stars[r][c]) regions[r][c] = r;
    }
  }

  // For k≥2 pre-claim the straight-line bridge between each pair so the
  // region is always connected even before BFS expansion begins.
  if (k >= 2) {
    for (let r = 0; r < size; r++) {
      const cols = Array.from({ length: size }, (_, c) => c).filter(c => stars[r][c]);
      if (cols.length >= 2) {
        const lo = Math.min(...cols);
        const hi = Math.max(...cols);
        for (let c = lo + 1; c < hi; c++) {
          if (regions[r][c] === -1) regions[r][c] = r;
        }
      }
    }
  }

  // Randomised multi-source BFS — gives organic, Voronoi-like region shapes
  const frontier: Array<[number, number]> = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] !== -1) frontier.push([r, c]);
    }
  }

  while (frontier.length > 0) {
    const idx = Math.floor(rng() * frontier.length);
    const [r, c] = frontier.splice(idx, 1)[0];
    const reg = regions[r][c];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] === -1) {
        regions[nr][nc] = reg;
        frontier.push([nr, nc]);
      }
    }
  }

  // Defensive: patch any cell that was somehow missed (shouldn't happen)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (regions[r][c] === -1) {
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] !== -1) {
            regions[r][c] = regions[nr][nc];
            break;
          }
        }
      }
    }
  }

  return regions;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateStarBattle(difficulty: string, seed: string): StarBattlePuzzle {
  let size: number, starsPerUnit: number;
  switch (difficulty) {
    case 'easy':  size = 5;  starsPerUnit = 1; break;
    case 'hard':  size = 10; starsPerUnit = 2; break;
    default:      size = 6;  starsPerUnit = 1; break; // medium
  }

  // Try up to 6 seeds; each attempt uses a freshly seeded RNG so we get
  // genuine variety without just retrying the same shuffle order.
  for (let attempt = 0; attempt < 6; attempt++) {
    const rng = mulberry32(strToSeed(`${seed}:${difficulty}:${attempt}`));
    const solution = placeStars(size, starsPerUnit, rng);
    if (!solution) continue;

    // Quick sanity-check before committing
    const colCounts = new Array(size).fill(0);
    let ok = true;
    for (let r = 0; r < size; r++) {
      let rowTotal = 0;
      for (let c = 0; c < size; c++) {
        if (solution[r][c]) { rowTotal++; colCounts[c]++; }
      }
      if (rowTotal !== starsPerUnit) { ok = false; break; }
    }
    if (ok && colCounts.every(v => v === starsPerUnit)) {
      const regions = buildRegions(size, starsPerUnit, solution, rng);
      return { size, starsPerUnit, regions, solution };
    }
  }

  // Absolute fallback — returns a trivially simple diagonal puzzle.
  // Only reached if placeStars fails every attempt (practically impossible).
  const fallbackSolution = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => c === r)
  );
  const fallbackRegions = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (r + c) % size)
  );
  return { size, starsPerUnit, regions: fallbackRegions, solution: fallbackSolution };
}

// ── Validation (used by the game handler) ────────────────────────────────────
//
// Validates the player's grid against the puzzle rules directly rather than
// comparing to the pre-computed solution. This accepts any valid solution,
// not just the one the generator produced.

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

      // Check all 8 neighbours for adjacency violations
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 1) {
            return false; // two stars touching
          }
        }
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
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (solution[r][c]) {
        total++;
        if (grid[r][c] === 1) correct++;
      }
    }
  }
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}
