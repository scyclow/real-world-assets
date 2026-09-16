import { PI, TWO_PI, sin, cos, abs, min, max, atan2, dist, times, last } from './utils.js'

// Paths, and the pieces every ornament that runs along one is built from. An ornament takes a path — straight, a
// circular arc, an oval, or the contour around a shape like a rosette — and hangs itself off it; this is what it
// hangs off, shared by acanthus.js and vine.js.
//
// Angles are radians, 0 pointing along +x and turning clockwise on screen (so a quarter turn takes +x to +y). A
// line's "left" is that same quarter turn off the direction it heads in, and `side` (1 or -1) is which side of it
// something falls on


export const rad = deg => deg * PI / 180
export const line = points => ({ points, closed: false })
export const loop = points => ({ points, closed: true })

// Which side of the line from a to b the point t falls: 1 for its left, -1 for its right. An arc is bowed by naming
// a point it should bulge toward, so the bulge comes out right whichever way the line happens to be running
export const sideOf = ([ax, ay], [bx, by], [tx, ty]) => Math.sign((tx - ax) * -(by - ay) + (ty - ay) * (bx - ax)) || 1

// A setting that can be one number, a [start, end] range eased evenly along the path, or a function of u (0-1 along it)
export const along = v => typeof v === 'function' ? v : Array.isArray(v) ? u => v[0] + (v[1] - v[0]) * u : () => v


// ---------------------------------------------------------------------------------------------------- walking a line

// An arc-length walk along a line of points, so anything hung off it is spaced by distance rather than by however
// densely it happens to be sampled. at(u) (0-1 from one end to the other) gives the point there and the direction it
// heads in; offset(u, d) gives the point d to the left of it (negative d to the right).
// closed reads u right round the loop instead of holding at the ends, for a line whose last point meets its first.
// window (0-1 of the whole line) takes the heading from that far either side rather than from the one segment u
// lands in: a path with a corner in it — the contour around a rosette often has one — would otherwise swing
// whatever rides on it straight across the corner
export function walk(points, closed=false) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + dist(...points[i - 1], ...points[i]))
  const length = last(lengths)
  const hold = u => closed ? ((u % 1) + 1) % 1 : min(max(u, 0), 1)

  const at = u => {
    const target = hold(u) * length
    let lo = 0
    let hi = points.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (lengths[mid] <= target) lo = mid
      else hi = mid
    }
    const f = (target - lengths[lo]) / (lengths[hi] - lengths[lo] || 1)
    const [ax, ay] = points[lo]
    const [bx, by] = points[hi]
    return { point: [ax + (bx - ax) * f, ay + (by - ay) * f], angle: atan2(by - ay, bx - ax) }
  }

  const heading = (u, window=0) => {
    if (!window) return at(u).angle
    const [ax, ay] = at(u - window).point
    const [bx, by] = at(u + window).point
    return ax === bx && ay === by ? at(u).angle : atan2(by - ay, bx - ax)
  }

  const offset = (u, d, window=0) => {
    const { point: [x, y] } = at(u)
    const angle = heading(u, window)
    return [x - sin(angle) * d, y + cos(angle) * d]
  }

  return { points, length, closed, at, heading, offset }
}

// The curve a lobe's outer edge is: `length` long, starting at origin heading at `angle`, turning `sweep` in total.
// curl saves the turning for the tip, so the edge sweeps out and then coils over: 0 is an even circular arc, 1 a
// gentle curl, 2 and up a tight volute
export function rib({ origin: [ox, oy], angle, length, sweep, curl=1, samples=40 }) {
  let x = ox
  let y = oy
  const step = length / samples
  const points = [[x, y]]
  for (let i = 0; i < samples; i++) {
    const a = angle + sweep * ((i + 0.5) / samples) ** (curl + 1)
    x += cos(a) * step
    y += sin(a) * step
    points.push([x, y])
  }
  return points
}

// A logarithmic spiral winding in to center: the eye tucked into a lobe's crook, and the volute a band runs out
// into. It
// starts `radius` away at `angle` and turns `turns` times toward the middle, direction being which way round
export function spiral({ center: [cx, cy], radius, angle, turns=1, tightness=0.3, direction=1, samples=72 }) {
  return times(samples + 1, i => {
    const t = turns * TWO_PI * i / samples
    const r = radius * Math.exp(-tightness * t)
    const a = angle + direction * t
    return [cx + cos(a) * r, cy + sin(a) * r]
  })
}


// ---------------------------------------------------------------------------------------------------- paths

// A straight run from one point to the other
export const lineSpine = (start, end) => ({ points: [start, end], closed: false })

// Any line of points, as they come
export const pointsSpine = (points, closed=false) => ({ points, closed })

// A circular arc from start to end, bulging off to the chord's left by `bulge` of the chord's length (negative bulges
// right, 0.5 is a half circle, and more than that comes back around into a major arc)
export function arcSpine(start, end, bulge, samples=240) {
  if (abs(bulge) < 1e-6) return lineSpine(start, end)
  const [ax, ay] = start
  const [bx, by] = end
  const chord = dist(ax, ay, bx, by)
  // the chord's left, and the half-angle the arc subtends (the usual bulge = tan(quarter of the arc's angle))
  const nx = -(by - ay) / chord
  const ny = (bx - ax) / chord
  const half = 2 * Math.atan(2 * bulge)
  const cx = (ax + bx) / 2 - nx * (chord / 2) / Math.tan(half)
  const cy = (ay + by) / 2 - ny * (chord / 2) / Math.tan(half)
  const radius = dist(cx, cy, ax, ay)
  const from = atan2(ay - cy, ax - cx)
  const sweep = -2 * half
  return { points: times(samples + 1, i => {
    const a = from + sweep * i / samples
    return [cx + cos(a) * radius, cy + sin(a) * radius]
  }), closed: false }
}

// An ellipse (a circle where rx === ry) around center, from angle `from` to angle `to`. A whole one comes back
// closed. Going the usual way round, side 1 faces the center and -1 faces out
export function ellipseSpine({ center: [cx, cy], rx, ry=rx, from=0, to=TWO_PI, samples=360 }) {
  const whole = abs(to - from) >= TWO_PI - 1e-9
  const n = max(8, Math.round(samples * abs(to - from) / TWO_PI))
  return { points: times(whole ? n : n + 1, i => {
    const a = from + (to - from) * i / n
    return [cx + cos(a) * rx, cy + sin(a) * ry]
  }), closed: whole }
}

// The contour that keeps `gap` clear of a shape given as a signed distance function around center (see sdf.js), which
// is what an ornament grows along when it wraps a rosette: pass rosetteSdf(rosette) and it follows the rosette's own
// outline rather than a circle around it. maxRadius is how far out to look for the contour.
// smooth rounds the contour off, as a fraction of the way around to average each radius over: a path that followed
// every petal of a rosette would double back on itself and pile the lobes up in its valleys, so it wants to keep
// only the broad swells of the shape. 0 follows it exactly
export function sdfSpine({ sdf, center: [cx, cy], gap=0, from=0, to=TWO_PI, maxRadius, smooth=0.06, samples=240 }) {
  const whole = abs(to - from) >= TWO_PI - 1e-9
  const n = max(8, Math.round(samples * abs(to - from) / TWO_PI))
  const count = whole ? n : n + 1
  const angleAt = i => from + (to - from) * i / n

  // the shape's distance only grows going out along each ray, so the contour is just bisected for
  const radia = times(count, i => {
    const dx = cos(angleAt(i))
    const dy = sin(angleAt(i))
    let lo = 0
    let hi = maxRadius
    times(30, () => {
      const mid = (lo + hi) / 2
      if (sdf(cx + dx * mid, cy + dy * mid) < gap) lo = mid
      else hi = mid
    })
    return lo
  })

  // averaged over a window either side, wrapping around a whole turn and holding the ends of a partial one
  const window = Math.round(n * smooth)
  const rounded = !window ? radia : radia.map((_, i) => {
    let sum = 0
    for (let k = -window; k <= window; k++) {
      const j = whole ? ((i + k) % count + count) % count : min(max(i + k, 0), count - 1)
      sum += radia[j]
    }
    return sum / (2 * window + 1)
  })

  return { points: rounded.map((r, i) => [cx + cos(angleAt(i)) * r, cy + sin(angleAt(i)) * r]), closed: whole }
}


