import { setSeed, getHash, pick, max, times } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, fillPast } from './rosette.js'

// the bg grid on its own: one numismatic rosette repeated in every cell, each copy filling its cell and cut off at the
// cell's edges, with nothing between the cells, covering the whole canvas. ?hash= remakes one (a new one's hash shows
// up in the url as #hash)
const hash = getHash()
setSeed(hash)


// ---------------------------------------------------------------------------------------------------- settings
// everything is in svg units, except where it says layer spacings

const canvas = {
  size: 150,
  background: '#fff',
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
}

const grid = {
  columns: 3,
  rows: 3,
  // the grid's pen
  pen: pen.blue,
  // how likely the grid's rosette is to be radial or rectangular (a rectangular one is stretched to fit a cell)
  baseChances: { radial: 1, rect: 1 },
  // how rectangular a rectangular one is: 2 = oval, ~4 = squircle, 8+ = rounded rectangle
  rectExponent: 8,
}

const layout = {
  // how far apart the layers are
  spacing: 3.5,
  // points around each layer
  pointCount: 1200,
  // curves are drawn as short lines about this long (and lines are cut into pieces this long before clipping)
  clipStep: 0.5,
}

// see numismatic in styles.js
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
// top to bottom as well as left to right
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
const { strokeWidth } = canvas

// the cells tile the whole canvas
const cellW = canvas.size / grid.columns
const cellH = canvas.size / grid.rows

// shared by every rosette
const shared = {
  spacing: layout.spacing,
  minSize: layout.spacing,
  pointCount: layout.pointCount,
  clipStep: layout.clipStep,
  strokeWidth,
  strokeOpacity: canvas.strokeOpacity,
}

// the grid's rosette, picked from the hash
const gridFeatures = generateFeatures({ ...features, palette: [grid.pen] })
const gridBase = pick(grid.baseChances) === 'rect'
  ? rectBase({ exponent: grid.rectExponent, stretch: [max(0, cellW - cellH) / 2, max(0, cellH - cellW) / 2] })
  : radialBase()

const cells = times(grid.rows, row => times(grid.columns, column => {
  const cellCenter = [cellW * (column + 0.5), cellH * (row + 0.5)]
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
    clip: cell,
  })
  drawRosette(svg, rosette)
  return rosette
})).flat()

console.log({ hash, cells })

svg.mount()

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
