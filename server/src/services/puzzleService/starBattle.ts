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

// ── Step 2: connected regions from star placement ─────────────────────────────
// Region index = row index. Bridge pre-claim guarantees connectivity for k≥2.

function buildRegions(size: number, k: number, stars: boolean[][], rng: () => number): number[][] {
  const regions: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (stars[r][c]) regions[r][c] = r;

  if (k >= 2) {
    for (let r = 0; r < size; r++) {
      const cols = Array.from({ length: size }, (_, c) => c).filter(c => stars[r][c]);
      if (cols.length >= 2) {
        const lo = Math.min(...cols);
        const hi = Math.max(...cols);
        for (let c = lo + 1; c < hi; c++)
          if (regions[r][c] === -1) regions[r][c] = r;
      }
    }
  }

  const frontier: Array<[number, number]> = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (regions[r][c] !== -1) frontier.push([r, c]);

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

  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (regions[r][c] === -1)
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && regions[nr][nc] !== -1) {
            regions[r][c] = regions[nr][nc]; break;
          }
        }

  return regions;
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
// hard:   14×14, k=3  (3 pre-placed hint stars shown to players)

export function generateStarBattle(difficulty: string, seed: string): StarBattlePuzzle {
  let size: number, k: number;
  switch (difficulty) {
    case 'easy': size = 8;  k = 1; break;
    case 'hard': size = 14; k = 3; break;
    default:     size = 10; k = 2; break;
  }

  const maxAttempts = difficulty === 'hard' ? 16 : 8;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(strToSeed(`${seed}:${difficulty}:${attempt}`));
    const solution = placeStars(size, k, rng);
    if (!solution) continue;

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
    const hints   = difficulty === 'hard' ? pickHints(size, solution, 6, rng) : undefined;

    return { size, starsPerUnit: k, regions, solution, hints };
  }

  // Fallback (practically never reached)
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
