import { TWO_PI, sin, cos, abs, min, max, dist, times, last, getXYRotation } from './utils.js'

// A base sets a rosette's broad shape. It's a family of base gears, one per layer: base(size) returns the base gear
// for a layer of that size, or null if there's no room for one. size is how close the base gear comes to the center.
// A base gear is a closed loop around the rosette's center, progress (0-1) => [x, y], starting at bottom center and
// moving at a constant speed. The rest of the gears ride on it (see rosette.js)

// Circles, size being the radius. The original rosette2.js shape
export const radialBase = () => size => size > 0 ? circleGear(size) : null

// Rounded rectangles (superellipses) with a half-width of size + stretch[0] and a half-height of size + stretch[1],
// so each layer is inset from the next by the same amount on every side.
// exponent 2 = oval, ~4 = squircle, 8+ = rounded rectangle
export const rectBase = ({ exponent=8, stretch=[0, 0] }={}) => memoize(size => {
  const hw = size + stretch[0]
  const hh = size + stretch[1]
  return hw > 0 && hh > 0 ? superellipseGear(hw, hh, exponent) : null
})

// Any shape, as a signed distance function around the rosette's center (see sdf.js). The layer at the shape's
// clearance (the distance from the center to its edge) traces its edge; the rest are inset from or grown out of it
export function sdfBase(sdf, options) {
  const { gearAt, clearance } = sdfGear(sdf, options)
  return memoize(size => gearAt(clearance - size))
}

export const circleGear = r => progress => getXYRotation(progress * TWO_PI, r)

export function superellipseGear(hw, hh, exponent=8, samples=8000) {
  const e = 2 / exponent
  return arcLengthGear(times(samples, i => {
    const a = TWO_PI * i / samples
    const s = sin(a)
    const c = cos(a)
    return [hw * Math.sign(s) * abs(s)**e, hh * Math.sign(c) * abs(c)**e]
  }))
}

// Traces a closed loop of points at constant speed starting at points[0], so equal progress steps cover equal
// distance along the edge
export function arcLengthGear(points) {
  const pts = [...points, points[0]]
  const lengths = [0]
  for (let i = 1; i < pts.length; i++) {
    lengths.push(lengths[i-1] + dist(...pts[i-1], ...pts[i]))
  }
  const perimeter = last(lengths)

  return progress => {
    const target = (((progress % 1) + 1) % 1) * perimeter
    let lo = 0
    let hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (lengths[mid] <= target) lo = mid
      else hi = mid
    }
    const f = (target - lengths[lo]) / (lengths[hi] - lengths[lo] || 1)
    return [
      pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f,
      pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f,
    ]
  }
}

// Base gears traced from a signed distance function (negative inside the shape, 0 on its edge, relative to the
// rosette center). gearAt(inset) returns the gear for a ring that far inside the edge (negative insets grow past
// it), or null once it would collapse past the center.
// Rings are found by casting rays out from the center, so each ring needs to be fully visible from it.
// Insetting turns corners sharp, so each ring is smoothed over a length of rounding * inset (at least minRounding,
// which defaults to a fifteenth of the distance from the center to the edge)
export function sdfGear(sdf, { rays=1440, rounding=0.5, minRounding }={}) {
  const clearance = -sdf(0, 0)
  minRounding ??= clearance / 15
  // how close counts as landing on a ring, relative to the shape's size
  const precision = clearance * 1e-5

  const gearAt = inset => {
    if (inset >= clearance) return null
    const ring = arcLengthGear(times(rays, i => {
      // start at bottom center like the circular gear
      const [dx, dy] = getXYRotation(TWO_PI * i / rays, 1)
      // step out by the remaining distance to the ring until we land on it
      let r = 0
      for (let step = 0; step < 100; step++) {
        const d = -inset - sdf(dx * r, dy * r)
        if (d < precision) break
        r += d
      }
      return [dx * r, dy * r]
    }))

    // resample evenly along the ring, then round off its corners
    const even = times(rays, i => ring(i / rays))
    const step = dist(...even[0], ...even[1]) || 1
    return arcLengthGear(smoothLoop(even, min(Math.round(max(minRounding, rounding * inset) / step), rays/2 - 1)))
  }

  return { gearAt, clearance, sdf }
}

// Circular box blur over a closed loop of points. A few passes approximates a gaussian
function smoothLoop(pts, radius, passes=3) {
  const n = pts.length
  const w = 2 * radius + 1
  let out = pts
  times(passes, () => {
    const src = out
    out = src.map((_, i) => {
      let sx = 0
      let sy = 0
      for (let k = -radius; k <= radius; k++) {
        const [x, y] = src[(i + k + n) % n]
        sx += x
        sy += y
      }
      return [sx / w, sy / w]
    })
  })
  return out
}

// Base gears are slow to build, and fitting a rosette asks for the same sizes over and over
function memoize(fn) {
  const cache = new Map()
  return size => {
    if (!cache.has(size)) cache.set(size, fn(size))
    return cache.get(size)
  }
}
