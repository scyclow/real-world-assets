import { PI, TWO_PI, hypot, max, times, getXYRotation, rotate, createRandom } from './utils.js'
import { pen } from './colors.js'
import { radialBase } from './bases.js'
import { shiftRadia, withSymmetry, withStarts } from './gears.js'
import { radialEnvelope } from './sdf.js'
import { densify, strokePath } from './clip.js'
import { styles, auraStrokes, atRadialDensity, atWaveAmplitude } from './styles.js'
import { noise3 } from './noise.js'

// the most layers a rosette can have, so the layer-fitting strategies always stop: enough that even a big one drawn
// dense reaches its outline (a 100mm radius at 0.1mm apart)
export const MAX_LAYERS = 1000

export const rosetteDefaults = {
  center: [0, 0],
  // the broad shape (see bases.js)
  base: radialBase(),
  // how the layers get drawn (see styles.js), and that style's settings with anything random already picked
  style: 'standard',
  styleSettings: {},
  // seeds the random choices a style makes as it draws, so it draws the same thing every time
  seed: 0,
  // what rides on the base gear (see gears.js)
  gears: [],
  // how it's mirrored: 'both', 'vertical' (left to right), 'horizontal' (top to bottom), 'none', or null to leave its
  // gears as they were rolled (see withSymmetry in gears.js)
  symmetry: null,
  // where its gears start: 'fixed' (as they were rolled) or 'even' (each a half turn in, or not; see withStarts)
  starts: 'fixed',
  // how much the style draws going around the center: 1 as its settings say, 2 twice as much (see radialCounts in
  // styles.js)
  radialDensity: 1,
  // how high its style's waves, bumps, and spikes go: 1 as its settings say, 2 twice as high (see waveHeights in
  // styles.js)
  waveAmplitude: 1,
  // how much radial Perlin noise pushes its layers in and out (as a fraction of their size: 0 for none, see noiseAt)
  noise: 0,
  // how its noise is mirrored: 'rosette' as the rosette is (its symmetry), or 'none', 'vertical', 'horizontal', or
  // 'both' (see noiseAt)
  noiseSymmetry: 'rosette',
  // and its noise's other settings: how quickly it changes going out from layer to layer, how far around the noise
  // each layer goes (how big a circle it's read around: the further, the less smooth), and which patch of it (see
  // noiseAt)
  noiseDepth: 1.6,
  noiseDetail: 1.4,
  noiseSeed: 0,
  // how far its style's curves reach going around it: hz times all the way around, from as far as they'd reach to
  // amplitude times that and back (see curveAt). hz 0 leaves them be
  curveAmplitude: 1,
  curveHz: 0,
  // null to draw it around its center, or (point, progress) => where on the canvas to draw point instead, point being
  // relative to its center and progress how far around its layer (0-1) it is. for drawing it along another path
  project: null,
  // just the outermost layer (drawn in its style exactly as it'd be with the rest inside it), or every layer, filling
  // it in
  singleLayer: false,
  // how many layers: a count, or a strategy that picks one (fitWithin, fillPast)
  layers: 10,
  // the innermost layer's size, and how much each layer grows over the last (see bases.js for what size means).
  // styles measure their own sizes in spacings
  minSize: 4,
  spacing: 4,
  // null for evenly spaced layers, or a list of 0-1 values that scatter them between the innermost and outermost
  spacingPattern: null,
  // how much every gear's radia shifts from the innermost layer to the outermost
  radiaChange: 0,
  // (gears, t, count) => the gears for layer t, for anything radiaChange doesn't cover
  gearModifier: null,
  // t => degrees layer t is turned (standard style only)
  spiral: () => 0,
  // (t, count) => the stroke for layer (or piece) t
  colorFn: () => pen.black,
  // an extra pass of the same rosette nudged over by shadowOffset spacings: { direction: [±1, ±1], stroke }
  shadow: false,
  shadowOffset: 1 / 6,
  // an extra pass with another set of gears: { gears, stroke }
  multiple: false,
  // lines out through the outer layers on rings with wilder gears (see auraStrokes in styles.js)
  aura: false,
  // a signed distance function (see sdf.js). strokes stop where they leave it and pick back up where they come back in
  clip: null,
  // strokes get cut into pieces no longer than this before clipping, so none skip over the clip's edge
  clipStep: 0.5,
  // points around each layer
  pointCount: 1200,
  strokeWidth: 1,
  strokeOpacity: 1,
}

// Builds a rosette from its config (see rosetteDefaults). Returns the resolved config, the number of layers it ended
// up with, everything its style draws as strokes: { points, closed, stroke }, and its outline (its outermost layer,
// whether its style draws it or not: a closed loop of points for each pass), all in canvas coordinates
export function createRosette(config) {
  // what was once the single style is the standard one, a single layer
  const given = { ...rosetteDefaults, ...config, ...(config.style === 'single' ? { style: 'standard', singleLayer: true } : {}) }
  // its style's settings at its radial density and wave amplitude, and its gears (a second set's too) mirrored as its symmetry says and
  // started as its starts say, after which they're all as good as done (so its config can build it again as is)
  const mirrored = gears => withStarts(withSymmetry(gears, given.symmetry, createRandom(given.seed + 7919)), given.starts, createRandom(given.seed + 7927))
  const r = {
    ...given,
    styleSettings: atWaveAmplitude(given.style, atRadialDensity(given.style, given.styleSettings, given.radialDensity), given.waveAmplitude),
    radialDensity: 1,
    waveAmplitude: 1,
    gears: mirrored(given.gears),
    multiple: given.multiple && { ...given.multiple, gears: mirrored(given.multiple.gears) },
    symmetry: null,
    starts: 'fixed',
    // what its noise and curves follow, so they're mirrored the same way its gears are
    mirror: given.symmetry ?? given.mirror ?? null,
  }
  const draw = styles[r.style]
  if (!draw) throw new Error(`unknown style: ${r.style}`)
  const passes = rosettePasses(r)

  // the outermost layer of each pass, for a rosette with count layers
  const outermost = count => {
    if (count < 1) return []
    const sizes = layerSizes(r, count)
    return passes.map(pass => styleContext(r, pass, count, sizes).ring({ t: count - 1 }))
  }

  // everything the style draws for a rosette with count layers
  const strokes = count => {
    if (count < 1) return []
    const sizes = layerSizes(r, count)
    return passes
      .flatMap(pass => {
        const ctx = styleContext(r, pass, count, sizes)
        return [...draw(ctx), ...(pass.index === 0 && r.aura ? auraStrokes(ctx, r.aura) : [])]
      })
      // anything that goes nowhere (a line from a layer to itself, when there's only the one) is left out, rather
      // than drawn as a dot
      .filter(({ points }) => points.length > 1 && points.some(([x, y]) => Math.abs(x - points[0][0]) + Math.abs(y - points[0][1]) > 1e-6))
  }

  const count = typeof r.layers === 'function' ? r.layers({ outermost, strokes }, r) : r.layers
  return { config: r, count, strokes: strokes(count), outline: outermost(count) }
}

// Draws a rosette's strokes, clipped to its clip. Anything clipped away entirely is skipped. widthOf (stroke => pen
// width) gives each pen its own width, where it has one (the rosette's strokeWidth otherwise)
export function drawRosette(svg, { config: { clip, clipStep, strokeWidth, strokeOpacity }, strokes }, widthOf=null) {
  strokes.forEach(({ points, closed, stroke }) => {
    const d = strokePath(points, { closed, clip, step: clipStep })
    if (d) svg.path(d, { stroke, strokeWidth: widthOf?.(stroke) ?? strokeWidth, strokeOpacity })
  })
}

// Everything within reach of a rosette's ink, or inside its outline (see createRosette), with any curls filled in,
// grown by grow, as a signed distance function. For clipping other rosettes around it: whatever it clips stops at its
// outline, rather than fitting in between its lines (the spokes of a lines rosette, say)
export const rosetteSdf = (rosette, grow=0) => rosetteEnvelope(rosette).at(rosette.config.center, grow)

// The same, before it's placed: at(center, grow) is rosetteSdf's shape for a rosette drawn just like this one around
// center. Building it is the slow part, so rosettes that only differ in where they are can share one
export function rosetteEnvelope({ config: { center: [cx, cy], clipStep }, strokes, outline=[] }) {
  const points = [...strokes, ...outline.map(points => ({ points, closed: true }))]
    .flatMap(({ points, closed }) => densify(points, clipStep, closed).map(([x, y]) => [x - cx, y - cy]))
  const envelope = radialEnvelope(points)
  const farthest = points.reduce((far, [x, y]) => max(far, hypot(x, y)), 0)
  return {
    at: (center, grow=0) => {
      const sdf = envelope.sdf(center, grow)
      // how far it reaches from its center, so a union of many (boundedUnionSdf) can skip the ones too far away
      sdf.bounds = { center, reach: farthest + grow }
      return sdf
    },
  }
}

// Layer strategy: as many layers as fit within radius of the center, everything the style draws (and the pen
// width) included
export const fitWithin = radius => ({ outermost, strokes }, { center: [cx, cy], strokeWidth }) => {
  const fits = points => points.length && points.every(([x, y]) => hypot(x - cx, y - cy) + strokeWidth / 2 <= radius)
  let count = 1
  // grow while the outermost layer fits, then back off until whatever the style draws around it fits too
  while (count < MAX_LAYERS && outermost(count + 1).every(fits)) count++
  while (count > 0 && !strokes(count).every(({ points }) => fits(points))) count--
  return count
}

// Layer strategy: as many layers as fit inside shape (a signed distance function), everything the style draws (and
// the pen width) included. fitWithin for shapes other than circles
export const fitInside = shape => ({ outermost, strokes }, { strokeWidth }) => {
  const fits = points => points.length && points.every(([x, y]) => shape(x, y) + strokeWidth / 2 <= 0)
  let count = 1
  while (count < MAX_LAYERS && outermost(count + 1).every(fits)) count++
  while (count > 0 && !strokes(count).every(({ points }) => fits(points))) count--
  return count
}

// Layer strategy: just enough layers that the outermost lies entirely outside clip (a signed distance function), so
// the rosette fills it all the way out to its edges
export const fillPast = clip => ({ outermost }) => {
  const outside = points => points.length && points.every(([x, y]) => clip(x, y) > 0)
  for (let count = 1; count < MAX_LAYERS; count++) {
    if (outermost(count).every(outside)) return count
  }
  return MAX_LAYERS
}

// The main pass, plus a shadow and a second set of gears if the rosette has them
function rosettePasses({ gears, colorFn, shadow, shadowOffset, multiple, spacing }) {
  return [
    { gears, offset: [0, 0], colorFn },
    shadow && { gears, offset: shadow.direction.map(d => d * shadowOffset * spacing), colorFn: () => shadow.stroke },
    multiple && { gears: multiple.gears, offset: [0, 0], colorFn: () => multiple.stroke },
  ].filter(Boolean).map((pass, index) => ({ ...pass, index }))
}

function layerSizes({ minSize, spacing, spacingPattern }, count) {
  if (!spacingPattern) return times(count, t => minSize + t * spacing)
  return times(count, t => minSize + spacingPattern[t % spacingPattern.length] * (count - 1) * spacing)
    .sort((a, b) => a - b)
}

// Radial noise: how far (as a fraction of its distance from the center) a point progress (0-1) of the way around a
// layer is pushed out, or in, below 0. It's Perlin noise sampled around a circle, so a layer ends where it started,
// and going out along the log of the layer's size (z), so every layer is pushed about as much as the ones either side
// of it, relative to its size, whatever size they are: the layers stay nested, and read as one shape bent out of true.
// mirrored (as the rosette's symmetry says), it's sampled from what's the same either side of the mirror: an angle a
// from straight down is mirrored left to right at -a, where its cosine's the same, and top to bottom at half a turn less
// a, where its sine is, and both ways wherever the cosine of twice it is
// (with no mirroring, 'none', it's sampled around a plain circle through the noise, rising and falling unevenly all
// the way around, and back where it started)
// detail is how big the circle is: how far around the noise a layer goes, so the bigger, the more it rises and falls
// going around, and the less smooth it is (each layer's is scaled to its size, see ring). it's a value from about -1
// to 1
function noiseAt(noise, progress, z, mirror, detail=1.4) {
  const a = TWO_PI * progress
  const [u, v] = {
    vertical: [Math.cos(a), 0.7 * Math.cos(2 * a)],
    horizontal: [Math.sin(a), 0.7 * Math.cos(2 * a)],
    both: [Math.cos(2 * a), 0.7 * Math.cos(4 * a)],
  }[mirror] ?? [Math.cos(a), Math.sin(a)]
  return noise(detail * u + 50, detail * v + 50, z + 50)
}

// Curve amplitude: how far a style's curves reach (its spikes, waves, swings: whatever it moves toward the center and
// away from it, off the rosette's own line) progress (0-1) of the way around a layer, as a multiple of how far they'd
// reach. it starts at 1, goes to curveAmplitude and back to 1, curveHz times all the way around (a whole number, so it
// ends as it started), following a sine wave: at 0 hz it stays at 1. a cosine
// from straight down is mirrored left to right, one from straight across (a quarter turn on) top to bottom, and both
// ways only with an even number of them, so mirrored both ways, an odd number goes up to the next even one
export function curveAt({ curveAmplitude, curveHz, mirror }, progress) {
  if (!curveHz || curveAmplitude === 1) return 1
  const a = TWO_PI * progress
  const n = mirror === 'both' ? 2 * Math.ceil(curveHz / 2) : curveHz
  return 1 + (curveAmplitude - 1) * (1 - Math.cos(n * (mirror === 'horizontal' ? a - Math.PI / 2 : a))) / 2
}

// What a style draws with (see styles.js)
function styleContext(r, pass, count, sizes) {
  const cx = r.center[0] + pass.offset[0]
  const cy = r.center[1] + pass.offset[1]
  const outer = sizes[count - 1]
  // the rosette's own noise, the same for every pass, and for every rosette that shares its seed (a pattern's cells)
  const noise = r.noise ? noise3(r.seed + 31 + Math.round(r.noiseSeed) * 7919) : null

  // Points around a layer, starting at `start` (0-1) around it: all the way around (a closed loop), or `span` of the
  // way (an open line). t picks the layer's size and its gears (fractions are fine, given a size). points is how many
  // there'd be all the way around. baseScale(i) pulls point i in toward the center (or pushes it out) before the
  // gears ride on it. spiral turns it like the spiral feature says
  const ring = ({ t=0, size=sizes[t], points=r.pointCount, start=0, span=1, baseScale=null, spiral=false, gears=pass.gears }={}) => {
    const baseGear = r.base(size)
    if (!baseGear) return []
    let g = gears
    if (r.radiaChange) g = shiftRadia(g, r.radiaChange, t, count)
    if (r.gearModifier) g = r.gearModifier(g, t, count)
    const turn = spiral ? r.spiral(t) * PI / 180 : 0
    const n = max(1, Math.round(points))
    const samples = span === 1 ? n : Math.round(n * span) + 1
    // how far the noise pushes this size in and out, where it's sampled going out (see noiseAt)
    const z = r.noise ? r.noiseDepth * Math.log(max(size, 1e-3)) : 0
    // and how big a circle it's read around: the outermost layer's is as big as the noise's detail, and every other
    // layer's as much smaller as the layer is, so the bumps come out the same size on every layer, rather than the
    // same number of them (which would leave the bigger layers smoother)
    const around = r.noiseDetail * size / max(outer, 1e-3)

    return times(samples, i => {
      const progress = start + i / n
      const k = baseScale ? baseScale(i) : 1
      const [bx, by] = baseGear(progress)
      const point = g.reduce(
        ([x, y], gear) => getXYRotation((progress + gear.phase) * gear.rotation * TWO_PI, size * gear.radia, x, y),
        [bx * k, by * k]
      )
      let [x, y] = rotate(point, turn)
      if (r.noise) {
        const mirror = r.noiseSymmetry === 'rosette' ? r.mirror : r.noiseSymmetry
        const f = max(0, 1 + r.noise * noiseAt(noise, progress, z, mirror, around))
        x *= f
        y *= f
      }
      return r.project ? r.project([x + pass.offset[0], y + pass.offset[1]], progress) : [x + cx, y + cy]
    })
  }

  return {
    count,
    sizes,
    outer,
    // the layers it draws: every one, or with a single layer (see singleLayer) just the outermost, as it'd be with the
    // rest (its size, its gears, and however much its style draws around it there), and whether it's that
    layers: r.singleLayer ? [count - 1] : times(count, t => t),
    single: !!r.singleLayer,
    minSize: r.minSize,
    spacing: r.spacing,
    // how long the short lines curves get flattened into can be
    step: r.clipStep,
    gears: pass.gears,
    settings: r.styleSettings,
    // per-piece randomness, the same every time this pass is drawn
    random: createRandom(r.seed + pass.index),
    color: t => pass.colorFn(t, count),
    // how far its curves reach progress (0-1) of the way around, as a multiple of how far they'd reach (see curveAt),
    // and whether that ever changes
    curveAt: progress => curveAt(r, progress),
    curving: r.curveHz > 0 && r.curveAmplitude !== 1,
    // which layer a size would be, as a fraction
    tAt: size => max(0, (size - r.minSize) / r.spacing),
    // sizes spacing * scale apart, from the outermost layer in toward the innermost
    sizesEvery: scale => {
      const step = r.spacing * scale
      const n = Math.floor((outer - r.minSize) / step + 1e-9) + 1
      return times(n, i => outer - (n - 1 - i) * step)
    },
    ring,
  }
}
