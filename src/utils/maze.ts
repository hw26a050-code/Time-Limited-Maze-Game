export interface Point {
  x: number;
  y: number;
}

export type Grid = number[][]; // 0 = passage, 1 = wall

export interface MazeData {
  grid: Grid;
  width: number;
  height: number;
  start: Point;
  goal: Point;
}

/**
 * Generates a perfect maze of size width x height using randomized DFS.
 * width and height must be odd integers.
 */
export function generateMaze(width: number, height: number): MazeData {
  // Ensure odd dimensions
  const w = width % 2 === 0 ? width + 1 : width;
  const h = height % 2 === 0 ? height + 1 : height;

  // Initialize all as walls (1)
  const grid: Grid = Array(h)
    .fill(null)
    .map(() => Array(w).fill(1));

  // Start carving from the center
  const startX = Math.floor(w / 2);
  const startY = Math.floor(h / 2);
  
  // Helper to ensure center matches the odd passage grid coordinates
  // If the center isn't odd (which it should be if w, h are odd and of the form 2k+1), force it
  const cx = startX % 2 === 1 ? startX : startX - 1;
  const cy = startY % 2 === 1 ? startY : startY - 1;

  const stack: Point[] = [];
  grid[cy][cx] = 0; // mark start as passage
  stack.push({ x: cx, y: cy });

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: Point[] = [];

    // Direction offsets of distance 2
    const directions = [
      { x: 0, y: -2 }, // Up
      { x: 2, y: 0 },  // Right
      { x: 0, y: 2 },  // Down
      { x: -2, y: 0 }  // Left
    ];

    for (const dir of directions) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;

      // Check boundaries and if neighbor is unvisited (wall)
      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1) {
        if (grid[ny][nx] === 1) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }

    if (neighbors.length > 0) {
      // Pick random neighbor
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      
      // Carve passage between current and chosen neighbor
      const wallX = current.x + (next.x - current.x) / 2;
      const wallY = current.y + (next.y - current.y) / 2;
      
      grid[wallY][wallX] = 0;
      grid[next.y][next.x] = 0;

      stack.push(next);
    } else {
      stack.pop();
    }
  }

  // The 4 corners of standard passage spots:
  // (1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)
  const corners: Point[] = [
    { x: 1, y: 1 },
    { x: w - 2, y: 1 },
    { x: 1, y: h - 2 },
    { x: w - 2, y: h - 2 }
  ];

  // Pick a random corner for the goal
  const goal = corners[Math.floor(Math.random() * corners.length)];

  // Set start point to the corner diagonal to the goal
  const start: Point = {
    x: goal.x === 1 ? w - 2 : 1,
    y: goal.y === 1 ? h - 2 : 1
  };

  // Make sure both start and goal points are carved as passages
  grid[start.y][start.x] = 0;
  grid[goal.y][goal.x] = 0;

  return {
    grid,
    width: w,
    height: h,
    start,
    goal
  };
}

/**
 * Finds the shortest path from start to goal in the given maze grid using BFS.
 */
export function findShortestPath(grid: Grid, start: Point, goal: Point): Point[] {
  const h = grid.length;
  const w = grid[0].length;
  
  const queue: Point[] = [start];
  const visited = Array(h).fill(null).map(() => Array(w).fill(false));
  const parent: { [key: string]: Point } = {};

  visited[start.y][start.x] = true;

  const dy = [-1, 1, 0, 0];
  const dx = [0, 0, -1, 1];

  let found = false;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === goal.x && current.y === goal.y) {
      found = true;
      break;
    }

    for (let i = 0; i < 4; i++) {
      const nx = current.x + dx[i];
      const ny = current.y + dy[i];

      if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny][nx] === 0 && !visited[ny][nx]) {
        visited[ny][nx] = true;
        parent[`${nx},${ny}`] = current;
        queue.push({ x: nx, y: ny });
      }
    }
  }

  if (!found) return [];

  // Reconstruct path
  const path: Point[] = [];
  let curr = goal;
  while (curr.x !== start.x || curr.y !== start.y) {
    path.push(curr);
    curr = parent[`${curr.x},${curr.y}`];
  }
  path.push(start);
  return path.reverse();
}
