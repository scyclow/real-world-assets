import { PI, TWO_PI, hypot, max, times, getXYRotation, rotate, createRandom } from './utils.js'
import { pen } from './colors.js'
import { radialBase } from './bases.js'
import { shiftRadia } from './gears.js'
import { radialEnvelope } from './sdf.js'
import { densify, strokePath } from './clip.js'
import { styles, auraStrokes } from './styles.js'

// the most layers a rosette can have, so the layer-fitting strategies always stop
export const MAX_LAYERS = 200

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
// up with, and everything its style draws as strokes: { points, closed, stroke }, in canvas coordinates
export function createRosette(config) {
  const r = { ...rosetteDefaults, ...config }
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
      .filter(({ points }) => points.length > 1)
  }

  const count = typeof r.layers === 'function' ? r.layers({ outermost, strokes }, r) : r.layers
  return { config: r, count, strokes: strokes(count) }
}

// Draws a rosette's strokes, clipped to its clip. Anything clipped away entirely is skipped
export function drawRosette(svg, { config: { clip, clipStep, strokeWidth, strokeOpacity }, strokes }) {
  strokes.forEach(({ points, closed, stroke }) => {
    const d = strokePath(points, { closed, clip, step: clipStep })
    if (d) svg.path(d, { stroke, strokeWidth, strokeOpacity })
  })
}

// Everything within reach of a rosette's ink (with any curls filled in), grown by grow, as a signed distance
// function. For clipping other rosettes around it
export function rosetteSdf({ config: { center: [cx, cy], clipStep }, strokes }, grow=0) {
  const points = strokes.flatMap(({ points, closed }) => densify(points, clipStep, closed).map(([x, y]) => [x - cx, y - cy]))
  return radialEnvelope(points).sdf([cx, cy], grow)
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

// What a style draws with (see styles.js)
function styleContext(r, pass, count, sizes) {
  const cx = r.center[0] + pass.offset[0]
  const cy = r.center[1] + pass.offset[1]
  const outer = sizes[count - 1]

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

    return times(samples, i => {
      const progress = start + i / n
      const k = baseScale ? baseScale(i) : 1
      const [bx, by] = baseGear(progress)
      const point = g.reduce(
        ([x, y], gear) => getXYRotation((progress + gear.phase) * gear.rotation * TWO_PI, size * gear.radia, x, y),
        [bx * k, by * k]
      )
      const [x, y] = rotate(point, turn)
      return [x + cx, y + cy]
    })
  }

  return {
    count,
    sizes,
    outer,
    minSize: r.minSize,
    spacing: r.spacing,
    // how long the short lines curves get flattened into can be
    step: r.clipStep,
    gears: pass.gears,
    settings: r.styleSettings,
    // per-piece randomness, the same every time this pass is drawn
    random: createRandom(r.seed + pass.index),
    color: t => pass.colorFn(t, count),
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
