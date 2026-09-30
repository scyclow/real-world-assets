import { TWO_PI, max, hypot, times, getXYRotation } from './utils.js'
import { generateGears } from './gears.js'

// A style turns a rosette into strokes: ctx => [{ points, closed, stroke }]. ctx (see styleContext in rosette.js)
// has the layer count, their sizes, ring() for points around a layer, color(t), the style's settings, and seeded
// randomness for anything picked piece by piece. Settings that are lengths are in layer spacings.
// These are rosette2.js's drawing strategies, numbered as they were there
export const styles = {
  // every layer as its own closed line (1, drawRibbedRosette)
  standard: ctx => ctx.layers.map(t => loop(ctx.ring({ t, spiral: true }), ctx.color(t))),

  // straight lines from the innermost layer out to the outermost (2)
  //   lines: how many
  // (with a single layer, there's nothing to run between)
  lines: ctx => ctx.single ? [] : rungs(
    ctx.ring({ t: 0, points: ctx.settings.lines }),
    ctx.ring({ t: ctx.count - 1, points: ctx.settings.lines }),
    ctx.color(0)
  ),

  // every layer, crossed by lines from the innermost out to the outermost (3)
  //   lines: how many
  grid: ctx => [
    ...styles.lines(ctx),
    ...ctx.layers.map(t => loop(ctx.ring({ t }), ctx.color(t))),
  ],

  // short arcs scattered all over (4)
  //   fragmentsPerLayer: how many arcs, per layer
  //   length: how far around each arc goes (0-1 of the way around)
  fragmented: ctx => {
    const { fragmentsPerLayer, length } = ctx.settings
    const { random } = ctx
    return times(Math.round(fragmentsPerLayer * (ctx.single ? 1 : ctx.count)), i => {
      // (all on the outermost, as a single layer)
      const size = ctx.single ? ctx.outer : random.rnd(ctx.minSize / 2, ctx.outer)
      return line(ctx.ring({ t: ctx.tAt(size), size, span: random.within(length), start: random.rnd() }), ctx.color(i))
    })
  },

  // lines spiraling from the innermost layer out to the outermost (5)
  //   spirals: how many
  //   turns: how many times each one goes around
  spiral: ctx => {
    // (with a single layer, there's nothing to run between)
    if (ctx.single) return []
    const { spirals, turns } = ctx.settings
    const { random } = ctx
    return times(spirals, i => {
      const start = random.rnd()
      const inner = ctx.ring({ t: 0, start })
      const outer = ctx.ring({ t: ctx.count - 1, start })
      const n = inner.length
      const total = Math.round(random.within(turns) * n)
      return line(times(total + 1, p => {
        const f = p / total
        const [ax, ay] = inner[p % n]
        const [bx, by] = outer[p % n]
        return [ax + (bx - ax) * f, ay + (by - ay) * f]
      }), ctx.color(i))
    })
  },

  // rings of scallops, with their points facing out (6)
  //   spacing: between the rings
  //   points, pointsPerLayer: points around the innermost ring, and how many more each ring out gets
  //   depth: how far in the scallops dip, as a fraction of the ring's size
  outwardSpikes: ctx => {
    const { spacing, points, pointsPerLayer, depth } = ctx.settings
    return curveRings(ctx, {
      sizes: ctx.sizesEvery(spacing),
      points,
      pointsPerLayer,
      period: 2,
      control: size => size * depth,
    })
  },

  // rings of bumps, with the points between them facing in (7)
  //   spacing, points, pointsPerLayer: as outwardSpikes
  //   bulge: how far out the bumps push
  //   floor: the closest a bump's control point gets to the center
  inwardSpikes: ctx => {
    const { spacing, points, pointsPerLayer, bulge, floor } = ctx.settings
    return curveRings(ctx, {
      sizes: ctx.sizesEvery(spacing),
      points,
      pointsPerLayer,
      period: 2,
      floor: floor * ctx.spacing,
      control: size => size + bulge * ctx.spacing,
    })
  },

  // rings of waves (8)
  //   spacing: between the rings
  //   points, pointsPerFourLayers, pointsPerLayer: points around the innermost ring (plus pointsPerFourLayers for
  //     every four rings the rosette has), and how many more each ring out gets. every wave takes four
  //   amplitude: how far the waves swing, in the rings' own spacing
  //   repeats: copies of each ring, spread across one wave
  //   floor: the closest a wave's control point gets to the center
  wavy: ctx => waves(ctx),

  // layers of woven waves (9), like the numismatic rosettes in fake-internet-money. each layer is several copies of a
  // ring whose points alternate between the whole ring (wiggles and all) a size smaller and a size bigger, each copy
  // shifted around from the last, joined by curves through the points. going in from the outermost layer, each one
  // sits as far in as it can while every one of its tops still reaches past the next layer out's lines, however the
  // copies line up
  //   amplitude: how far the outermost layer's points swing in and out, in size
  //   shrink: how much the swing shrinks going in (0 keeps it the same, 1 shrinks it in step with the layer's size)
  //   minAmplitude: the least it shrinks to
  //   overlap: how far past the next layer out's lines every top reaches, in size
  //   oscillations, oscillationsPerLayer: in and out swings around the outermost layer, and how many fewer each layer
  //     in gets
  //   minWavelength: the narrowest a swing gets, measured around its ring. layers too small for their oscillations get
  //     fewer swings instead, which (along with minAmplitude) keeps the middle from filling in with ink
  //   evenSwings: keeps every layer's swings even, which a rosette mirrored top to bottom (see oddRotations in
  //     gears.js) needs to stay that way
  //   repeats: copies of the ring in each layer
  //   spread: how much of one swing the copies are spread across (1 spreads them evenly)
  //   curve: how curved the lines between points are, from 0 (straight) to 1 (smooth curves through every point, like
  //     p5's curveVertex). they pass through the points either way, so the tops stay exactly where they're sized
  //   floor: how close to the center the layers get, in size. any layer that would swing in past it is left out (a
  //     rosette too small for even its outermost layer keeps that one, swung in no further than floor)
  numismatic: ctx => {
    const { amplitude, shrink, minAmplitude, overlap, oscillations, oscillationsPerLayer, minWavelength=0, evenSwings=false, repeats, spread, curve, floor } = ctx.settings
    const { min, cos, PI } = Math
    const unit = ctx.spacing

    // how far a layer of a given size swings in and out, and the size of the layer whose tops reach a given size
    const swingAt = size => max(minAmplitude * unit, amplitude * unit * (1 - shrink + shrink * size / ctx.outer))
    const sizeReaching = top => {
      const a = amplitude * unit * (1 - shrink)
      const b = amplitude * unit * shrink / ctx.outer
      const size = (top - a) / (1 + b)
      return a + b * size >= minAmplitude * unit ? size : top - minAmplitude * unit
    }

    // how many times layer k (counting in from the outermost) swings in and out at a given size: oscillations (fewer
    // going in), but no more than fit around its ring minWavelength apart (and rounded down to even, with evenSwings)
    const swingsAt = (size, k) => {
      const ring = ctx.ring({ t: ctx.tAt(size), size })
      const around = ring.reduce((sum, [x, y], i) => {
        const [nx, ny] = ring[(i + 1) % ring.length]
        return sum + hypot(nx - x, ny - y)
      }, 0)
      const swings = max(2, min(Math.round(oscillations - k * oscillationsPerLayer), Math.floor(around / (minWavelength * unit))))
      return evenSwings ? swings - swings % 2 : swings
    }

    // where each copy of a layer with n swings starts (0-1 of the way around). every swing takes two points: one in
    // (even), then one out (odd)
    const startsFor = n => times(repeats, r => r / repeats * spread / n)

    // how far a layer's lowest line is swung at progress p (0-1 around), from -1 (all the way in) to 1 (all the way
    // out). straight lines swing evenly between points; curves ease in and out of them
    const lowestSwing = ({ n }, p) => min(...startsFor(n).map(start => {
      const u = ((((p - start) * 2 * n) % 2) + 2) % 2
      const fromIn = min(u, 2 - u)
      return (1 - curve) * (2 * fromIn - 1) - curve * cos(PI * fromIn)
    }))

    // the size of a layer with n swings inside outer: as far in as it can go with every one of its tops reaching
    // overlap past outer's lowest line at the same point around. the rings' gears go by their own size, so at the same
    // point around, a bigger size is always farther out. with one copy (or copies bunched together) some tops land on
    // the outer layer's tops, so those only reach past its middle
    const sizeInside = (outer, n) => {
      const worst = max(...startsFor(n).flatMap(start => times(n, j => lowestSwing(outer, start + (j + 0.5) / n))))
      return min(sizeReaching(outer.size + swingAt(outer.size) * min(worst, 0) + overlap * unit), outer.size - unit / 10)
    }

    // layer k + 1, the next one in from outer. how many swings it gets depends on its size, which depends on where its
    // tops land, so the two get settled together (its size always goes with the swings it's drawn with)
    const nextIn = (outer, k) => {
      let n = swingsAt(outer.size, k + 1)
      let size = sizeInside(outer, n)
      for (let tries = 0; tries < 3 && swingsAt(size, k + 1) !== n; tries++) {
        n = swingsAt(size, k + 1)
        size = sizeInside(outer, n)
      }
      return { size, n }
    }

    // the outermost layer's tops reach the outermost layer's size, and the layers go in from there as long as they
    // don't swing in past floor
    const first = sizeReaching(ctx.outer)
    const layers = [{ size: first, n: swingsAt(first, 0) }]
    // (just the outermost, as a single layer)
    while (!ctx.single && layers.length < 100) {
      const next = nextIn(layers.at(-1), layers.length - 1)
      if (next.size - swingAt(next.size) < floor * unit) break
      layers.push(next)
    }

    return layers.flatMap(({ size, n }, k) => startsFor(n).map(start => {
      const swing = swingAt(size)
      const ringAt = s => ctx.ring({ t: ctx.tAt(s), size: s, points: 2 * n, start })
      const ins = ringAt(max(floor * unit, size - swing))
      const outs = ringAt(size + swing)
      const swung = ins.length && outs.length ? outs.map((p, j) => j % 2 ? p : ins[j]) : []
      // curving, every point swings out (or in) from the layer's own line only as far as the curve amplitude says there
      const points = ctx.curving && swung.length ? curved(ctx, ringAt(size), swung, j => start + j / (2 * n)) : swung
      return loop(curveLoop(points, curve, ctx.step), ctx.color(layers.length - 1 - k))
    }))
  },

  // shapes at points around every layer (10)
  //   shape: 'circle', 'square', or 'rosette' (a tiny one with its own gears)
  //   radius: of the circles and squares, times pointMult
  //   points, pointsPerLayer: shapes around the innermost layer, and how many more each layer out gets, divided by
  //     pointMult
  //   pointMult: spreads the shapes out and grows them
  //   symbolRadius, symbolGears: the tiny rosettes' size, and generateGears options for them
  circles: ctx => shapes(ctx),

  // circles, with pointMult picked for each layer (11)
  heterocircles: ctx => shapes(ctx),

  // layers in pairs joined by lines, like ribbons (12)
  //   lines: how many join the outermost pair
  //   minFraction: the fraction of that joining the innermost pair, growing going out
  ribbons: ctx => {
    const { lines, minFraction } = ctx.settings
    return ctx.layers.map(t => {
      const stroke = ctx.color(t - t % 2)
      const ring = loop(ctx.ring({ t }), stroke)
      if (t % 2 === 0 || ctx.single) return [ring]
      const n = lines * (minFraction + (1 - minFraction) * t / max(ctx.count - 1, 1))
      return [...rungs(ctx.ring({ t: t - 1, points: n }), ctx.ring({ t, points: n }), stroke), ring]
    }).flat()
  },

  // dashed layers, with every other gap between them bridged into blocks (13)
  //   points: the dashes and gaps around each layer
  blocks: ctx => {
    const rings = times(ctx.count, t => ctx.ring({ t, points: ctx.settings.points }))
    return ctx.layers.flatMap(t => [
      ...dashes(rings[t], ctx.color(t)),
      ...(t % 2 && !ctx.single ? rungs(rings[t], rings[t - 1], ctx.color(t)) : []),
    ])
  },

  // dashed layers (14)
  //   points, pointsPerLayer: the dashes and gaps around the innermost layer, and how many more each layer out gets
  dashed: ctx => {
    const { points, pointsPerLayer } = ctx.settings
    return ctx.layers.map(t => dashes(ctx.ring({ t, points: points + t * pointsPerLayer }), ctx.color(t))).flat()
  },

  // waves, with circles along the layers in between (15)
  //   the wavy settings, plus
  //   circlePoints, circlesPerLayer: circles around the innermost layer, and how many more each layer out gets
  //   radius: of the circles
  //   skipOuter: how many of the outer layers go without
  mixed: ctx => {
    const { circlePoints, circlesPerLayer, radius, skipOuter } = ctx.settings
    return [
      ...waves(ctx),
      ...ctx.layers.filter(t => t < ctx.count - skipOuter).map(t => ctx.ring({ t, points: circlePoints + t * circlesPerLayer })
        .map(p => loop(circle(p, radius * ctx.spacing), ctx.color(t)))).flat(),
    ]
  },

  // waves, with a plain ring every few layers (16)
  //   the wavy settings, plus
  //   ringEvery: how many layers apart the rings are
  wavyRibbons: ctx => [
    ...waves(ctx),
    ...ctx.layers.map(t => t % ctx.settings.ringEvery ? [] : [loop(ctx.ring({ t }), ctx.color(t))]).flat(),
  ],

  // a short horizontal line at points around every layer (17)
  //   points, pointsPerLayer: lines around the innermost layer, and how many more each layer out gets
  //   length: of each line
  horizontalDashes: ctx => {
    const { points, pointsPerLayer, length } = ctx.settings
    const half = length * ctx.spacing / 2
    return ctx.layers.map(t => ctx.ring({ t, points: points + t * pointsPerLayer })
      .map(([x, y]) => line([[x - half, y], [x + half, y]], ctx.color(t)))).flat()
  },


  // ---------------------------------------------------------------------------------------------------- experimental

  // every layer twice, the second with every gear moved on by shift of one of its swings, so the two interfere (half
  // a swing keeps the rosette's symmetry)
  //   shift: how far on, in swings
  moire: ctx => {
    const shifted = ctx.gears.map(g => ({ ...g, phase: g.phase + ctx.settings.shift / max(1, Math.abs(g.rotation)) }))
    return ctx.layers.map(t => [
      loop(ctx.ring({ t }), ctx.color(t)),
      loop(ctx.ring({ t, gears: shifted }), ctx.color(t)),
    ]).flat()
  },

  // every layer as a zigzag, its points alternating between the layer and a little inside it
  //   points, pointsPerLayer: points around the innermost layer, and how many more each layer out gets
  //   depth: how far in the inner points sit, in spacings
  zigzag: ctx => {
    const { points, pointsPerLayer, depth } = ctx.settings
    return ctx.layers.map(t => {
      const n = max(4, 2 * Math.round((points + t * pointsPerLayer) / 2))
      const deep = depth * ctx.spacing / ctx.sizes[t]
      return loop(ctx.ring({ t, points: n, baseScale: i => i % 2 ? 1 : max(0, 1 - deep * ctx.curveAt(i / n)) }), ctx.color(t))
    })
  },

  // a net of diagonal lines, each point on a layer joined to the points either side of it on the next layer out
  //   lines: points around every layer
  lattice: ctx => {
    // (with a single layer, there's nothing to run between)
    if (ctx.single) return []
    const rings = ctx.layers.map(t => ctx.ring({ t, points: ctx.settings.lines }))
    return rings.slice(0, -1).flatMap((inner, t) => {
      const outer = rings[t + 1]
      const n = outer.length
      return inner.flatMap((p, i) => [
        line([p, outer[(i + 1) % n]], ctx.color(t)),
        line([p, outer[(i - 1 + n) % n]], ctx.color(t)),
      ])
    })
  },

  // short marks across every layer, pointing out from the center, like a dial's markings
  //   points, pointsPerLayer: marks around the innermost layer, and how many more each layer out gets
  //   length: of each mark, in spacings
  ticks: ctx => {
    const { points, pointsPerLayer, length } = ctx.settings
    const half = length * ctx.spacing / 2
    return ctx.layers.map(t => {
      const n = Math.round(points + t * pointsPerLayer)
      const size = ctx.sizes[t]
      const inner = ctx.ring({ t, size: max(size / 10, size - half), points: n })
      const outer = ctx.ring({ t, size: size + half, points: n })
      if (!ctx.curving) return rungs(inner, outer, ctx.color(t))
      // curving, every mark reaches either side of the layer only as far as the curve amplitude says there
      const middle = ctx.ring({ t, points: n })
      return rungs(curved(ctx, middle, inner, i => i / n), curved(ctx, middle, outer, i => i / n), ctx.color(t))
    }).flat()
  },

  // every layer as a run of little curls, from a small fast gear of its own riding on the rest
  //   wavelength: how far apart the curls are, around the layer, in spacings
  //   radius: how big they are, in spacings
  loops: ctx => {
    const { wavelength, radius } = ctx.settings
    return ctx.layers.map(t => {
      const size = ctx.sizes[t]
      const curls = max(3, Math.round(TWO_PI * size / (wavelength * ctx.spacing)))
      const curl = { rotation: curls, radia: radius * ctx.spacing / size, phase: 0 }
      const points = max(900, curls * 16)
      const curled = ctx.ring({ t, points, gears: [...ctx.gears, curl] })
      // curving, every curl's as big as the curve amplitude says there
      return loop(ctx.curving ? curved(ctx, ctx.ring({ t, points }), curled, i => i / points) : curled, ctx.color(t))
    })
  },

  // every layer as two lines close together
  //   gap: between them, in spacings
  doubled: ctx => ctx.layers.map(t => [-1, 1].map(side =>
    loop(ctx.ring({ t, size: max(0.01, ctx.sizes[t] + side * ctx.settings.gap * ctx.spacing / 2) }), ctx.color(t))
  )).flat(),

  // one line winding out from the innermost layer to the outermost, a turn per layer
  //   points: around each turn
  coil: ctx => {
    // (with a single layer, there's nothing to run between)
    if (ctx.single) return []
    const n = ctx.settings.points
    const rings = ctx.layers.map(t => ctx.ring({ t, points: n }))
    return rings.slice(0, -1).map((inner, t) => {
      const outer = rings[t + 1]
      return line([...inner.map(([x, y], i) => [x + (outer[i][0] - x) * i / n, y + (outer[i][1] - y) * i / n]), outer[0]], ctx.color(t))
    })
  },
}

// Radial density: how much a style draws going around the center, as opposed to density (how close its layers are,
// going out from it). For each style, the settings that count something around each layer (as a power: 1 goes up
// with radial density, -1 goes down) -- lines and spokes, waves and swings, bumps, dashes, shapes, arcs, spiral arms.
// standard is plain rings, with nothing to count around them, so radial density leaves it be (and so
// are moire, doubled, and coil, however they're drawn)
const waveCounts = { points: 1, pointsPerFourLayers: 1, pointsPerLayer: 1 }
export const radialCounts = {
  lines: { lines: 1 },
  grid: { lines: 1 },
  fragmented: { fragmentsPerLayer: 1 },
  spiral: { spirals: 1 },
  outwardSpikes: { points: 1, pointsPerLayer: 1 },
  inwardSpikes: { points: 1, pointsPerLayer: 1 },
  wavy: waveCounts,
  wavyRibbons: waveCounts,
  mixed: { ...waveCounts, circlePoints: 1, circlesPerLayer: 1 },
  // the swings, and how many fewer each layer in gets. the narrowest a swing can get shrinks as they go up, so they
  // aren't capped where they were
  numismatic: { oscillations: 1, oscillationsPerLayer: 1, minWavelength: -1 },
  circles: { points: 1, pointsPerLayer: 1 },
  heterocircles: { points: 1, pointsPerLayer: 1 },
  ribbons: { lines: 1 },
  blocks: { points: 1 },
  dashed: { points: 1, pointsPerLayer: 1 },
  horizontalDashes: { points: 1, pointsPerLayer: 1 },
  zigzag: { points: 1, pointsPerLayer: 1 },
  lattice: { lines: 1 },
  ticks: { points: 1, pointsPerLayer: 1 },
  loops: { wavelength: -1 },
}

// Wave amplitude: how high a style's waves swing, its bumps and spikes stick out, and so on. For each style, how each
// setting that sets a height changes with it (a: 1 leaves it as it is, 2 swings twice as far, 0 flattens it). outward
// spikes dip in to depth of their size, so it's how far short of 1 that is that grows. styles with nothing that swings
// are left be
const scaled = (value, a) => value * a
const waveHeights = {
  numismatic: { amplitude: scaled, minAmplitude: scaled },
  wavy: { amplitude: scaled },
  wavyRibbons: { amplitude: scaled },
  mixed: { amplitude: scaled },
  inwardSpikes: { bulge: scaled },
  outwardSpikes: { depth: (depth, a) => Math.max(0, 1 - (1 - depth) * a) },
  zigzag: { depth: scaled },
  loops: { radius: scaled },
  ticks: { length: scaled },
}

// A style's settings at a wave amplitude (1 leaves them as they are)
export function atWaveAmplitude(style, settings, waveAmplitude=1) {
  if (waveAmplitude === 1 || !waveHeights[style]) return settings
  const changed = { ...settings }
  for (const [key, change] of Object.entries(waveHeights[style])) {
    if (typeof changed[key] === 'number') changed[key] = change(changed[key], waveAmplitude)
  }
  return changed
}

// A style's settings at a radial density (1 leaves them as they are). the spirals are whole ones, and at least one
export function atRadialDensity(style, settings, radialDensity=1) {
  if (radialDensity === 1 || !radialCounts[style]) return settings
  const scaled = { ...settings }
  for (const [key, power] of Object.entries(radialCounts[style])) {
    if (typeof scaled[key] === 'number') scaled[key] *= radialDensity ** power
  }
  if (style === 'spiral') scaled.spirals = max(1, Math.round(scaled.spirals))
  return scaled
}

// Lines out through the outer layers, between two rings on every gear's radia shifted down by radiaShift (the base
// gear's too, in rosette2.js's units), which turns the wiggles inside out. Any style can have one
//   from, to: where the lines start and end, as fractions of the outermost layer's size
//   lines: how many
export function auraStrokes(ctx, { from, to, lines, radiaShift }) {
  // rosette2.js's radia are fractions of all the gears' radia together, base gear included
  const shift = radiaShift * (1 + ctx.gears.reduce((sum, g) => sum + g.radia, 0))
  const gears = ctx.gears.map(g => ({ ...g, radia: g.radia - shift }))
  const ringAt = f => ctx.ring({ t: ctx.count - 1, size: ctx.outer * f, points: lines, gears, baseScale: () => 1 - shift })
  return rungs(ringAt(from), ringAt(to), ctx.color(0))
}

const loop = (points, stroke) => ({ points, closed: true, stroke })

// points reaching as far off the layer's own line as the curve amplitude says (see curveAt in rosette.js): each as far
// from its match on the line (plain, matched point for point) as it'd be, times the curve amplitude progressOf(i) of the
// way around
const curved = (ctx, plain, points, progressOf) => points.map(([x, y], i) => {
  const [px, py] = plain[i] ?? [x, y]
  const reach = ctx.curveAt(progressOf(i))
  return [px + (x - px) * reach, py + (y - py) * reach]
})
const line = (points, stroke) => ({ points, closed: false, stroke })

// lines from each of from's points to the matching one of to's
const rungs = (from, to, stroke) => from.map((p, i) => line([p, to[i]], stroke))

// every other segment of a loop, each on its own
const dashes = (points, stroke) => points.flatMap((p, i) => i % 2 === 0 && i + 1 < points.length ? [line([p, points[i + 1]], stroke)] : [])

const circle = ([x, y], r, sides=24) => times(sides, i => getXYRotation(TWO_PI * i / sides, r, x, y))

const square = ([x, y], r) => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]

// a rosette of radius r around [x, y], on a circular base gear, like rosette2.js's
function tinyRosette([x, y], r, gears, points=120) {
  const total = 1 + gears.reduce((sum, g) => sum + g.radia, 0)
  return times(points, i => gears.reduce(
    ([px, py], g) => getXYRotation((i / points + g.phase) * g.rotation * TWO_PI, r * g.radia / total, px, py),
    getXYRotation(TWO_PI * i / points, r / total, x, y)
  ))
}

// (every layer's shapes are made, even with a single layer, so its random picks come out as they would with the rest,
// and just the ones it draws are kept)
function shapes(ctx) {
  const { shape, radius, points, pointsPerLayer, pointMult, symbolRadius, symbolGears } = ctx.settings
  return times(ctx.count, t => {
    const mult = ctx.random.within(pointMult)
    const r = radius * mult * ctx.spacing
    return ctx.ring({ t, points: (points + t * pointsPerLayer) / mult }).map(p => loop(
      shape === 'square' ? square(p, r)
        : shape === 'rosette' ? tinyRosette(p, symbolRadius * ctx.spacing, generateGears(symbolGears, ctx.random))
        : circle(p, r),
      ctx.color(t)
    ))
  }).filter((_, t) => ctx.layers.includes(t)).flat()
}

function waves(ctx) {
  const { spacing, points, pointsPerFourLayers, pointsPerLayer, amplitude, repeats, floor } = ctx.settings
  const sizes = ctx.sizesEvery(spacing)
  const swing = amplitude * spacing * ctx.spacing
  return curveRings(ctx, {
    sizes,
    points: points + pointsPerFourLayers * Math.floor(sizes.length / 4),
    pointsPerLayer,
    period: 4,
    repeats,
    floor: floor * ctx.spacing,
    // the control points alternate between swinging in and out
    control: (size, p) => p % 4 ? size + swing : size - swing,
  })
}

// Rings of quadratic curves, one per size: the points around each one alternate between control points (even) and
// points on the curve (odd), and control(size, i) says how far a control point is from the center, which bows the
// curve in or out between the points on either side, as far as the curve amplitude says there (see curveAt in rosette.js). period
// is how many points the pattern takes to repeat, and repeats copies of each ring are spread across one period
function curveRings(ctx, { sizes, points, pointsPerLayer, period, repeats=1, control, floor=0 }) {
  return sizes.flatMap((size, i) => {
    // (with a single layer, just the outermost)
    if (ctx.single && i < sizes.length - 1) return []
    const n = max(period, Math.round((points + i * pointsPerLayer) / period) * period)
    return times(repeats, r => {
      const start = r / repeats * period / n
      // each control point bows the curve out (or in) from the ring as far as the curve amplitude says there
      const baseScale = p => p % 2 ? 1 : max(floor, size + (control(size, p) - size) * ctx.curveAt(start + p / n)) / size
      return loop(quadraticLoop(ctx.ring({ t: ctx.tAt(size), size, points: n, start, baseScale })), ctx.color(i))
    })
  })
}

// A closed loop through every one of points, as cubic curves flattened into short lines no longer than about step.
// curve 1 gives each point catmull-rom's tangent (toward the next point from the one before it, like p5's
// curveVertex); smaller shrinks the tangents down to 0, which gives straight lines
function curveLoop(points, curve, step=0.5) {
  if (!curve || points.length < 3) return points
  const n = points.length
  return points.flatMap(([x1, y1], i) => {
    const [x0, y0] = points[(i - 1 + n) % n]
    const [x2, y2] = points[(i + 1) % n]
    const [x3, y3] = points[(i + 2) % n]
    // the control points of the cubic from this point to the next
    const [ax, ay] = [x1 + curve * (x2 - x0) / 6, y1 + curve * (y2 - y0) / 6]
    const [bx, by] = [x2 - curve * (x3 - x1) / 6, y2 - curve * (y3 - y1) / 6]
    // the curve is never longer than the lines through its control points
    const length = hypot(ax - x1, ay - y1) + hypot(bx - ax, by - ay) + hypot(x2 - bx, y2 - by)
    const steps = max(2, Math.ceil(length / step))
    return times(steps, s => {
      const t = s / steps
      const u = 1 - t
      return [
        u ** 3 * x1 + 3 * u ** 2 * t * ax + 3 * u * t ** 2 * bx + t ** 3 * x2,
        u ** 3 * y1 + 3 * u ** 2 * t * ay + 3 * u * t ** 2 * by + t ** 3 * y2,
      ]
    })
  })
}

// A closed loop through points that alternate between control points (even) and points on the curve (odd), as
// quadratic curves flattened into steps short lines each
function quadraticLoop(points, steps=8) {
  const n = points.length - points.length % 2
  const out = []
  for (let i = 0; i < n; i += 2) {
    const [ax, ay] = points[(i - 1 + n) % n]
    const [cx, cy] = points[i]
    const [bx, by] = points[i + 1]
    for (let s = 0; s < steps; s++) {
      const f = s / steps
      out.push([
        (1 - f) ** 2 * ax + 2 * (1 - f) * f * cx + f ** 2 * bx,
        (1 - f) ** 2 * ay + 2 * (1 - f) * f * cy + f ** 2 * by,
      ])
    }
  }
  return out
}
