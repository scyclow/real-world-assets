import { times, hypot } from './utils.js'

// Cuts every segment of a line of points (a closed loop if closed) into pieces no longer than step
export function densify(points, step, closed=false) {
  if (!step || points.length < 2) return points
  const n = points.length
  const out = []
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % n]
    const pieces = Math.max(1, Math.ceil(hypot(x1 - x0, y1 - y0) / step))
    for (let s = 0; s < pieces; s++) out.push([x0 + (x1 - x0) * s / pieces, y0 + (y1 - y0) * s / pieces])
  }
  if (!closed) out.push(points[n - 1])
  return out
}

// Where the segment from points[inside] to points[outside] first leaves clip: stepped along to find the first
// change, then bisected. Searching from the inside point keeps the drawn piece inside, even when the edge is steep
// or wiggly between points
function crossing(points, clip, inside, outside) {
  const [ax, ay] = points[inside]
  const [bx, by] = points[outside]
  const isIn = t => clip(ax + (bx - ax) * t, ay + (by - ay) * t) <= 0
  let lo = 0
  let hi = 1
  for (let s = 1; s < 8; s++) {
    if (!isIn(s / 8)) {
      hi = s / 8
      break
    }
    lo = s / 8
  }
  times(20, () => {
    const mid = (lo + hi) / 2
    if (isIn(mid)) lo = mid
    else hi = mid
  })
  return [ax + (bx - ax) * lo, ay + (by - ay) * lo]
}

// Splits a closed loop of points into the runs that fall inside clip (a signed distance function, negative inside),
// cutting each run off exactly where it crosses the edge
export function clipLoop(points, clip) {
  const n = points.length
  const d = points.map(([x, y]) => clip(x, y))
  // start from a point outside so no run wraps around the end of the loop
  const start = d.findIndex(v => v > 0)
  if (start === -1) return [[...points, points[0]]]

  const runs = []
  let run = null
  for (let k = 1; k <= n; k++) {
    const prev = (start + k - 1) % n
    const i = (start + k) % n
    if (d[i] <= 0) {
      if (!run) run = [crossing(points, clip, i, prev)]
      run.push(points[i])
    } else if (run) {
      run.push(crossing(points, clip, prev, i))
      runs.push(run)
      run = null
    }
  }
  return runs
}

// Splits an open line of points into the runs that fall inside clip, same as clipLoop
export function clipLine(points, clip) {
  const runs = []
  let run = null
  points.forEach(([x, y], i) => {
    if (clip(x, y) <= 0) {
      if (!run) run = i ? [crossing(points, clip, i, i - 1)] : []
      run.push(points[i])
    } else if (run) {
      run.push(crossing(points, clip, i - 1, i))
      runs.push(run)
      run = null
    }
  })
  if (run) runs.push(run)
  return runs.filter(run => run.length > 1)
}

const runsPath = runs => runs
  .map(run => 'M ' + run.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '))
  .join(' ')

// Path for a stroke: a closed loop or an open line of points. With clip, it's cut into separate pieces wherever it
// leaves the clip shape (empty if it's never inside), after cutting it into pieces no longer than step so no long
// segment skips over the edge
export function strokePath(points, { closed=false, clip=null, step=0 }={}) {
  if (!clip) return runsPath([closed ? [...points, points[0]] : points])
  const fine = densify(points, step, closed)
  return runsPath(closed ? clipLoop(fine, clip) : clipLine(fine, clip))
}
