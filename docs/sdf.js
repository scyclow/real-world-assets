import { PI, TWO_PI, abs, min, max, sin, cos, atan2, hypot } from './utils.js'

// Shapes as signed distance functions: (x, y) => how far the point is outside the shape's edge (negative inside).
// Rosettes get clipped to them (see clip.js), and sdfBase in bases.js turns them into base gears

export const circleSdf = (cx, cy, r) => (x, y) => hypot(x - cx, y - cy) - r

// Rectangle centered at (cx, cy) with rounded corners. Growing hw, hh, and radius by the same amount grows it evenly
// on every side
export function boxSdf(cx, cy, hw, hh, radius=0) {
  return (x, y) => {
    const qx = abs(x - cx) - hw + radius
    const qy = abs(y - cy) - hh + radius
    return hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - radius
  }
}

// Approximate signed distance to a superellipse centered at (cx, cy): exact sign and edge, and close enough to the
// true distance near the edge for clipping. exponent 2 = ellipse (exact for circles), higher = squarer
export function superellipseSdf(cx, cy, rx, ry, exponent=2) {
  return (x, y) => ((abs((x - cx) / rx)**exponent + abs((y - cy) / ry)**exponent)**(1 / exponent) - 1) * min(rx, ry)
}

// Rectangle around the origin with circular bites centered on its corners, e.g. to clear corner ornaments.
// hw is the half-width; top and bottom are the distances from the origin to those edges.
// Insetting it shrinks the rectangle and grows the bites by the same amount
export function notchedRectSdf({ hw, top, bottom, topRadius=0, bottomRadius=0 }) {
  const hh = (top + bottom) / 2
  const mid = (bottom - top) / 2
  return (x, y) => {
    const qx = abs(x) - hw
    const qy = abs(y - mid) - hh
    const rect = min(max(qx, qy), 0) + hypot(max(qx, 0), max(qy, 0))
    const topBite = topRadius - hypot(qx, y + top)
    const bottomBite = bottomRadius - hypot(qx, y - bottom)
    return max(rect, topBite, bottomBite)
  }
}

// Everything closer to center than to any of others (a voronoi cell)
export function closerToSdf([ax, ay], others) {
  return (x, y) => max(...others.map(([bx, by]) => {
    const [nx, ny] = [bx - ax, by - ay]
    return ((x - (ax + bx) / 2) * nx + (y - (ay + by) / 2) * ny) / hypot(nx, ny)
  }))
}

// The outer edge of a cloud of points around the origin: how far out they reach in each direction, so any curls are
// filled in. sdf(center, grow) and edge(grow) place it at center, grown outward by grow. Growing keeps every point at
// least grow inside the edge measured straight across, not just along the line out from the center, so it stays
// clear of the sides of sharp petals too
export function radialEnvelope(points, bins=720) {
  const binAt = (a, n=bins) => (((a / TWO_PI) % 1) + 1) % 1 * n

  // the farthest point in each direction, in slices finer than the bins so that growing from them is at most a
  // sliver off
  const slicesPerBin = 4
  const farthest = Array(bins * slicesPerBin).fill(null)
  points.forEach(([x, y]) => {
    const s = Math.floor(binAt(atan2(y, x), farthest.length)) % farthest.length
    const r = hypot(x, y)
    if (!farthest[s] || r > farthest[s][2]) farthest[s] = [x, y, r]
  })
  // the edge itself: a closed line through those points, in angle order
  const outer = farthest.filter(Boolean)
  const edge = outer.map((p, i) => [p, outer[(i + 1) % outer.length]])

  // how far out the edge is through the middle of each bin once it's grown: as far along it as a circle of radius
  // grow reaches, rolled all along the edge (so it clears the steep walls between petals, not just their tips).
  // shrinking just pulls it in
  const reaches = new Map()
  const directions = Array.from({ length: bins }, (_, b) => {
    const a = TWO_PI * (b + 0.5) / bins
    return [cos(a), sin(a)]
  })

  const reachFor = grow => {
    if (reaches.has(grow)) return reaches.get(grow)

    if (grow <= 0) {
      const reach = directions.map((_, b) => {
        const slices = farthest.slice(b * slicesPerBin, (b + 1) * slicesPerBin)
        return max(max(...slices.map(p => p?.[2] ?? 0)) + grow, 0)
      })
      reaches.set(grow, reach)
      return reach
    }

    const reach = Array(bins).fill(0)
    // steps along the edge, close enough together that the circles around them overlap into a smooth band. each one
    // pushes out only the bins whose center lines pass within grow of it
    edge.forEach(([[x0, y0], [x1, y1]]) => {
      const steps = Math.ceil(hypot(x1 - x0, y1 - y0) / (grow / 8)) || 1
      for (let s = 0; s < steps; s++) {
        const x = x0 + (x1 - x0) * s / steps
        const y = y0 + (y1 - y0) * s / steps
        const r = hypot(x, y)
        const spread = (r > grow ? Math.asin(grow / r) : PI) / TWO_PI * bins
        const mid = binAt(atan2(y, x)) - 0.5
        for (let k = Math.ceil(mid - spread); k <= Math.floor(mid + spread); k++) {
          const b = ((k % bins) + bins) % bins
          const [dx, dy] = directions[b]
          const across = abs(x * dy - y * dx)
          if (across < grow) reach[b] = max(reach[b], x * dx + y * dy + Math.sqrt(grow * grow - across * across))
        }
      }
    })
    reaches.set(grow, reach)
    return reach
  }

  // interpolated between bin centers
  const reachAt = (reach, a) => {
    const f = binAt(a) - 0.5
    const i = Math.floor(f)
    const t = f - i
    return reach[(i + bins) % bins] * (1 - t) + reach[(i + 1) % bins] * t
  }

  return {
    sdf: ([cx, cy], grow=0) => {
      const reach = reachFor(grow)
      return (x, y) => hypot(x - cx, y - cy) - reachAt(reach, atan2(y - cy, x - cx))
    },
    edge: (grow=0) => {
      const reach = reachFor(grow)
      return progress => {
        const a = progress * TWO_PI
        const r = reachAt(reach, a)
        return [cos(a) * r, sin(a) * r]
      }
    },
  }
}

export const growSdf = (shape, d) => (x, y) => shape(x, y) - d

// Inside any of the shapes
export const unionSdf = (...shapes) => (x, y) => min(...shapes.map(shape => shape(x, y)))

// Inside all of the shapes
export const intersectSdf = (...shapes) => (x, y) => max(...shapes.map(shape => shape(x, y)))

// Inside shape and outside every hole
export const subtractSdf = (shape, ...holes) => (x, y) => max(shape(x, y), ...holes.map(hole => -hole(x, y)))
