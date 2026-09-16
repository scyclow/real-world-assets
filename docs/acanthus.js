import { PI, sin, cos, min, max, atan2, dist, times, last, createRandom } from './utils.js'
import { rad, line, loop, sideOf, along, walk, rib, spiral, arcSpine } from './paths.js'
import { pen } from './colors.js'
import { strokePath } from './clip.js'

// Acanthus ornament: a band of carved foliage running from one point to another, the way it borders a frieze or
// wraps a rosette. The acanthus is the vine, not something hung off one — there is no stem with leaves tied to it.
// The band is a single body following the path, and its own edge is what runs out into the leaves:
//
//   the path  straight, a circular arc, an oval, or the contour around a shape
//   the body  a tapering form along that path, thick enough to read as the vine itself
//   the lobe  an excursion of the body's edge: it leaves the body at its foot, sweeps out along a rib that curls
//             over at the tip, and hooks back into the body at a crook, with a small eye spiralled into it
//
// So an edge is one unbroken line: body, lobe, body, lobe. Lobes alternate sides, and the two edges close into one
// outline. Angles are radians, 0 pointing along +x and turning clockwise on screen (so a quarter turn takes +x to
// +y). A stroke's "left" is that same quarter turn off the direction it heads in, and `side` (1 or -1) is which
// side of the path something falls on. The path itself, and the curves the band is drawn out of, come from paths.js


// ---------------------------------------------------------------------------------------------------- the band

export const acanthusDefaults = {
  // the path the band runs along: a line of points, or { points, closed } from one of the spine builders above
  spine: [[0, 0], [100, 0]],
  // how far the band strays from that path: one distance, a [start, end] range eased along it, or u => distance.
  // every lobe's point reaches exactly this far off the path where it springs from
  stray: 20,
  // which side of the path the lobes spring from: 'alternate', or 1 (the path's left, going along it) or -1 for a
  // band that only breaks one way
  side: 'alternate',
  // how far apart lobes on the same side are, in strays. they space themselves by how far the band strays where
  // each one springs from, so they crowd up where it narrows and open out where it widens. measuring it per side
  // keeps a band whose lobes all break the same way as open as one whose lobes alternate
  spacing: 1.9,
  // where along the path the first and last spring from (a closed path spaces them right around instead). an open
  // band wants room past its last lobe for the body to run out and wind up into its volute without the lobe's own
  // curl crossing it
  from: 0.07,
  to: 0.94,
  // at most this many, however the spacing works out
  maxLobes: 300,
  // the body: how thick the vine itself is at the start and the end, as a fraction of the stray. a closed band has
  // no start or end to taper between, so it takes the two evenly
  body: [0.3, 0.13],
  // how far the body swings toward each lobe as it passes, in strays: the vine snakes through the band instead of
  // running straight down the middle of it. 0 runs it straight
  weave: 0.3,
  // how far an open band's two ends swing back the other way, as a fraction of that. the tail leaves the last lobe
  // rather than running up into it, so it has clear air to wind its volute in
  weaveEnds: 0.5,
  // how much of each end the body is pinched down to a point over, so an open band starts and finishes on a taper
  // rather than a blunt cut
  pinch: 0.04,
  // each lobe: how much of the way to the next one on its own side its foot covers (1 leaves no plain body between
  // them), how far
  // it leans off the body where it springs, how far it turns from there to its tip, and how much of that turn is
  // saved for the tip. a sweep past 180 with some curl brings the tip over into a volute, which is what reads as
  // acanthus rather than a row of fins
  lobeSpan: 0.86,
  lobeSpring: 56,
  lobeSweep: 205,
  lobeCurl: 1.35,
  // how far the lobe's underside hooks back into the body behind it
  lobeFront: 0.22,
  // the longest a lobe's rib may run, as a multiple of its own span plus its reach. a lobe on the inside of a tight
  // curve would otherwise have to run a very long way before its tip got clear of the path, and would wander right
  // across the band on the way. held here, its tip stops a little short of the stray instead, which is the curve
  // running out of room rather than a fault
  lobeReach: 1.15,
  // the spiral in the crook where a lobe folds back into the body, in strays (false leaves them out)
  eye: 0.11,
  eyeTurns: 0.9,
  // the fold line up inside each lobe: how far along its curl it reaches, and how far it is held off the edge, in
  // strays (false leaves them out)
  fold: 0.82,
  foldInset: 0.12,
  // the spiral an open band runs out into, in strays (false leaves it out), how many times it turns, and which side
  // it curls toward ('auto' curls it away from the last lobe)
  volute: 0.55,
  voluteTurns: 1.4,
  voluteSide: 'auto',
  // how much the lobes differ from one another, 0 making them all the same
  jitter: 0.14,
  // (i, count) => the stroke for lobe i. the outline and the volute take colorFn(-1, count)
  colorFn: () => pen.black,
  // seeds the jitter, so the same band comes out the same every time
  seed: 0,
  // as a rosette's (see rosette.js): strokes stop where they leave the clip, after being cut into pieces no longer
  // than clipStep so none skips over its edge
  clip: null,
  clipStep: 0.5,
  strokeWidth: 1,
  strokeOpacity: 1,
}

// Builds an acanthus band from its config (see acanthusDefaults). Returns the resolved config, the path as a walk,
// every lobe, and everything it draws as strokes: { points, closed, stroke }
export function createAcanthus(config) {
  const c = { ...acanthusDefaults, ...config }
  const closed = Array.isArray(c.spine) ? false : !!c.spine.closed
  const given = Array.isArray(c.spine) ? c.spine : c.spine.points
  const path = walk(closed ? [...given, given[0]] : given)
  const strayAt = along(c.stray)
  const [b0, b1] = Array.isArray(c.body) ? c.body : [c.body, c.body]

  // a closed band's lobes reach back past its start and on past its end, so everything reads u round the loop
  const wrap = u => closed ? ((u % 1) + 1) % 1 : min(max(u, 0), 1)
  const at = (u, d) => path.offset(wrap(u), d)

  // how thick the body is, pinched to nothing over each end of an open band
  const taper = u => closed ? 1 : min(1, wrap(u) / c.pinch) ** 0.6 * min(1, (1 - wrap(u)) / c.pinch) ** 0.6
  const bodyAt = u => strayAt(wrap(u)) * (closed ? (b0 + b1) / 2 : b0 + (b1 - b0) * wrap(u)) * taper(u)

  // where the lobes spring: marched along by how far the band strays, then stretched to land the last one on the end
  // (or, around a ring, one gap short of the first)
  // lobes that alternate put two of them in every same-side spacing
  const sides = c.side === 'alternate' ? 2 : 1
  const start = closed ? 0 : c.from
  const span = (closed ? 1 : c.to) - start
  const gaps = []
  for (let u = start, total = 0; total < span && gaps.length < c.maxLobes; ) {
    const gap = max(c.spacing * strayAt(u) / (sides * path.length), 1e-4)
    gaps.push(gap)
    total += gap
    u = start + min(total, span)
  }
  const stretch = span / gaps.reduce((t, g) => t + g, 0)
  const positions = gaps.reduce((out, gap) => [...out, last(out) + gap * stretch], [start])
  if (closed) positions.pop()

  const count = positions.length
  const sideAt = i => c.side === 'alternate' ? (i % 2 ? -1 : 1) : c.side

  // how far the body has swung off the path at u: toward whichever lobe is springing there, easing from one to the
  // next. with the lobes alternating this is a wave, and it is what keeps a row of them from reading as a saw blade
  const swing = i => sideAt(i) * c.weave * strayAt(wrap(positions[i]))
  // eased from one value to the other between a and b, so the wave has no corners in it
  const ease = (u, a, b, from, to) =>
    from + (to - from) * (1 - cos(PI * min(max((u - a) / (b - a || 1), 0), 1))) / 2

  const weaveAt = u => {
    // with every lobe breaking the same way there is nothing to weave between: it would only shift the whole body
    // over to that side and take the room the lobes need to stand out in
    if (!c.weave || count < 2 || sides === 1) return 0
    const first = positions[0]
    const last_ = positions[count - 1]
    // an open band's ends swing back the other way past the outermost lobes
    if (!closed && u <= first) return ease(u, 0, first, -swing(0) * c.weaveEnds, swing(0))
    if (!closed && u >= last_) return ease(u, last_, 1, swing(count - 1), -swing(count - 1) * c.weaveEnds)
    // otherwise the two lobes u falls between, the last running on into the first again around a ring
    if (closed && u >= last_) return ease(u, last_, first + 1, swing(count - 1), swing(0))
    let j = 0
    while (j < count - 1 && positions[j + 1] <= u) j++
    return ease(u, positions[j], positions[j + 1], swing(j), swing(j + 1))
  }

  // every lobe: it leaves the body at its foot, sweeps out along a rib that curls over at the tip, and hooks back
  // into the body at its crook. the rib is sized so its furthest point reaches exactly `stray` off the path
  const lobes = positions.map((u, i) => {
    const r = createRandom(c.seed + i * 9781)
    const wobble = (v, amount=1) => v * (1 + r.rnd(-c.jitter, c.jitter) * amount)
    const gap = (i < count - 1 ? positions[i + 1] - u : span / max(count - 1, 1)) || 1e-3
    // the foot-to-crook span, as a share of the spacing between this lobe and the next on its own side, so two of
    // them never run into each other
    const half = 0.5 * min(wobble(c.lobeSpan, 0.3), 0.98) * sides * gap
    const side = sideAt(i)
    const reach = strayAt(u)
    // held clear of the pinched ends, where the body has no width left to spring off
    const u0 = closed ? u - half : max(u - half, c.pinch * 1.5)
    const u1 = closed ? u + half : min(u + half, 1 - c.pinch * 1.5)
    const foot = at(u0, weaveAt(u0) + side * bodyAt(u0))
    const crook = at(u1, weaveAt(u1) + side * bodyAt(u1))

    const shape = {
      origin: foot,
      angle: path.at(wrap(u0)).angle + side * rad(wobble(c.lobeSpring, 0.25)),
      sweep: -side * rad(wobble(c.lobeSweep, 0.18)),
      curl: wobble(c.lobeCurl, 0.25),
      samples: 30,
    }

    // the length that puts the rib's furthest point exactly `stray` off the path, which is what makes stray mean a
    // distance rather than a lobe size. only the rib's own reach past its foot grows with its length — where the
    // foot sits is fixed — so the two are measured apart and the foot's own offset taken off the distance to cover
    const { point: [bx, by], angle: pa } = path.at(wrap(u))
    const nx = -sin(pa) * side
    const ny = cos(pa) * side
    const offOf = ([x, y]) => (x - bx) * nx + (y - by) * ny
    const footOff = offOf(foot)
    const spread = max(...rib({ ...shape, length: 1 }).map(offOf)) - footOff
    const wanted = spread > 1e-3 ? max(reach - footOff, reach * 0.3) / spread : reach
    const length = min(wanted, c.lobeReach * (dist(...foot, ...crook) + reach))
    const curl = walk(rib({ ...shape, length }))

    return {
      u, u0, u1, side, reach, foot, crook, curl,
      tip: curl.at(1).point,
      // the underside bows back toward the body it came off, which leaves a crook rather than a corner
      inward: at(u, weaveAt(u) + side * bodyAt(u) * 0.5),
    }
  })

  const arc = (a, b, bulge) => arcSpine(a, b, bulge, 14).points

  // one side's edge: along the body until a lobe on that side springs, out around it, and back into the body behind
  // it. running it as one line is what makes the acanthus the vine instead of something tied onto one
  const edgeFor = side => {
    const mine = lobes.filter(l => l.side === side)
    if (!mine.length) return bodyRun(side, 0, 1)

    // a ring's edge starts where its first lobe folds back in and comes all the way round to it
    const list = closed
      ? [...mine.slice(1), { ...mine[0], u0: mine[0].u0 + 1, u1: mine[0].u1 + 1 }]
      : mine
    const points = []
    let cursor = closed ? mine[0].u1 : 0

    list.forEach(l => {
      points.push(...bodyRun(side, cursor, max(cursor, l.u0)))
      points.push(...l.curl.points)
      points.push(...arc(l.tip, l.crook, -sideOf(l.tip, l.crook, l.inward) * c.lobeFront))
      cursor = l.u1
    })
    if (!closed) points.push(...bodyRun(side, cursor, 1))
    return points
  }

  // the plain body between two lobes, sampled finely enough to stay smooth around a curved path
  function bodyRun(side, a, b) {
    if (b <= a + 1e-9) return []
    const steps = max(1, Math.ceil((b - a) * path.length / 1.2))
    return times(steps + 1, i => {
      const u = a + (b - a) * i / steps
      return at(u, weaveAt(u) + side * bodyAt(u))
    })
  }

  const left = edgeFor(1)
  const right = edgeFor(-1)
  // an open band's two edges close into one outline across its ends; a ring's are two loops
  const outline = closed
    ? [loop(left), loop(right)]
    : [loop([...left, ...right.slice().reverse()])]

  const trim = c.colorFn(-1, count)
  const strokes = [
    ...outline.map(s => ({ ...s, stroke: trim })),
    ...lobes.flatMap((l, i) => lobeMarks(c, l, at, u => weaveAt(u) + l.side * bodyAt(u), arc)
      .map(s => ({ ...s, stroke: c.colorFn(i, count) }))),
    ...voluteStrokes(c, path, closed, strayAt, lobes).map(s => ({ ...s, stroke: trim })),
  ]

  return { config: c, path, closed, lobes, strokes }
}

// What goes inside a lobe: the eye spiralled into its crook, and the single fold line up its middle. Two marks is
// all it takes to read as carved rather than cut out of paper
function lobeMarks(c, l, at, edgeAt, arc) {
  const marks = []

  if (c.eye) {
    const r = l.reach * c.eye
    const center = at(l.u1, edgeAt(l.u1) + l.side * r)
    marks.push(line(spiral({
      center,
      radius: r,
      angle: atan2(l.crook[1] - center[1], l.crook[0] - center[0]),
      turns: c.eyeTurns,
      direction: l.side,
    })))
  }

  // the fold runs up inside the lobe alongside its curl, held off the edge and stopping short of the tip
  if (c.fold) {
    const inset = l.reach * c.foldInset
    marks.push(line(times(21, i => {
      const v = 0.08 + (c.fold - 0.08) * i / 20
      return l.curl.offset(v, -l.side * inset * min(1, (1 - v) * 4))
    })))
  }

  return marks
}

// The spiral an open band winds up into where it runs out
function voluteStrokes(c, path, closed, strayAt, lobes) {
  if (!c.volute || closed || !lobes.length) return []
  const side = c.voluteSide === 'auto' ? -last(lobes).side : c.voluteSide
  const r = strayAt(1) * c.volute
  const { point: [x, y] } = path.at(1)
  const center = path.offset(1, side * r)
  return [line(spiral({
    center,
    radius: r,
    angle: atan2(y - center[1], x - center[0]),
    turns: c.voluteTurns,
    direction: side,
    samples: 96,
  }))]
}

// Draws a band's strokes, clipped to its clip, the same way drawRosette draws a rosette's
export function drawAcanthus(svg, { config: { clip, clipStep, strokeWidth, strokeOpacity }, strokes }) {
  strokes.forEach(({ points, closed, stroke }) => {
    const d = strokePath(points, { closed, clip, step: clipStep })
    if (d) svg.path(d, { stroke, strokeWidth, strokeOpacity })
  })
}
