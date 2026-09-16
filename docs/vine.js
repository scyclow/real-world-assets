import { TWO_PI, PI, sin, cos, abs, min, max, atan2, times, last, createRandom } from './utils.js'
import { line, loop, along, walk, spiral, arcSpine } from './paths.js'
import { pen } from './colors.js'
import { strokePath } from './clip.js'

// A single vine wound around a path. One unbroken line: it leaves the starting point, swings out to one side of the
// path, curls back over itself, crosses, swings out the other side, and so on all the way along — a line, an oval,
// or the contour around a rosette alike (see paths.js for where those come from).
//
// The winding is a trochoid rolled along the path. In the path's own coordinates, `s` along it and `o` off it, the
// vine swings out by `o = reach * sin(turn)` and is held back along the path by however hard it is swinging:
//
//   ds/dt = (how fast it would go) * (1 - curl * pull)
//
// where pull is the swing scaled so that it reaches 1 at the far side of a swing. So at curl 1 the vine comes to a
// dead stop right at the far side — a cusp — and above 1 it runs backwards there instead, which is exactly when the
// wave opens out into a loop. Below 1 it only waves. Every vine is one continuous line either way

export const vineDefaults = {
  // the path to wind around: a line of points, or { points, closed } from one of the spine builders in paths.js
  spine: [[0, 0], [100, 0]],
  // where the vine starts: how far along the path (0-1), or a point, which it starts from the nearest place to.
  // a closed path goes one full lap from there and joins back up; an open one runs on to `end`
  start: 0,
  end: 1,
  // how many times it winds around the path over the stretch it covers, or null to take one turn every `pitch` of
  // path. a closed path rounds either to a whole number, so the vine meets itself where it started
  turns: null,
  // how much path one turn covers, in reaches. going by this rather than a count is what lets the same settings
  // trace a short line and a long oval with coils the same size
  pitch: 2.2,
  // how far it swings off the path: one distance, a [start, end] range eased along it, or u => distance
  reach: 12,
  // how far it runs back on itself at the far side of a swing. below 1 it only waves; at 1 the wave pinches to a
  // cusp; above it every swing opens into a curl. this is the whole character of the thing
  curl: 2.4,
  // whether it curls both ways in turn, winding around the path, or always the same way, which leaves the curls all
  // down one side and the other side a plain arc
  alternate: true,
  // points drawn per turn where the vine is running slowest. it covers ground several times faster at a crossing
  // than at the far side of a swing, and gets proportionally more points there, so the line stays smooth either way
  samples: 26,
  // how much of the path either side the vine reads its heading over, rather than taking it from the one stretch it
  // is passing. a contour traced around a rosette can have a corner in it, and a vine that took its heading straight
  // off one would jump clear across it
  tangent: 0.006,
  // a leaf at the far side of every swing: how long it is and how fat, in reaches, and how far it leans into the
  // way the vine is running. false leaves them out
  leaves: true,
  leafLength: 0.62,
  leafWidth: 0.3,
  leafLean: 34,
  // a tendril spiralling off every nth swing, on the other side from that swing's leaf: how big, in reaches, and
  // how many times it turns. false leaves them out
  tendrils: true,
  tendrilEvery: 3,
  tendrilRadius: 0.3,
  tendrilTurns: 1.15,
  // how much the leaves and tendrils differ from one another, 0 making them all the same
  jitter: 0.2,
  // (i, count) => the stroke for the leaf or tendril at swing i. the vine itself takes colorFn(-1, count)
  colorFn: () => pen.black,
  // seeds the jitter, so the same vine comes out the same every time
  seed: 0,
  // as a rosette's (see rosette.js): strokes stop where they leave the clip, after being cut into pieces no longer
  // than clipStep so none skips over its edge
  clip: null,
  clipStep: 0.5,
  strokeWidth: 1,
  strokeOpacity: 1,
}

// Builds a vine from its config (see vineDefaults). Returns the resolved config, the path as a walk, the vine's own
// line of points, where every swing reached its furthest, and everything it draws as strokes
export function createVine(config) {
  const c = { ...vineDefaults, ...config }
  const closed = Array.isArray(c.spine) ? false : !!c.spine.closed
  const given = Array.isArray(c.spine) ? c.spine : c.spine.points
  const path = walk(closed ? [...given, given[0]] : given, closed)
  const reachAt = along(c.reach)
  const random = createRandom(c.seed)

  // where it starts: a place along the path, or the nearest place to a point
  const from = Array.isArray(c.start) ? nearestOn(path, c.start) : c.start
  // a closed path goes one whole lap, and takes a whole number of turns so the two ends of the vine meet
  const span = closed ? 1 : max(c.end - from, 1e-6)

  // a closed path reads u right round the loop; an open one holds at its ends
  const wrap = u => closed ? ((u % 1) + 1) % 1 : min(max(u, 0), 1)

  // one turn every `pitch` of path, unless a count is given outright. the reach is averaged over the stretch the
  // vine covers, so a run that swells gets bigger coils to go with it
  const meanReach = times(32, i => reachAt(wrap(from + span * (i + 0.5) / 32))).reduce((t, r) => t + r, 0) / 32
  const asked = c.turns ?? span * path.length / max(c.pitch * meanReach, 1e-6)

  // rounded so the run covers whole swings and the vine finishes on a crossing rather than halfway out of one.
  // curling both ways takes half a turn to come back to the same swing, curling one way takes a whole one; a closed
  // path needs a whole one either way, or the vine would meet itself going the wrong side of the path
  const step = closed || !c.alternate ? 1 : 0.5
  const turns = max(step, Math.round(asked / step) * step)

  // how much faster the vine runs along the path at a crossing than it would if it just went straight along: the
  // sampling is stepped up by this, so the crossings don't come out as long straight chords
  const middle = c.alternate ? 2 / PI : 0
  const fastest = 1 + c.curl * (c.alternate ? middle / (1 - middle) : 1)
  const total = max(8, Math.round(turns * c.samples * fastest))
  const turnAt = i => TWO_PI * turns * i / total

  // how hard the vine is swinging at this point in a turn, scaled to reach 1 at the far side of one. curling both
  // ways means taking the swing either side, which pulls back on average, so the average is taken out again — what
  // is left is the same shape of pull as the one-way case and `curl` means the same thing in both
  const pull = turn => ((c.alternate ? abs(sin(turn)) : sin(turn)) - middle) / (1 - middle)

  // where along the path each point sits, stepped along because the two-way pull has no tidy closed form. what is
  // left over at the end is spread back over the whole run, so the vine lands exactly where it should
  const us = [from]
  for (let i = 1; i <= total; i++) {
    us.push(last(us) + (span / total) * (1 - c.curl * (pull(turnAt(i - 1)) + pull(turnAt(i))) / 2))
  }
  const drift = last(us) - (from + span)
  const atTurn = i => {
    const at = wrap(us[i] - drift * i / total)
    return { at, out: sin(turnAt(i)) }
  }

  const points = times(total + 1, i => {
    const { at, out } = atTurn(i)
    return path.offset(at, reachAt(at) * out, c.tangent)
  })

  // the far side of every swing, where the vine is at its furthest off the path: a quarter turn in, then every half
  // turn after. the leaves and tendrils hang off these
  const swings = times(Math.round(turns * 2), k => {
    const t = (k + 0.5) / (2 * turns)
    const { at, out } = atTurn(min(total, Math.round(t * total)))
    const angle = path.heading(at, c.tangent)
    const side = out >= 0 ? 1 : -1
    return {
      side,
      point: path.offset(at, reachAt(at) * out, c.tangent),
      reach: reachAt(at),
      // straight out from the path on the swing's own side, and the way the vine is running as it passes
      outward: angle + side * PI / 2,
      heading: angle,
    }
  })

  const count = swings.length
  const strokes = [
    { ...(closed ? loop(points) : line(points)), stroke: c.colorFn(-1, count) },
    ...swings.flatMap((s, i) => growth(c, s, i, random).map(g => ({ ...g, stroke: c.colorFn(i, count) }))),
  ]

  return { config: c, path, closed, points, swings, strokes }
}

// What hangs off one swing: a leaf pointing out past it, and on every nth swing a tendril spiralling off the other
// way, so the vine doesn't just repeat
function growth(c, s, i, random) {
  const out = []
  const wobble = (v, amount=1) => v * (1 + random.rnd(-c.jitter, c.jitter) * amount)

  if (c.leaves) {
    // leaning into the way the vine is running, so the leaves all sweep the same way along it
    const angle = s.outward - s.side * rad(wobble(c.leafLean, 0.5))
    out.push(leaf(s.point, angle, s.reach * wobble(c.leafLength, 0.3), wobble(c.leafWidth, 0.25)))
  }

  if (c.tendrils && i % max(1, Math.round(c.tendrilEvery)) === 0) {
    const r = s.reach * wobble(c.tendrilRadius, 0.3)
    // springing back along the path from the swing, and winding away from it
    const center = [
      s.point[0] + cos(s.heading + PI) * r,
      s.point[1] + sin(s.heading + PI) * r,
    ]
    out.push(line(spiral({
      center,
      radius: r,
      angle: atan2(s.point[1] - center[1], s.point[0] - center[0]),
      turns: wobble(c.tendrilTurns, 0.25),
      direction: s.side,
    })))
  }

  return out
}

// A leaf as a plain almond: two arcs from where it springs out to its point, bowed opposite ways
function leaf([bx, by], angle, length, width) {
  const tip = [bx + cos(angle) * length, by + sin(angle) * length]
  return loop([...arcSpine([bx, by], tip, width, 16).points, ...arcSpine(tip, [bx, by], width, 16).points])
}

const rad = deg => deg * PI / 180

// How far along a walk the point nearest p lies (0-1), found by stepping along it and then closing in
function nearestOn(path, [px, py]) {
  const near = (u) => {
    const [x, y] = path.at(u).point
    return (x - px) ** 2 + (y - py) ** 2
  }
  let best = 0
  let bestD = Infinity
  const steps = 400
  for (let i = 0; i <= steps; i++) {
    const d = near(i / steps)
    if (d < bestD) {
      bestD = d
      best = i / steps
    }
  }
  // then narrowed down between the samples either side
  let lo = max(0, best - 1 / steps)
  let hi = min(1, best + 1 / steps)
  times(24, () => {
    const a = lo + (hi - lo) / 3
    const b = hi - (hi - lo) / 3
    if (near(a) < near(b)) hi = b
    else lo = a
  })
  return (lo + hi) / 2
}

// Draws a vine's strokes, clipped to its clip, the same way drawRosette draws a rosette's
export function drawVine(svg, { config: { clip, clipStep, strokeWidth, strokeOpacity }, strokes }) {
  strokes.forEach(({ points, closed, stroke }) => {
    const d = strokePath(points, { closed, clip, step: clipStep })
    if (d) svg.path(d, { stroke, strokeWidth, strokeOpacity })
  })
}
