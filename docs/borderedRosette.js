import { setSeed, getHash, pick, max, times } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, intersectSdf, unionSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, fitWithin, fillPast } from './rosette.js'

// A primary numismatic rosette in the center, inside bands of a bg grid, one band inside another, each between a pair
// of rects. the grid is one numismatic rosette repeated in every cell, each copy filling its cell and cut off at the
// cell's edges, with nothing between the cells, and it's cut out everywhere but the bands. ?hash= remakes one (a new
// one's hash shows up in the url as #hash)
const hash = getHash()
setSeed(hash)


// ---------------------------------------------------------------------------------------------------- settings
// everything is in svg units, except where it says layer spacings. the distances between rects are between their lines

const canvas = {
  size: 150,
  background: '#fff',
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
}

const grid = {
  columns: 3,
  rows: 3,
  // how far short of the canvas edge the ink (the outermost rect, A) stops. the grid starts right inside A
  margin: 5,
  // the grid's pen
  pen: pen.blue,
  // how likely the grid's rosette is to be radial or rectangular (a rectangular one is stretched to fit a cell)
  baseChances: { radial: 1, rect: 1 },
  // how rectangular a rectangular one is: 2 = oval, ~4 = squircle, 8+ = rounded rectangle
  rectExponent: 8,
}

const frame = {
  // the rects' pen
  pen: pen.blue,
  // how many bands of grid there are, each between a pair of rects (A and B, then C and D, and so on going in)
  bands: 8,
  // how wide each band is: this fraction of the way in from A to the outer edge of the primary at primary.radius (at
  // its closest to A)
  inset: 0.33,
  // how far apart the bands are: this fraction of A's distance from the canvas edge
  bandGap: 0.5,
}

const primary = {
  // the bands are sized from the primary at this size (its ink within this far of the center). the primary that's
  // drawn shrinks to sit as far inside the innermost rect as that one sits inside B
  radius: 65,
  // the primary's pen
  pen: pen.red,
  // whether the primary is mirrored top to bottom like the grid's rosette. it's always mirrored left to right
  mirrorTopBottom: false,
}

const layout = {
  // how far apart the layers are
  spacing: 3.5,
  // points around each layer
  pointCount: 1200,
  // curves are drawn as short lines about this long (and lines are cut into pieces this long before clipping)
  clipStep: 0.5,
}

// see numismatic in styles.js. the primary and the grid's rosette both use these
const numismatic = {
  // how far the outermost layer's points swing in and out, in layer spacings of size
  amplitude: 2.25,
  // how much the swing shrinks going in: 0 keeps it the same, 1 shrinks it in step with the layer's size
  shrink: 1,
  // the least it shrinks to, in layer spacings of size. with minWavelength, this sets how dense the middle gets
  minAmplitude: 0.7,
  // how far past the next layer out's lines every top of a layer reaches, in layer spacings of size
  overlap: 0.25,
  // in and out swings around the outermost layer, and how many fewer each layer in gets
  oscillations: 36,
  oscillationsPerLayer: 0,
  // the narrowest a swing gets, measured along its ring (which the wiggles make longer than a circle), in layer
  // spacings. smaller layers get fewer swings instead
  minWavelength: 1.25,
  // keeps every layer's swings even, which a rosette mirrored top to bottom needs to stay that way
  evenSwings: true,
  // copies of the ring in each layer, and how much of one swing they're spread across (1 spreads them evenly)
  repeats: 6,
  spread: 1,
  // how curved the lines between points are: 0 straight, 1 smooth curves through every point
  curve: 1,
  // how close to the center the layers get, in layer spacings of size. any layer that would swing in past it is left
  // out
  floor: 1.2,
}

// the grid's rosette's gears all turn an odd number of times from a fixed start, which (with evenSwings) mirrors it
// top to bottom as well as left to right. the primary gets its own gears
const features = {
  style: 'numismatic',
  styleSettings: { numismatic },
  gearStart: 'fixed',
  // how many, how many times they turn (at least and at most), and how big they get (as a fraction of each layer's
  // size). like fake-internet-money's: two gentle gears that always turn
  gearOptions: { count: 2, rotationMin: 1, rotationMax: 16, radiaMin: 0.06, radiaMax: 0.12, oddRotations: true },
  // how much the gears' radia shift from the innermost layer to the outermost
  radiaChangeChance: 0,
  radiaChangeRange: [0.005, 0.1],
  // only the standard style uses these
  ribbedStyles: [],
  spiralChances: [[1, () => 0]],
  aura: false,
}


// ---------------------------------------------------------------------------------------------------- drawing

const svg = new Svg({ width: canvas.size, height: canvas.size, background: canvas.background })
const center = [canvas.size / 2, canvas.size / 2]
const { strokeWidth } = canvas

// A's line runs half a pen width inside margin, so its ink stops margin short of the canvas edge. the grid starts where
// A's ink ends
const A = grid.margin + strokeWidth / 2
const gridEdge = grid.margin + strokeWidth
const cellW = (canvas.size - 2 * gridEdge) / grid.columns
const cellH = (canvas.size - 2 * gridEdge) / grid.rows

// shared by every rosette
const shared = {
  spacing: layout.spacing,
  minSize: layout.spacing,
  pointCount: layout.pointCount,
  clipStep: layout.clipStep,
  strokeWidth,
  strokeOpacity: canvas.strokeOpacity,
}

// the grid's rosette and the primary, picked from the hash (the grid's first, so a hash keeps its grid either way)
const gridFeatures = generateFeatures({ ...features, palette: [grid.pen] })
const gridBase = pick(grid.baseChances) === 'rect'
  ? rectBase({ exponent: grid.rectExponent, stretch: [max(0, cellW - cellH) / 2, max(0, cellH - cellW) / 2] })
  : radialBase()
const primaryFeatures = generateFeatures({
  ...features,
  palette: [primary.pen],
  gearOptions: { ...features.gearOptions, oddRotations: primary.mirrorTopBottom },
  styleSettings: { numismatic: { ...numismatic, evenSwings: primary.mirrorTopBottom } },
})

// how far a rosette's ink reaches from the center, left, right, up, or down (whichever is farthest)
const halfExtent = rosette => rosette.strokes.reduce((m, s) => s.points.reduce(
  (m2, [x, y]) => max(m2, Math.abs(x - center[0]), Math.abs(y - center[1])), m), 0) + strokeWidth / 2

// the bands, sized from the primary at primary.radius: each one's outer and inner rect, going in from A
const referencePrimary = createRosette({ ...shared, ...primaryFeatures, center, base: radialBase(), layers: fitWithin(primary.radius) })
const aToPrimary = canvas.size / 2 - halfExtent(referencePrimary) - A
const bandWidth = frame.inset * aToPrimary
const bandGap = frame.bandGap * A
const bands = times(frame.bands, k => {
  const outer = A + k * (bandWidth + bandGap)
  return [outer, outer + bandWidth]
})
const innermost = bands.at(-1)[1]

// the primary that's drawn: as far inside the innermost rect as the one at primary.radius is inside B. numismatic packs
// its layers in from the outermost one's size, so one layer of just the right size (found by scaling until its ink
// reaches exactly that far) gives the whole rosette at that size. left out if the bands leave no room for it
const primaryReach = canvas.size / 2 - innermost - (aToPrimary - bandWidth)
const primaryAt = size => createRosette({ ...shared, ...primaryFeatures, center, base: radialBase(), minSize: size, layers: 1 })
let primaryRosette = null
if (primaryReach > 0) {
  let primarySize = primaryReach
  primaryRosette = primaryAt(primarySize)
  times(4, () => {
    primarySize *= primaryReach / halfExtent(primaryRosette)
    primaryRosette = primaryAt(primarySize)
  })
}

// the grid shows in each band, stopping at its rects' ink
const box = at => boxSdf(...center, canvas.size / 2 - at, canvas.size / 2 - at)
const inBands = unionSdf(...bands.map(([outer, inner]) => {
  const outerBox = box(outer)
  const innerBox = box(inner)
  return (x, y) => max(outerBox(x, y) + strokeWidth, strokeWidth - innerBox(x, y))
}))

const cells = times(grid.rows, row => times(grid.columns, column => {
  const cellCenter = [gridEdge + cellW * (column + 0.5), gridEdge + cellH * (row + 0.5)]
  // the cell. its lines run right up to the seams, where they meet its neighbors' lines: the rosettes are mirrored, so
  // a neighbor's lines reach the seam at the very same points
  const cell = boxSdf(...cellCenter, cellW / 2, cellH / 2)
  const rosette = createRosette({
    ...shared,
    ...gridFeatures,
    center: cellCenter,
    base: gridBase,
    // enough layers that the outermost one lies entirely outside the cell, so the rosette fills it to its edges
    layers: fillPast(cell),
    clip: intersectSdf(cell, inBands),
  })
  drawRosette(svg, rosette)
  return rosette
})).flat()

// the rects
const rectPath = at => `M ${at},${at} ${canvas.size - at},${at} ${canvas.size - at},${canvas.size - at} ${at},${canvas.size - at} Z`
for (const at of bands.flat()) svg.path(rectPath(at), { stroke: frame.pen, strokeWidth, strokeOpacity: canvas.strokeOpacity })

if (primaryRosette) drawRosette(svg, primaryRosette)

console.log({ hash, primary: primaryRosette, referencePrimary, cells, bands })

svg.mount()

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
