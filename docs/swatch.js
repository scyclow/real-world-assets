import { setSeed, randomHash, pick, rnd, prb, max, min } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { boxSdf, intersectSdf } from './sdf.js'
import { radialBase, rectBase } from './bases.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, fillPast } from './rosette.js'
import { makePattern, shadowPattern, features, styleChances, styleNames, defaults as billDefaults } from './bill.js'
import { rosetteDefaults, gearOptionsFor } from './rosetteSettings.js'

// The note's background on its own (see bill.js): one rosette repeated in every cell, cut off at the cells' edges,
// inside a rect, with its shadow (a copy nudged over in another pen) under it. The cells are the note's grid, or the
// rect split up again and again into smaller rects of different sizes. drawSwatch() draws one from a
// hash (a new one every time, unless it's handed one). swatchConsole.js drives it; swatch.html opens that.


// ---------------------------------------------------------------------------------------------------- settings
// everything is in mm, except where it says layer spacings

const swatch = {
  width: 60,
  height: 100,
  background: '#fff',
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
  // how far short of the edge the ink stops
  margin: 1,
}

const layout = {
  pointCount: 900,
  clipStep: 0.5,
}

// what the console starts at: how the rect is cut into cells ('subdivide' or 'grid'), and for a subdivision how many
// times it's split at most and how small a cell can get (mm), or for a grid its columns and rows. then how far apart
// the pattern's layers are, how much of its cells it fills, its gears (see rosetteSettings.js), its style and shape
// ('' leaves them to the hash, like the note does) and pen, and the shadow: on or off, its pen, and how far over
// (right and down) it's moved, as on the note
export const defaults = {
  layout: 'subdivide',
  depth: 5,
  minCell: 12,
  columns: 2,
  rows: 4,
  spacing: billDefaults.spacing.field,
  size: 1,
  ...rosetteDefaults,
  symmetry: 'both',
  style: '',
  shape: '',
  color: 'black',
  shadow: true,
  shadowColor: billDefaults.shadow.color,
  shadowX: billDefaults.shadow.x,
  shadowY: billDefaults.shadow.y,
}

export { styleNames }


// ---------------------------------------------------------------------------------------------------- drawing

// Draws a swatch (see defaults for what can be set). Returns it, its hash, and the style and shape it came out in
export function drawSwatch({ hash=randomHash(), ...settings }={}) {
  const s = { ...defaults, ...settings }
  setSeed(hash)
  const { width: W, height: H, strokeWidth } = swatch
  const svg = new Svg({ width: W, height: H, background: swatch.background })
  const stroke = pen[s.color] ?? s.color
  const shadowStroke = pen[s.shadowColor] ?? s.shadowColor
  // paths are grouped by pen, stacked in the order each pen is first used, so the shadow's gets its group first to
  // sit under the pattern
  if (s.shadow) svg.penGroup(shadowStroke)

  const shared = { pointCount: layout.pointCount, clipStep: layout.clipStep, strokeWidth, strokeOpacity: swatch.strokeOpacity }
  const shape = s.shape || pick({ radial: 1, rect: 1 })
  const chances = s.style ? { [s.style]: 1 } : styleChances.pattern

  // the rect (its line half a pen width inside margin), and the pattern inside it, its ink touching the line's
  const outermost = swatch.margin + strokeWidth / 2
  const inset = outermost + strokeWidth
  const inside = boxSdf(W / 2, H / 2, W / 2 - inset, H / 2 - inset)
  const bounds = [inset, inset, W - inset, H - inset]
  const offset = [s.shadowX, s.shadowY]
  let pattern, shadow
  if (s.layout === 'grid') {
    const { columns, rows, spacing, size, gears, amplitude, smoothed, radiaChange, radialDensity, waveAmplitude, symmetry, starts, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer } = s
    pattern = makePattern({ columns, rows, spacing, size, gears, amplitude, smoothed, radiaChange, radialDensity, waveAmplitude, symmetry, starts, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer }, chances, shape, bounds, inside, [], shared, stroke)
    shadow = s.shadow ? shadowPattern(pattern, offset, shadowStroke, inside) : null
  } else {
    pattern = makeSubdivided(subdivide(bounds, s.depth, s.minCell), s, chances, shape, inside, shared, stroke)
    shadow = s.shadow ? shadowSubdivided(pattern, offset, shadowStroke, inside, bounds) : null
  }

  shadow?.cells.forEach(rosette => drawRosette(svg, rosette))
  pattern.cells.forEach(rosette => drawRosette(svg, rosette))
  svg.path(`M ${outermost},${outermost} ${W - outermost},${outermost} ${W - outermost},${H - outermost} ${outermost},${H - outermost} Z`,
    { stroke, strokeWidth, strokeOpacity: swatch.strokeOpacity })

  return { hash, svg, style: pattern.style, shape, settings: s, pattern, shadow }
}

// A rect ([x0, y0, x1, y1]) split in two, and each half split again, up to depth times: mostly across its longer
// side, somewhere in its middle, never leaving a piece narrower than minCell, and now and then left whole early so the
// cells come out all different sizes. Returns the cells
export function subdivide(rect, depth, minCell) {
  const [x0, y0, x1, y1] = rect
  const w = x1 - x0
  const h = y1 - y0
  // which way to cut: across whichever side is longer, usually
  const across = w > h ? prb(0.8) : prb(0.2)
  const axes = [across, !across].filter(vertical => (vertical ? w : h) >= 2 * minCell)
  if (depth < 1 || !axes.length || prb(0.12)) return [rect]

  const vertical = axes[0]
  const length = vertical ? w : h
  const t = rnd(max(0.3, minCell / length), min(0.7, 1 - minCell / length))
  const halves = vertical
    ? [[x0, y0, x0 + w * t, y1], [x0 + w * t, y0, x1, y1]]
    : [[x0, y0, x1, y0 + h * t], [x0, y0 + h * t, x1, y1]]
  return halves.flatMap(half => subdivide(half, depth - 1, minCell))
}

// A rosette in every cell, all in the same style and gears, each filling size of its cell (a box that much of it, in
// its middle) and cut off at its edges (and clipped to clip). a rect base is stretched to its box, so its layers sit
// square in it. spacing, amplitude, smoothed, radiaChange, radialDensity, waveAmplitude, symmetry, and starts are the rosettes' (see
// rosetteSettings.js)
function makeSubdivided(rects, { spacing, size=1, gears, amplitude, smoothed, radiaChange=0, radialDensity=1, waveAmplitude=1, symmetry='both', starts='fixed', curveAmplitude=1, curveHz=0, noise=0, noiseSymmetry='rosette', noiseDepth=1.6, noiseDetail=1.4, noiseSeed=0, singleLayer=false }, styleChances, cellShape, clip, shared, stroke) {
  const patternFeatures = {
    ...generateFeatures({ ...features, styleChances, palette: [stroke], gearOptions: gearOptionsFor(features.gearOptions, { gears, amplitude, smoothed }) }),
    // set after the roll, so they don't change what else gets rolled
    radiaChange,
    radialDensity,
    waveAmplitude,
    symmetry,
    starts,
    curveAmplitude,
    curveHz,
    noise,
    noiseSymmetry,
    noiseDepth,
    noiseDetail,
    noiseSeed,
    singleLayer,
  }
  const cells = rects.map(([x0, y0, x1, y1]) => {
    const [hw, hh] = [(x1 - x0) / 2 * size, (y1 - y0) / 2 * size]
    const center = [(x0 + x1) / 2, (y0 + y1) / 2]
    const cell = boxSdf(...center, hw, hh)
    return createRosette({
      ...shared,
      ...patternFeatures,
      center,
      base: cellShape === 'rect' ? rectBase({ exponent: 8, stretch: [max(0, hw - hh), max(0, hh - hw)] }) : radialBase(),
      spacing,
      minSize: spacing,
      // enough layers that the outermost one lies entirely outside the cell, so the rosette fills it to its edges
      layers: fillPast(cell),
      clip: intersectSdf(cell, clip),
    })
  })
  return { style: patternFeatures.style, cells, rects, size }
}

// The subdivision again, every cell moved over by [dx, dy] in another pen, built without drawing it. a cell on the
// edge of bounds reaches past it by as much as it's moved, so the shadow still meets the edge (each rosette's layers
// run past its cell, unless it's smaller than its cell and there's nothing to meet), and it's all clipped to clip
function shadowSubdivided({ cells, rects, size }, [dx, dy], stroke, clip, bounds) {
  const reach = size < 1 ? 0 : max(Math.abs(dx), Math.abs(dy))
  // each cell's box, the size of its rosette
  const boxes = rects.map(([x0, y0, x1, y1]) => {
    const [cx, cy, hw, hh] = [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 * size, (y1 - y0) / 2 * size]
    return [cx - hw, cy - hh, cx + hw, cy + hh]
  })
  const shadows = cells.map((rosette, k) => {
    const grown = boxes[k].map((edge, i) => edge === bounds[i] ? edge + (i < 2 ? -reach : reach) : edge)
    const [x0, y0, x1, y1] = grown.map((edge, i) => edge + (i % 2 ? dy : dx))
    const cell = boxSdf((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2)
    return {
      config: { ...rosette.config, center: [rosette.config.center[0] + dx, rosette.config.center[1] + dy], clip: intersectSdf(cell, clip) },
      strokes: rosette.strokes.map(({ points, closed }) => ({ points: points.map(([x, y]) => [x + dx, y + dy]), closed, stroke })),
    }
  })
  return { cells: shadows }
}
