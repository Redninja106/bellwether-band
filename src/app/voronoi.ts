export type Point = {
  x: number;
  y: number;
};

export type CurvedEdge = {
  start: Point;
  controlA: Point;
  controlB: Point;
  end: Point;
  thickness: number;
};

type Segment = {
  start: Point;
  end: Point;
};

const MBIG = 2_147_483_647;
const MSEED = 161_803_398;
const VERTEX_QUANTIZATION = 100;

// System.Random's seeded compatibility algorithm. Keeping this here makes the
// generated cell layout match the seed used by the C# prototype.
class DotNetRandom {
  private readonly seedArray = new Int32Array(56);
  private inext = 0;
  private inextp = 21;

  constructor(seed: number) {
    const subtraction =
      seed === -2_147_483_648 ? MBIG : Math.abs(Math.trunc(seed));
    let mj = MSEED - subtraction;
    this.seedArray[55] = mj;
    let mk = 1;

    for (let i = 1; i < 55; i += 1) {
      const ii = (21 * i) % 55;
      this.seedArray[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = this.seedArray[ii];
    }

    for (let pass = 1; pass < 5; pass += 1) {
      for (let i = 1; i < 56; i += 1) {
        this.seedArray[i] -= this.seedArray[1 + ((i + 30) % 55)];
        if (this.seedArray[i] < 0) this.seedArray[i] += MBIG;
      }
    }
  }

  nextDouble() {
    let locINext = this.inext + 1;
    if (locINext >= 56) locINext = 1;
    let locINextp = this.inextp + 1;
    if (locINextp >= 56) locINextp = 1;

    let result = this.seedArray[locINext] - this.seedArray[locINextp];
    if (result === MBIG) result -= 1;
    if (result < 0) result += MBIG;

    this.seedArray[locINext] = result;
    this.inext = locINext;
    this.inextp = locINextp;
    return result * (1 / MBIG);
  }
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
const multiply = (point: Point, amount: number): Point => ({
  x: point.x * amount,
  y: point.y * amount,
});
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const length = (point: Point) => Math.hypot(point.x, point.y);
const distanceSquared = (a: Point, b: Point) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const normalize = (point: Point): Point => {
  const magnitude = length(point);
  return magnitude > 0.000001
    ? { x: point.x / magnitude, y: point.y / magnitude }
    : { x: 1, y: 0 };
};
const lerpPoint = (a: Point, b: Point, amount: number): Point => ({
  x: a.x + (b.x - a.x) * amount,
  y: a.y + (b.y - a.y) * amount,
});
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

function randomRange(
  random: DotNetRandom,
  minimum: number,
  maximum: number,
) {
  return minimum + random.nextDouble() * (maximum - minimum);
}

function hash(x: number, y: number, seed: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 4.123) * 43758.5453;
  return value - Math.floor(value);
}

function flowDirection(point: Point, origin: Point): Point {
  let radial = subtract(point, origin);
  const distance = length(radial);
  if (distance < 0.001) return { x: 1, y: 0 };

  radial = multiply(radial, 1 / distance);
  const curl = { x: -radial.y, y: radial.x };
  const curlAmount = Math.sin(distance * 0.014) * 0.08;
  return normalize(add(radial, multiply(curl, curlAmount)));
}

function generateFlowSites(
  random: DotNetRandom,
  size: Point,
  count: number,
  flowOrigin: Point,
) {
  const sites: Point[] = [];
  const margin = Math.min(size.x, size.y) * 0.055;
  const scaffoldCount = Math.max(12, Math.trunc(count / 3));
  const columns = Math.ceil(Math.sqrt((scaffoldCount * size.x) / size.y));
  const rows = Math.ceil(scaffoldCount / columns);
  const cellWidth = size.x / columns;
  const cellHeight = size.y / rows;

  for (let index = 0; index < scaffoldCount; index += 1) {
    const column = index % columns;
    const row = Math.trunc(index / columns);
    const stagger = row % 2 === 0 ? -0.24 : 0.24;
    let x = (column + 0.5 + stagger) * cellWidth;
    let y = (row + 0.5) * cellHeight;

    x += randomRange(random, -cellWidth * 0.16, cellWidth * 0.16);
    y += randomRange(random, -cellHeight * 0.12, cellHeight * 0.12);
    y +=
      Math.sin((x / size.x) * Math.PI * 2 * 1.35 + row * 0.42) *
      cellHeight *
      0.3;
    x += Math.sin((y / size.y) * Math.PI * 2 * 1.1) * cellWidth * 0.18;

    sites.push({
      x: clamp(x, margin, size.x - margin),
      y: clamp(y, margin, size.y - margin),
    });
  }

  const maximumRadius = Math.hypot(size.x, size.y);
  while (sites.length < count) {
    let candidate = { ...flowOrigin };

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const angle = randomRange(random, 0, Math.PI * 2);
      const radius =
        22 + Math.pow(random.nextDouble(), 2.35) * maximumRadius;
      candidate = {
        x: flowOrigin.x + Math.cos(angle) * radius,
        y: flowOrigin.y + Math.sin(angle) * radius,
      };

      if (
        candidate.x >= margin &&
        candidate.x <= size.x - margin &&
        candidate.y >= margin &&
        candidate.y <= size.y - margin
      ) {
        break;
      }
    }

    candidate.x = clamp(candidate.x, margin, size.x - margin);
    candidate.y = clamp(candidate.y, margin, size.y - margin);
    sites.push(candidate);
  }

  return sites;
}

function clipToHalfPlane(
  polygon: Point[],
  normal: Point,
  offset: number,
) {
  const clipped: Point[] = [];
  if (polygon.length === 0) return clipped;

  let previous = polygon[polygon.length - 1];
  let previousDistance = dot(previous, normal) - offset;

  for (const current of polygon) {
    const currentDistance = dot(current, normal) - offset;
    const previousInside = previousDistance <= 0.001;
    const currentInside = currentDistance <= 0.001;

    if (previousInside !== currentInside) {
      const denominator = previousDistance - currentDistance;
      const amount =
        Math.abs(denominator) > 0.000001
          ? previousDistance / denominator
          : 0;
      clipped.push(lerpPoint(previous, current, amount));
    }

    if (currentInside) clipped.push(current);
    previous = current;
    previousDistance = currentDistance;
  }

  return clipped;
}

function buildCells(sites: Point[], size: Point) {
  const cells: Point[][] = [];

  for (let i = 0; i < sites.length; i += 1) {
    let polygon: Point[] = [
      { x: 0, y: 0 },
      { x: size.x, y: 0 },
      { x: size.x, y: size.y },
      { x: 0, y: size.y },
    ];

    for (let j = 0; j < sites.length && polygon.length > 0; j += 1) {
      if (i === j) continue;
      const normal = subtract(sites[j], sites[i]);
      const offset = (dot(sites[j], sites[j]) - dot(sites[i], sites[i])) * 0.5;
      polygon = clipToHalfPlane(polygon, normal, offset);
    }

    cells.push(polygon);
  }

  return cells;
}

function polygonCentroid(polygon: Point[], fallback: Point) {
  if (polygon.length < 3) return fallback;

  let doubledArea = 0;
  let weightedCenter = { x: 0, y: 0 };

  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    const cross = start.x * end.y - end.x * start.y;
    doubledArea += cross;
    weightedCenter = add(weightedCenter, multiply(add(start, end), cross));
  }

  return Math.abs(doubledArea) > 0.0001
    ? multiply(weightedCenter, 1 / (3 * doubledArea))
    : fallback;
}

function onSameBoundary(start: Point, end: Point, size: Point) {
  const epsilon = 0.75;
  return (
    (Math.abs(start.x) < epsilon && Math.abs(end.x) < epsilon) ||
    (Math.abs(start.y) < epsilon && Math.abs(end.y) < epsilon) ||
    (Math.abs(start.x - size.x) < epsilon &&
      Math.abs(end.x - size.x) < epsilon) ||
    (Math.abs(start.y - size.y) < epsilon &&
      Math.abs(end.y - size.y) < epsilon)
  );
}

function edgeKey(start: Point, end: Point) {
  const first = {
    x: Math.round(start.x * VERTEX_QUANTIZATION),
    y: Math.round(start.y * VERTEX_QUANTIZATION),
  };
  const second = {
    x: Math.round(end.x * VERTEX_QUANTIZATION),
    y: Math.round(end.y * VERTEX_QUANTIZATION),
  };
  const ordered =
    first.x < second.x || (first.x === second.x && first.y <= second.y)
      ? [first, second]
      : [second, first];
  return `${ordered[0].x},${ordered[0].y}:${ordered[1].x},${ordered[1].y}`;
}

function curveSegment(
  segment: Segment,
  flowOrigin: Point,
  seed: number,
): CurvedEdge {
  const vector = subtract(segment.end, segment.start);
  const segmentLength = length(vector);
  const chord = multiply(vector, 1 / segmentLength);
  let startFlow = flowDirection(segment.start, flowOrigin);
  let endFlow = flowDirection(segment.end, flowOrigin);

  if (dot(startFlow, chord) < 0) startFlow = multiply(startFlow, -1);
  if (dot(endFlow, chord) < 0) endFlow = multiply(endFlow, -1);

  const startTangent = normalize(
    add(multiply(chord, 0.14), multiply(startFlow, 0.86)),
  );
  const endTangent = normalize(
    add(multiply(chord, 0.14), multiply(endFlow, 0.86)),
  );
  const handleLength = segmentLength * 0.46;
  const controlA = add(segment.start, multiply(startTangent, handleLength));
  const controlB = subtract(
    segment.end,
    multiply(endTangent, handleLength),
  );
  const thicknessNoise = hash(
    (segment.start.x + segment.end.x) * 0.5,
    (segment.start.y + segment.end.y) * 0.5,
    seed,
  );

  return {
    start: segment.start,
    controlA,
    controlB,
    end: segment.end,
    thickness: 3.25 + thicknessNoise * 0.65,
  };
}

export function generateVoronoiEdges(): CurvedEdge[] {
  const seed = 42;
  const size = { x: 1500, y: 1000 };
  const flowOrigin = { x: 281.25, y: 102.3 };
  const random = new DotNetRandom(seed);
  const siteCount = Math.max(18, Math.round(80 * 0.6));
  const sites = generateFlowSites(random, size, siteCount, flowOrigin);

  const relaxedCells = buildCells(sites, size);
  for (let i = 0; i < sites.length; i += 1) {
    sites[i] = lerpPoint(
      sites[i],
      polygonCentroid(relaxedCells[i], sites[i]),
      0.18,
    );
  }

  const uniqueSegments = new Map<string, Segment>();
  for (const cell of buildCells(sites, size)) {
    for (let i = 0; i < cell.length; i += 1) {
      const start = cell[i];
      const end = cell[(i + 1) % cell.length];
      if (distanceSquared(start, end) < 4) continue;
      const key = edgeKey(start, end);
      if (!uniqueSegments.has(key)) uniqueSegments.set(key, { start, end });
    }
  }

  const edges: CurvedEdge[] = [];
  for (const segment of uniqueSegments.values()) {
    if (!onSameBoundary(segment.start, segment.end, size)) {
      edges.push(curveSegment(segment, flowOrigin, seed));
    }
  }
  return edges;
}
