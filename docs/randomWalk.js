import { setSeed, randomHash, rnd, prb, TWO_PI, hypot, min, max, times } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase } from './bases.js'
import { generateFeatures } from './features.js'
import { createRosette } from './rosette.js'
import { features } from './bill.js'
import { gearOptionsFor } from './rosetteSettings.js'

// A random walk around a closed path: a line that follows the path, wandering from side to side of it as it goes, and
// always coming back to exactly where it started. At random points along it, it branches off into spirals that wander
// the same way. The path is a circle, a square, or a rosette's outline, or all three side by side. drawRandomWalk()
// draws one from a hash (a new one every time, unless it's handed one). randomWalkConsole.js drives it; studio.html
// opens that.

const layout = {
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
  // how far each panel's path sits in from its edges, besides the wandering, and between panels
  pad: 6,
}

// what the console starts at:
//   path: 'circle', 'square', 'rosette', or 'all' (one of each, side by side). size: how far the path reaches from its
//   middle (mm). amplitude and gears: the rosette's (see rosetteSettings.js)
//   steps: how many steps the walk takes, all the way around. roughness: how far it can lurch sideways at each one
//   (mm). smoothness: how much of its last step carries into the next (0 jittery, closer to 1 long lazy swings).
//   tether: how hard it's pulled back toward the path at each step, the further it's strayed (0 lets it wander off).
//   strands: how many walks go around each path
//   branches: how many spirals branch off each walk. turns: how many times each one winds. spiral: how big they start
//   (mm), and tighten from there
export const defaults = {
  path: 'all',
  size: 40,
  amplitude: 0.05,
  gears: 7,
  steps: 1600,
  roughness: 0.05,
  smoothness: 0.97,
  tether: 0.004,
  strands: 1,
  branches: 6,
  turns: 2.5,
  spiral: 8,
  color: 'black',
}

export const paths = ['circle', 'square', 'rosette', 'all']

// n points evenly spaced along a closed line, by distance
function resample(points, n) {
  const closed = [...points, points[0]]
  const lengths = [0]
  for (let i = 1; i < closed.length; i++) lengths.push(lengths[i - 1] + hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]))
  const total = lengths.at(-1)
  let j = 0
  return times(n, i => {
    const at = total * i / n
    while (lengths[j + 1] < at) j++
    const f = (at - lengths[j]) / (lengths[j + 1] - lengths[j] || 1)
    return [closed[j][0] + (closed[j + 1][0] - closed[j][0]) * f, closed[j][1] + (closed[j + 1][1] - closed[j][1]) * f]
  })
}

// each kind of path, around the origin, reaching size from it (and the rosette's rolled from the hash)
function pathPoints(kind, s) {
  if (kind === 'circle') return times(720, i => [s.size * Math.sin(TWO_PI * i / 720), s.size * Math.cos(TWO_PI * i / 720)])
  if (kind === 'square') {
    const r = s.size * 0.85
    return [[-r, -r], [r, -r], [r, r], [-r, r]]
  }
  const rosette = createRosette({
    ...generateFeatures({
      ...features,
      styleChances: { standard: 1 },
      gearOptions: { ...gearOptionsFor(features.gearOptions, { gears: s.gears, amplitude: s.amplitude }), oddRotations: false },
    }),
    symmetry: 'vertical',
    base: radialBase(),
    pointCount: 1440,
    layers: 1,
    minSize: s.size / (1 + 2 * s.amplitude),
  })
  return rosette.outline[0]
}

// a walk sideways off a line of n steps: each step goes on as the last one did (by smoothness), lurches a little more
// at random (by roughness), and is pulled back toward the line the further off it's got (by tether). closed, it's
// pulled back a little more at every step (a line from where it would end back to 0), so it ends exactly where it
// started
function wander(n, { roughness, smoothness, tether }, closed=true) {
  let step = 0
  let off = 0
  const offsets = times(n + 1, () => {
    const at = off
    step = smoothness * step + roughness * (rnd() * 2 - 1) - tether * off
    off += step
    return at
  })
  return closed ? offsets.map((o, i) => o - offsets[n] * i / n) : offsets
}

// a spiral branching off from point, heading away along direction (a unit vector) and curling round to one side
// (turn: 1 or -1), winding turns times as it tightens from size to a tenth of it, wandering like the walk does
function branch([px, py], [dx, dy], turn, s, stepLength) {
  // it winds around a center size off to its side, starting at point
  const [cx, cy] = [px - dy * turn * s.spiral, py + dx * turn * s.spiral]
  const start = Math.atan2(py - cy, px - cx)
  const angle = s.turns * TWO_PI
  const tighten = Math.log(10) / angle
  const length = s.spiral * (1 - Math.exp(-tighten * angle)) / tighten
  const n = max(8, Math.ceil(length / stepLength))
  const offsets = wander(n, s, false)
  return times(n + 1, i => {
    const a = angle * i / n
    const r = s.spiral * Math.exp(-tighten * a) + offsets[i] * Math.exp(-tighten * a)
    const heading = start + turn * a
    return [cx + r * Math.cos(heading), cy + r * Math.sin(heading)]
  })
}

// Draws the walks (see defaults for what can be set). Returns them and their hash
export function drawRandomWalk({ hash=randomHash(), ...settings }={}) {
  const s = { ...defaults, ...settings }
  setSeed(hash)
  const kinds = s.path === 'all' ? ['circle', 'square', 'rosette'] : [s.path]
  const { strokeWidth, strokeOpacity, pad } = layout
  // a square panel for each, room for its walks' wandering and its spirals around it
  const panel = 2 * (s.size + s.spiral * 2 + pad)
  const svg = new Svg({ width: panel * kinds.length, height: panel, background: '#fff' })
  const stroke = pen[s.color] ?? s.color
  const draw = points => svg.path(`M ${points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')}`, { stroke, strokeWidth, strokeOpacity })

  const walks = kinds.map((kind, k) => {
    const [ox, oy] = [panel * (k + 0.5), panel / 2]
    const path = resample(pathPoints(kind, s), s.steps).map(([x, y]) => [x + ox, y + oy])
    const n = path.length
    const stepLength = hypot(path[1][0] - path[0][0], path[1][1] - path[0][1])
    // which way is sideways at each step: across the line, pointing out
    const across = path.map((_, i) => {
      const [ax, ay] = path[(i - 1 + n) % n]
      const [bx, by] = path[(i + 1) % n]
      const d = hypot(bx - ax, by - ay) || 1
      return [(by - ay) / d, -(bx - ax) / d]
    })
    return times(s.strands, () => {
      const offsets = wander(n, s)
      const walk = [...path.map(([x, y], i) => [x + across[i][0] * offsets[i], y + across[i][1] * offsets[i]]), null]
      walk[n] = walk[0]
      draw(walk)
      // the spirals, each from a random step, heading on along the walk and curling off to one side
      const spirals = times(s.branches, () => {
        const i = Math.floor(rnd() * n)
        const [x, y] = walk[i]
        const [nx, ny] = walk[i + 1]
        const d = hypot(nx - x, ny - y) || 1
        const spiral = branch([x, y], [(nx - x) / d, (ny - y) / d], prb(0.5) ? 1 : -1, s, stepLength)
        draw(spiral)
        return spiral
      })
      return { kind, walk, spirals }
    })
  }).flat()

  return { hash, svg, settings: s, walks }
}
