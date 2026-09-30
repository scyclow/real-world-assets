import { setSeed, randomHash, pick, max, times, createRandom } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, superellipseSdf, blendCellSdf, growSdf, intersectSdf, unionSdf, boundedUnionSdf, subtractSdf } from './sdf.js'
import { strokePath } from './clip.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, rosetteSdf, rosetteEnvelope, fitWithin, fitInside, fillPast } from './rosette.js'
import { drawText, textBox } from './type.js'
import { cutive, cutiveOutline } from './cutive.js'
import { colorFnFor } from './colorRules.js'
import { rosetteDefaults, gearOptionsFor } from './rosetteSettings.js'

// A paper note: a seal on a guilloche field, inside a frame of rosette-pattern bands, with the lettering from type.js
// over it. drawBill() draws one from a hash (a new one every time, unless it's handed one) and returns it, along with
// the style every piece ended up in. The console in billConsole.js is what drives it; bill.html opens that.
//
// Any of the styles can be set instead of left to the hash: drawBill({ styles: { field: 'wavy' } }) (see styleNames)


// ---------------------------------------------------------------------------------------------------- settings
// everything is in mm, except where it says layer spacings

export const bill = {
  // about banknote proportions
  width: 195,
  height: 82.5,
  background: '#fff',
  // a fine pen, so the patterns stay legible at how dense they are
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
  // the engraving's pen, and the one for the seal and the serials (drawBill's colors can change them)
  ink: pen.black,
  accent: pen.green,
  // how far short of the note's edge the ink stops
  margin: 5,
}

const frame = {
  // bands of pattern around the note, each between a pair of rects, going in
  bands: 1,
  width: 3.75,
  gap: 1.5,
  // white space between the innermost band and the field
  padding: 1.5,
}

// the two patterns of repeated rosettes: a coarser one in the frame's bands, a finer one across the note
const patterns = {
  border: { columns: 8, rows: 3, spacing: 2.125 },
  field: { columns: 1, rows: 1, spacing: 0.875 },
}

// the seal in the middle of the note, as its centerpiece (the field starts 10.4 in from the note's edge, so it sits
// inside that). spacing is how far apart its layers are: close together, so its rings read as dense engraving
const seal = { x: 97.5, y: 43.75, radius: 18.75, pen: 'accent', spacing: 0.875 }

// how much white space the field leaves around the seal, and around the lettering
const halo = { rosettes: 1.25, lettering: 2.75 }

// what style each piece is drawn in, as weights (see styles.js). the patterns stick to the styles that stay mirrored
// top to bottom on odd gears, so a cell's lines still meet its neighbors' at the seams
export const styleChances = {
  seal: { standard: 1 },
  backing: { standard: 1 },
  pattern: { inwardSpikes: 1 },
}

// the lettering, in cutive (single line, uppercase and digits only -- see cutive.js). x and y are its left and top
// (align moves it), and size scales the glyphs (they're 58 tall at 1). room is extra white space cleared beside or
// above a line, for somewhere to sign. framed draws a single rectangular rosette ring around the white space, and the
// field stops right where its ink does
const denominationSize = 0.1125
const titleSize = 0.075
// the title's middle lines up with the denominations'
const titleY = 16.25 + (cutiveOutline.glyphHeight * denominationSize - cutive.glyphHeight * titleSize) / 2
// inset moves the lines in the corners that much further in from both sides, to clear a border that reaches further
// in. the title only comes down a third as far, so it stays clear of the seal below it (a little of the border can
// reach it)
const letteringFor = (serial, denomination, inset=0) => [
  // the denominations are drawn as outlines, so they read as display type against the single lines
  // they and the title are in the display pen
  { text: `${denomination}`, x: 16.25 + inset, y: 16.25 + inset, size: denominationSize, font: cutiveOutline, framed: true, pen: 'display' },
  { text: `${denomination}`, x: 178.75 - inset, y: 16.25 + inset, size: denominationSize, align: 'right', font: cutiveOutline, framed: true, pen: 'display' },
  { text: 'REAL WORLD ASSETS', x: 97.5, y: titleY + inset / 3, size: titleSize, align: 'center', framed: true, pen: 'display' },
  // the series line sits in the bottom right corner, with room to its left to sign
  { text: 'SERIES 2026', x: 178.75 - inset, y: 64.375 - inset, size: 0.04375, align: 'right', room: { left: 26.875 }, pen: 'series' },
  // the serial, from the hash
  { text: serial, x: 16.25 + inset, y: 64.375 - inset, size: 0.05625, pen: 'serial' },
]

export const layout = {
  // points around each layer, and how long the short lines curves are drawn as (and lines are cut into pieces this
  // long before clipping)
  pointCount: 900,
  clipStep: 0.5,
}

// the shapes the circles styles scatter around their layers
const circleSettings = {
  shape: r => r.sample(['circle', 'square', 'rosette']),
  radius: 1 / 12,
  points: 14,
  pointsPerLayer: 5,
  pointMult: () => 1,
  symbolRadius: 0.28,
  symbolGears: { count: 7, rotationMax: 15, radiaMax: 0.1 },
}

// each style's settings (styles.js says what they do), in the order the consoles' menus list them (spiral, which
// scatters its lines, last). lengths are in layer spacings. anything picked at random is picked from the rosette's own
// random numbers (r => ..., see generateFeatures), so every style gets the same gears, and the same shape, from a hash
const styleSettings = {
  // every layer as its own line
  standard: {},
  outwardSpikes: { spacing: 1.5, points: 28, pointsPerLayer: 20, depth: r => r.rnd(0.7, 0.9) },
  inwardSpikes: { spacing: 1.5, points: 28, pointsPerLayer: 20, bulge: 1, floor: 0.5 },
  numismatic: {
    // how far the outermost layer's points swing in and out
    amplitude: 2.25,
    // how much the swing shrinks going in: 0 keeps it the same, 1 shrinks it in step with the layer's size
    shrink: 1,
    // the least it shrinks to. with minWavelength, this sets how dense the middle gets
    minAmplitude: 0.7,
    // how far past the next layer out's lines every top of a layer reaches
    overlap: 0.25,
    // in and out swings around the outermost layer, and how many fewer each layer in gets
    oscillations: 36,
    oscillationsPerLayer: 0,
    // the narrowest a swing gets, measured along its ring. smaller layers get fewer swings instead
    minWavelength: 1.25,
    // keeps every layer's swings even, which a rosette mirrored top to bottom needs to stay that way
    evenSwings: true,
    // copies of the ring in each layer, and how much of one swing they're spread across (1 spreads them evenly)
    repeats: 6,
    spread: 1,
    // how curved the lines between points are: 0 straight, 1 smooth curves through every point
    curve: 1,
    // how close to the center the layers get. any layer that would swing in past it is left out
    floor: 1.2,
  },
  // rings of waves, one to a layer
  wavy: {
    spacing: 2.4,
    points: 54,
    pointsPerFourLayers: 12,
    pointsPerLayer: 20,
    amplitude: 1.5,
    repeats: 1,
    floor: 0.5,
  },
  fragmented: { fragmentsPerLayer: r => r.rnd(15, 35), length: [0.01, 0.1] },
  grid: { lines: r => 100 * r.rndint(1, 4) },
  ribbons: { lines: r => 60 * r.rndint(1, 3), minFraction: 0.2 },
  lines: { lines: r => 100 * r.rndint(1, 8) },
  dashed: { points: 32, pointsPerLayer: 10 },
  horizontalDashes: { points: 14, pointsPerLayer: 5, length: 1 },
  circles: circleSettings,
  heterocircles: { ...circleSettings, pointMult: [1, 5] },
  blocks: { points: 150 },
  spiral: { spirals: 4, turns: [2, 6] },
  // new ways to draw them, still being tried out (see experimentalStyles)
  moire: { shift: 0.5 },
  zigzag: { points: 60, pointsPerLayer: 8, depth: 0.8 },
  lattice: { lines: 72 },
  ticks: { points: 40, pointsPerLayer: 6, length: 0.6 },
  loops: { wavelength: 1.5, radius: 0.6 },
  doubled: { gap: 0.3 },
  coil: { points: 900 },
}

// what the note can be worth
export const denominations = [1, 2, 5, 10, 20, 50, 100]

// every style a piece can be drawn in, for the console's menus, and what each is called there. the experimental ones
// are still being tried out, so they say so, and they're never picked at random (a random pick is only ever from the
// stable ones, which is what it always was, so the same hash picks the same style)
export const experimentalStyles = ['moire', 'zigzag', 'lattice', 'ticks', 'loops', 'doubled', 'coil']
export const styleNames = Object.keys(styleSettings)
export const stableStyleNames = styleNames.filter(name => !experimentalStyles.includes(name))
export const styleLabels = Object.fromEntries(styleNames.map(name =>
  [name, experimentalStyles.includes(name) ? `${name} [EXPERIMENTAL]` : name]))

// what the console's density and grid controls start at. spacing is how far apart a rosette's layers are, so the
// smaller it is the denser the rosette draws
export const defaults = {
  denomination: 100,
  // whether the lettering (and the white space and frames around it) is drawn at all
  lettering: true,
  // how far apart each piece's layers are
  spacing: { field: patterns.field.spacing, border: patterns.border.spacing, seal: seal.spacing },
  // what every piece's rosettes can be adjusted by (see rosetteSettings.js), each keyed by piece: how far their gears
  // swing them, whether they're smoothed, how much their radia shrink going out, and how much they draw going around
  // their centers (radial density). size is how much of its cells the background and a border of bands fill, and how
  // wide the seal is across (mm). columns and rows are the grids the background and the bands are repeated over
  gears: { field: 7, border: 7, seal: 7, second: 7, third: 7, frames: 7 },
  amplitude: { field: 0.05, border: 0.05, seal: 0.05, second: 0.05, third: 0.05, frames: 0.03 },
  smoothed: { field: false, border: false, seal: false, second: false, third: false, frames: false },
  radiaChange: { field: 0, border: 0, seal: 0, second: 0, third: 0, frames: 0 },
  radialDensity: { field: 1, border: 1, seal: 1, second: 1, third: 1, frames: 1 },
  // how high their style's waves go
  waveAmplitude: { field: 1, border: 1, seal: 1, second: 1, third: 1, frames: 1 },
  // how far their style's curves reach, going around (see curveAt in rosette.js), and how much noise bends them
  curveAmplitude: { field: 1, border: 1, seal: 1, second: 1, third: 1, frames: 1 },
  curveHz: { field: 0, border: 0, seal: 0, second: 0, third: 0, frames: 0 },
  noise: { field: 0, border: 0, seal: 0, second: 0, third: 0, frames: 0 },
  noiseSymmetry: { field: 'rosette', border: 'rosette', seal: 'rosette', second: 'rosette', third: 'rosette', frames: 'rosette' },
  noiseDepth: { field: 1.6, border: 1.6, seal: 1.6, second: 1.6, third: 1.6, frames: 1.6 },
  noiseDetail: { field: 1.4, border: 1.4, seal: 1.4, second: 1.4, third: 1.4, frames: 1.4 },
  noiseSeed: { field: 0, border: 0, seal: 0, second: 0, third: 0, frames: 0 },
  // and whether they're just their outermost layer
  singleLayer: { field: false, border: false, seal: false, second: false, third: false, frames: false },
  // and how they're mirrored (see withSymmetry in gears.js): the patterns both ways, so their cells meet at the seams
  // (and the medallions, likewise), and the rest left to right
  symmetry: { field: 'both', border: 'both', seal: 'vertical', second: 'vertical', third: 'vertical', frames: 'vertical' },
  // and where their gears start (see withStarts in gears.js)
  starts: { field: 'fixed', border: 'fixed', seal: 'fixed', second: 'fixed', third: 'fixed', frames: 'fixed' },
  size: { field: 1, border: 1, seal: seal.radius * 2 },
  columns: { field: patterns.field.columns, border: patterns.border.columns },
  rows: { field: patterns.field.rows, border: patterns.border.rows },
  // the rings around the lettering: how many rings each frame is, and how far apart those sit
  frames: { rings: 1, spacing: 1.2 },
  // the pens (by name, see colors.js), each piece's own: background for the background, tertiary for its shadow,
  // border for the border's rosettes and frame for its rects, textBorders for the rings around the lettering, and
  // display for the title and the denominations, serial for the serial, and series for the series line. any not given
  // is primary's (secondary's, for the serial)
  colors: {
    primary: 'black', secondary: 'green', tertiary: 'blue', display: 'blue', background: 'black', frame: 'black',
    border: 'black', textBorders: 'black', serial: 'green', series: 'black',
  },
  // the seal: how much white space (in mm) it leaves around its outside, before whatever's behind it, and how its rings
  // are colored: a pattern, and an order of the pens in use by letter (see colorRules.js)
  emblem: { padding: halo.rosettes, pattern: 'single', order: 'B' },
  // the oval rosettes behind the seal, the second right behind it and the third behind that, off unless turned on:
  // how wide they are across (in mm), how oval (0 a circle, and the closer to 1 the flatter: their height is
  // width * (1 - ovalness)), how far apart their layers are, and how much white space (in mm) they leave around their
  // outsides, before whatever's behind them. then their colors, as the seal's
  second: { on: false, width: 62.5, ovalness: 0.3, spacing: 0.875, padding: halo.rosettes, pattern: 'single', order: 'B' },
  third: { on: false, width: 95, ovalness: 0.45, spacing: 1.2, padding: halo.rosettes, pattern: 'single', order: 'B' },
  // a copy of the background under it in the tertiary pen, nudged x and y mm over (right and down), off unless turned
  // on
  shadow: { on: false, x: 0.65, y: 0.65 },
  // what the border is: 'bands' of pattern between the frame's rects, or 'rosettes', a ring of medallions
  borderKind: 'rosettes',
  // the medallions: how many along the top and bottom and down the sides (the corners counting for both), how far in
  // from the note's edge their centers run (below 0 is past the note's edge, so they're cut off by the outermost rect
  // through their middles), how big they are (1 just reaches halfway to the nearest one, so bigger overlaps), how far
  // apart their layers are, and how much white space they leave around everything under them, how much further in the
  // corner ones sit (x and y together; below 0 is further out) and how big they are, and how much further in the
  // lettering in the corners moves to clear them (see letteringFor). their gears are the border's (amplitude, smoothed,
  // radiaChange)
  medallions: {
    across: 8, high: 4, inset: -2.25, cornerOffset: 0, size: 1.4, cornerSize: 2.35, spacing: 0.875, padding: 0.25,
    textInset: 6,
  },
}

// the patterns' rosettes are mirrored top to bottom as well as left to right (odd gears, and even swings where the
// style has them), so a cell's lines meet its neighbors' at the seams. the medallion and the seal get their own gears
export const features = {
  styleSettings,
  gearStart: 'fixed',
  // how many, how many times they turn (at least and at most), and how big they get (as a fraction of each layer's
  // size). like fake-internet-money's: two gentle gears that always turn
  gearOptions: { count: 2, rotationMin: 1, rotationMax: 16, radiaMin: 0.06, radiaMax: 0.12, oddRotations: true },
  radiaChangeChance: 0,
  radiaChangeRange: [0.005, 0.1],
  // only the standard style uses these
  ribbedStyles: [],
  spiralChances: [[1, () => 0]],
  aura: false,
}


// ---------------------------------------------------------------------------------------------------- drawing

// One rosette repeated in every cell of a grid, each copy filling its cell, cut off at the cell's edges (so a cell's
// lines meet its neighbors' at the seams), and clipped to whatever else is passed in. builds it without drawing it,
// so something can go under it first. radiaChange, when it's given, is how much every gear's radia shrinks from the
// innermost layer to the outermost (below 0 grows), amplitude and smoothed are its gears' and radialDensity how much
// it draws going around its center, symmetry how it's mirrored and starts where its gears start (see rosetteSettings.js), and size how much of its cell each copy fills (below 1 it
// fills a box that much of its cell, in its middle). shared is what every rosette gets (pen width, points, and the
// like), and stroke is its pen
export function makePattern({ columns, rows, spacing, radiaChange, gears, amplitude, smoothed, radialDensity=1, waveAmplitude=1, symmetry='both', starts='fixed', curveAmplitude=1, curveHz=0, noise=0, noiseSymmetry='rosette', noiseDepth=1.6, noiseDetail=1.4, noiseSeed=0, singleLayer=false, size=1 }, styleChances, cellShape, [x0, y0, x1, y1], clip, holes=[], shared={}, stroke=bill.ink) {
  const rolled = generateFeatures({ ...features, styleChances, palette: [stroke], gearOptions: gearOptionsFor(features.gearOptions, { gears, amplitude, smoothed }) })
  // set after the roll rather than handed to it, so they don't change what else gets rolled
  const patternFeatures = { ...rolled, radiaChange: radiaChange ?? rolled.radiaChange, radialDensity, waveAmplitude, symmetry, starts, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer }
  const cellW = (x1 - x0) / columns
  const cellH = (y1 - y0) / rows
  // how much of its cell each copy fills
  const [hw, hh] = [cellW / 2 * size, cellH / 2 * size]
  // a rect base is stretched to its box, so its layers sit square in it
  const base = cellShape === 'rect'
    ? rectBase({ exponent: 8, stretch: [max(0, hw - hh), max(0, hh - hw)] })
    : radialBase()

  const cells = times(rows, row => times(columns, column => {
    const center = [x0 + cellW * (column + 0.5), y0 + cellH * (row + 0.5)]
    const cell = boxSdf(...center, hw, hh)
    const rosette = createRosette({
      ...shared,
      ...patternFeatures,
      center,
      base,
      spacing,
      minSize: spacing,
      // enough layers that the outermost one lies entirely outside the cell, so the rosette fills it to its edges
      layers: fillPast(cell),
      clip: subtractSdf(intersectSdf(cell, clip), ...holes),
    })
    return rosette
  })).flat()

  return { style: patternFeatures.style, cells, cellW, cellH, x0, y0, columns, rows, size }
}

// A pattern again, moved over by [dx, dy] in another pen, built without drawing it: each cell's copy moved with it and
// cut off at its moved edges, clipped to where the pattern itself is allowed (clip, less holes). the cells on the
// pattern's edges reach past them by as much as it's moved (each rosette's layers run past its cell), so the shadow
// still meets them (unless they're smaller than their cells, and there's nothing to meet). every cell's rosette is the
// same, so the copies are the first one's strokes moved
export function shadowPattern({ cells, cellW: fullW, cellH: fullH, x0, y0, columns, rows, size=1 }, [dx, dy], stroke, clip, holes=[]) {
  const [cx, cy] = cells[0].config.center
  const [cellW, cellH] = [fullW * size, fullH * size]
  const reach = size < 1 ? 0 : max(Math.abs(dx), Math.abs(dy))
  const shadows = cells.map(({ config }, k) => {
    const [row, column] = [Math.trunc(k / columns), k % columns]
    const center = [config.center[0] + dx, config.center[1] + dy]
    const [mx, my] = [center[0] - cx, center[1] - cy]
    const [left, top] = [center[0] - cellW / 2 - (column === 0 ? reach : 0), center[1] - cellH / 2 - (row === 0 ? reach : 0)]
    const [right, bottom] = [center[0] + cellW / 2 + (column === columns - 1 ? reach : 0), center[1] + cellH / 2 + (row === rows - 1 ? reach : 0)]
    const cell = boxSdf((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2)
    return {
      config: { ...config, center, clip: subtractSdf(intersectSdf(cell, clip), ...holes) },
      strokes: cells[0].strokes.map(({ points, closed }) => ({ points: points.map(([x, y]) => [x + mx, y + my]), closed, stroke })),
    }
  })
  return { cells: shadows }
}

// A ring of medallions: rosettes with their centers on a rect inset from the edge of a [W, H] sheet, big enough to
// overlap. where they do, each is cut off where its ring crosses its neighbor's, so their lines meet at the seams like
// the patterns' cells. anywhere else they stop where their layers stop, and only the outermost rect cuts them
// (outermost is how far in its line runs). cornerOffset moves the corner ones further in, x and y together, cornerSize
// is their size (size is everyone else's), amplitude, smoothed, and radiaChange are their gears', radialDensity how
// much they draw going around their centers, symmetry how they're mirrored, and starts where their gears start (see
// rosetteSettings.js). shared is what every rosette gets (pen width,
// points, and the like), and stroke is their pen
export function makeMedallions({ across, high, inset: d, cornerOffset=0, size, cornerSize=size, spacing: layerSpacing,
  gears, amplitude, smoothed=false, radiaChange=0, radialDensity=1, waveAmplitude=1, symmetry='both', starts='fixed', curveAmplitude=1, curveHz=0, noise=0, noiseSymmetry='rosette', noiseDepth=1.6, noiseDetail=1.4, noiseSeed=0, singleLayer=false }, styleChances, cellShape, [W, H], outermost, shared={}, stroke=bill.ink) {
  const medallionFeatures = {
    ...generateFeatures({
      ...features,
      styleChances,
      palette: [stroke],
      gearOptions: gearOptionsFor(features.gearOptions, { gears, amplitude, smoothed }),
    }),
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
  const strokeWidth = shared.strokeWidth ?? bill.strokeWidth
  const xs = times(across, i => d + i * (W - 2 * d) / (across - 1))
  const ys = times(high, j => d + j * (H - 2 * d) / (high - 1))
  // where each one sits on the rect, and whether it's a corner
  const track = [
    ...xs.map((x, i) => ({ at: [x, d], corner: i === 0 || i === across - 1 })),
    ...xs.map((x, i) => ({ at: [x, H - d], corner: i === 0 || i === across - 1 })),
    ...ys.slice(1, -1).flatMap(y => [{ at: [d, y] }, { at: [W - d, y] }]),
  ]
  // how far each one reaches: its size times halfway to its nearest neighbor on the rect, measured before the corners
  // are moved, so moving them doesn't change anyone's size
  const radii = track.map(({ at: [cx, cy], corner }, k) => (corner ? cornerSize : size) *
    Math.min(...track.filter((_, j) => j !== k).map(({ at: [x, y] }) => Math.hypot(x - cx, y - cy))) / 2)
  // then the corners sit cornerOffset further in than the rest (or out, below 0), along both sides at once
  const c = d + cornerOffset
  const centers = track.map(({ at: [x, y], corner }) => corner ? [x < W / 2 ? c : W - c, y < H / 2 ? c : H - c] : [x, y])
  const inside = boxSdf(W / 2, H / 2, W / 2 - outermost, H / 2 - outermost)
  const inRect = (x, y) => inside(x, y) + strokeWidth
  const cells = centers.map((center, k) => {
    const others = centers.map(([x, y], j) => [x, y, radii[j]]).filter((_, j) => j !== k)
    return createRosette({
      ...shared,
      ...medallionFeatures,
      center,
      base: cellShape === 'rect' ? rectBase({ exponent: 8 }) : radialBase(),
      spacing: layerSpacing,
      minSize: layerSpacing,
      layers: fitWithin(radii[k]),
      // its own share of the ring: cut off where its rings meet its neighbors' ring for ring, even when they're
      // different sizes (so one that doesn't reach its neighbor isn't cut short), with its ink inside the outermost
      // rect's
      clip: intersectSdf(blendCellSdf(center, radii[k], others), inRect),
    })
  })
  return { style: medallionFeatures.style, cells, radii }
}

// Draws a note. hash seeds everything random about it (a new one each time by default). styles names the style any
// of its pieces is drawn in ({ seal, border, field, second, third, frames }) and shapes the shape its layers follow,
// 'radial' or 'rect' ({ seal, border, field }), leaving the rest to the hash (the frames are 'standard' unless they're
// set). spacing ({ seal, border, field }) is how far apart each piece's layers are, so the smaller it is the denser it
// draws. gears, amplitude, smoothed, radiaChange, radialDensity, waveAmplitude, symmetry, starts, curveAmplitude, curveHz, noise, singleLayer, size, columns, and rows are what each piece's rosettes are
// adjusted by, keyed by piece (see defaults). frames ({ rings, spacing }) is the rings around the lettering: how many
// there are, and how far apart they sit. colors (see defaults) are the pens (see defaults), and penColors every pen in use, in order, which the emblems'
// color rules draw from (the three of them, primary first, if it's not given). emblem ({ padding }) is the white space around the seal's
// outside. second and third ({ on, width, ovalness, spacing, padding }) are the oval rosettes behind the seal (see
// defaults), padding the white space around their outsides. shadow ({ on, x, y }) is a copy of the background offset
// under it. borderKind is 'bands' or 'rosettes', and medallions sets the rosettes (see defaults). denomination is what
// it's worth (see denominations), and lettering false leaves out all the lettering and the white space around it.
// Returns what it drew, the hash, and what each piece came out as
export function drawBill({ hash=randomHash(), styles={}, shapes={}, spacing={}, gears={}, amplitude={}, smoothed={}, radiaChange={},
  radialDensity={}, waveAmplitude={}, symmetry={}, starts={}, curveAmplitude={}, curveHz={}, noise={}, noiseSymmetry={}, noiseDepth={}, noiseDetail={}, noiseSeed={}, singleLayer={}, size: sizes={}, columns={}, rows={}, frames={}, colors={}, penColors, emblem={},
  second={}, third={}, shadow={}, borderKind=defaults.borderKind, medallions={}, denomination=defaults.denomination,
  lettering: showLettering=defaults.lettering }={}) {
  setSeed(hash)
  const chances = {
    seal: styles.seal ? { [styles.seal]: 1 } : styleChances.seal,
    border: styles.border ? { [styles.border]: 1 } : styleChances.pattern,
    field: styles.field ? { [styles.field]: 1 } : styleChances.pattern,
    second: styles.second ? { [styles.second]: 1 } : styleChances.backing,
    third: styles.third ? { [styles.third]: 1 } : styleChances.backing,
  }
  // a piece's shape, rolled from the hash where it isn't set. every roll happens here, in the same order every time,
  // so pinning one piece's shape doesn't change what the others get
  const shape = Object.fromEntries(['seal', 'border', 'field']
    .map(piece => [piece, shapes[piece] ?? pick({ radial: 1, rect: 1 })]))
  // with the medallions for a border, the lettering in the corners moves in to clear them
  const textInset = borderKind === 'rosettes' ? medallions.textInset ?? defaults.medallions.textInset : 0
  // none at all when it's hidden, so nothing's framed or cleared for it either
  const lettering = showLettering ? letteringFor(`R${hash.slice(2, 9).toUpperCase()}`, denomination, textInset) : []
  // each piece's gears: how far they swing, whether they're smoothed, how much their radia shrink going out, and how
  // they're mirrored, and how much it draws going around its center
  const tune = Object.fromEntries(Object.keys(defaults.amplitude).map(which => [which, {
    gears: gears[which] ?? defaults.gears[which],
    amplitude: amplitude[which] ?? defaults.amplitude[which],
    smoothed: smoothed[which] ?? defaults.smoothed[which],
    radiaChange: radiaChange[which] ?? defaults.radiaChange[which],
    radialDensity: radialDensity[which] ?? defaults.radialDensity[which],
    waveAmplitude: waveAmplitude[which] ?? defaults.waveAmplitude[which],
    curveAmplitude: curveAmplitude[which] ?? defaults.curveAmplitude[which],
    curveHz: curveHz[which] ?? defaults.curveHz[which],
    noise: noise[which] ?? defaults.noise[which],
    noiseSymmetry: noiseSymmetry[which] ?? defaults.noiseSymmetry[which],
    noiseDepth: noiseDepth[which] ?? defaults.noiseDepth[which],
    noiseDetail: noiseDetail[which] ?? defaults.noiseDetail[which],
    noiseSeed: noiseSeed[which] ?? defaults.noiseSeed[which],
    singleLayer: singleLayer[which] ?? defaults.singleLayer[which],
    symmetry: symmetry[which] ?? defaults.symmetry[which],
    starts: starts[which] ?? defaults.starts[which],
  }]))
  // the grids the patterns are repeated over, and the seal, with whatever the console has set
  const gridFor = which => ({
    ...patterns[which],
    ...tune[which],
    columns: columns[which] ?? defaults.columns[which],
    rows: rows[which] ?? defaults.rows[which],
    spacing: spacing[which] ?? patterns[which].spacing,
    size: sizes[which] ?? defaults.size[which],
  })
  const grids = { border: gridFor('border'), field: gridFor('field') }
  const centerpiece = { ...seal, radius: (sizes.seal ?? defaults.size.seal) / 2, spacing: spacing.seal ?? seal.spacing }
  const textFrame = { ...defaults.frames, ...frames }
  const backings = { second: { ...defaults.second, ...second }, third: { ...defaults.third, ...third } }
  const fieldShadow = { ...defaults.shadow, ...shadow }
  const ring = { ...defaults.medallions, ...medallions }

  const { width: W, height: H, strokeWidth } = bill
  const svg = new Svg({ width: W, height: H, background: bill.background })
  // the primary pen is the engraving's ink, and the secondary the seal's accent
  const palette = { ...defaults.colors, ...colors }
  const penFor = name => pen[name] ?? name
  const pens = {
    ink: penFor(palette.primary),
    accent: penFor(palette.secondary),
    display: penFor(palette.display ?? palette.tertiary),
    field: penFor(palette.background ?? palette.primary),
    frame: penFor(palette.frame ?? palette.primary),
    border: penFor(palette.border ?? palette.primary),
    textBorders: penFor(palette.textBorders ?? palette.primary),
    serial: penFor(palette.serial ?? palette.secondary),
    series: penFor(palette.series ?? palette.primary),
  }
  // paths are grouped by pen, stacked in the order each pen is first used, so the shadow's pen gets its group first
  // to sit under everything else
  const shadowStroke = penFor(palette.tertiary)
  // a middle emblem's colorFn, from its settings. k keeps each emblem's random picks its own. it's set on the rosette
  // rather than rolled with it, so changing it doesn't change what else the hash rolls
  const colorSeed = parseInt(hash.slice(10, 18), 16) || 1
  const emblemPens = penColors?.length ? penColors : [pens.ink, pens.accent, shadowStroke]
  const emblemColorFn = (coloring, k) => colorFnFor(coloring, emblemPens, t => createRandom(colorSeed + k * 1000 + t).rnd())
  const emblemSettings = { ...defaults.emblem, ...emblem }
  if (fieldShadow.on) svg.penGroup(shadowStroke)

  const shared = {
    pointCount: layout.pointCount,
    clipStep: layout.clipStep,
    strokeWidth,
    strokeOpacity: bill.strokeOpacity,
  }

  // the frame's rects, going in from the outermost (its line runs half a pen width inside margin, so its ink stops
  // margin short of the note's edge)
  const outermost = bill.margin + strokeWidth / 2
  const bands = times(frame.bands, k => {
    const outer = outermost + k * (frame.width + frame.gap)
    return [outer, outer + frame.width]
  })
  const innermost = bands.at(-1)[1]
  // with the medallions for a border, the bands' rects are left out and the field runs right out to the outermost
  // rect (so it always meets the medallions, however far in they sit). otherwise it starts past the frame's padding
  const medallionBorder = borderKind === 'rosettes'
  const interior = medallionBorder ? outermost : innermost + frame.padding
  // the rects that get drawn
  const frameLines = medallionBorder ? [outermost] : [...bands.flat(), interior]

  // the seal, in its own style. its gears don't have to mirror top to bottom
  const rosetteAt = ({ x, y, radius, pen: which, spacing }, chances, colorFn) => createRosette({
    ...shared,
    ...generateFeatures({
      ...features,
      styleChances: chances,
      palette: [pens[which]],
      gearOptions: { ...gearOptionsFor(features.gearOptions, tune.seal), oddRotations: false },
    }),
    // set after the roll, so they don't change what else gets rolled
    radiaChange: tune.seal.radiaChange,
    radialDensity: tune.seal.radialDensity,
    waveAmplitude: tune.seal.waveAmplitude,
    curveAmplitude: tune.seal.curveAmplitude,
    curveHz: tune.seal.curveHz,
    noise: tune.seal.noise,
    noiseSymmetry: tune.seal.noiseSymmetry,
    noiseDepth: tune.seal.noiseDepth,
    noiseDetail: tune.seal.noiseDetail,
    noiseSeed: tune.seal.noiseSeed,
    singleLayer: tune.seal.singleLayer,
    symmetry: tune.seal.symmetry,
    starts: tune.seal.starts,
    colorFn,
    center: [x, y],
    // a rect base's layers are squares with rounded corners, a radial one's are circles
    base: shape.seal === 'rect' ? rectBase({ exponent: 8 }) : radialBase(),
    spacing,
    minSize: spacing,
    layers: fitWithin(radius),
  })
  const sealRosette = rosetteAt(centerpiece, chances.seal, emblemColorFn(emblemSettings, 0))

  // what the field leaves white: the seal and every line of lettering
  const letterBoxes = lettering.map(({ text, x, y, size, align, font=cutive, room={}, framed=false }) =>
    ({ text, room, framed, ...textBox(text, { x, y, size, align, font }) }))
  // each line's white space, grown by its room where it asks for somewhere to sign: its center and half sizes
  const letterSpace = ({ left, top, right, bottom, room }) => {
    const up = room.up ?? 0
    const before = room.left ?? 0
    const after = room.right ?? 0
    return [(left - before + right + after) / 2, (top - up + bottom) / 2,
            (right + after - left + before) / 2 + halo.lettering, (bottom - top + up) / 2 + halo.lettering]
  }
  // the framed lines' rings: a single ring tracing the edge of the line's white space, on a rectangular base. they all
  // share one set of gears, so they wobble alike
  const frameFeatures = generateFeatures({
    ...features,
    // standard unless it's set, as it draws every layer, so a frame of several rings gets all of them
    style: styles.frames || 'standard',
    palette: [pens.textBorders],
    gearOptions: { ...gearOptionsFor(features.gearOptions, tune.frames), oddRotations: false },
  })
  const rosetteFrames = new Map(letterBoxes.filter(b => b.framed).map(b => {
    const [x, y, hw, hh] = letterSpace(b)
    return [b, createRosette({
      ...shared,
      ...frameFeatures,
      radiaChange: tune.frames.radiaChange,
      radialDensity: tune.frames.radialDensity,
      waveAmplitude: tune.frames.waveAmplitude,
      curveAmplitude: tune.frames.curveAmplitude,
      curveHz: tune.frames.curveHz,
      noise: tune.frames.noise,
      noiseSymmetry: tune.frames.noiseSymmetry,
      noiseDepth: tune.frames.noiseDepth,
      noiseDetail: tune.frames.noiseDetail,
      noiseSeed: tune.frames.noiseSeed,
      singleLayer: tune.frames.singleLayer,
      symmetry: tune.frames.symmetry,
      starts: tune.frames.starts,
      center: [x, y],
      base: rectBase({ exponent: 8, stretch: [hw - hh, 0] }),
      // the outermost ring traces the line's white space, and any others sit inside it
      layers: textFrame.rings,
      minSize: hh - (textFrame.rings - 1) * textFrame.spacing,
      spacing: textFrame.spacing,
    })]
  }))
  // the oval rosettes behind the seal. their gears are rolled whether they're on or not, so turning one on or off
  // leaves everything else as it was
  const backingFeatures = Object.fromEntries(['second', 'third'].map(which => [which, generateFeatures({
    ...features,
    styleChances: chances[which],
    palette: [bill.ink],
    gearOptions: { ...gearOptionsFor(features.gearOptions, tune[which]), oddRotations: false },
  })]))
  // the white space around the lettering, which they stay out of like the field does
  const letterClear = letterBoxes.map(b => b.framed ? rosetteSdf(rosetteFrames.get(b), strokeWidth) : boxSdf(...letterSpace(b)))
  // each one is clipped to outside everything in front of it, so it only shows around it, and to inside the field
  const fieldEdge = interior + strokeWidth
  const inField = boxSdf(W / 2, H / 2, W / 2 - fieldEdge, H / 2 - fieldEdge)
  // what's in front, out to a pen width past its ink and then its own padding, so everything behind it keeps that
  // much white space around it
  const inFront = [growSdf(rosetteSdf(sealRosette, strokeWidth), emblemSettings.padding)]
  const backingRosettes = ['second', 'third'].filter(which => backings[which].on).map(which => {
    const { width, ovalness, spacing: layerSpacing, padding } = backings[which]
    const hw = width / 2
    const hh = hw * (1 - ovalness)
    // ellipses, each inset from the next by the same amount all the way around, filling the oval
    const rosette = createRosette({
      ...shared,
      ...backingFeatures[which],
      radiaChange: tune[which].radiaChange,
      radialDensity: tune[which].radialDensity,
      waveAmplitude: tune[which].waveAmplitude,
      curveAmplitude: tune[which].curveAmplitude,
      curveHz: tune[which].curveHz,
      noise: tune[which].noise,
      noiseSymmetry: tune[which].noiseSymmetry,
      noiseDepth: tune[which].noiseDepth,
      noiseDetail: tune[which].noiseDetail,
      noiseSeed: tune[which].noiseSeed,
      singleLayer: tune[which].singleLayer,
      symmetry: tune[which].symmetry,
      starts: tune[which].starts,
      // its colors are set here rather than in its features, so changing them doesn't change what else the hash rolls
      colorFn: emblemColorFn(backings[which], which === 'second' ? 1 : 2),
      center: [centerpiece.x, centerpiece.y],
      base: rectBase({ exponent: 2, stretch: [hw - hh, 0] }),
      spacing: layerSpacing,
      minSize: layerSpacing,
      layers: fitInside(superellipseSdf(centerpiece.x, centerpiece.y, hw, hh)),
      clip: subtractSdf(inField, ...inFront, ...letterClear),
    })
    inFront.push(growSdf(rosetteSdf(rosette, strokeWidth), padding))
    return rosette
  })

  // around the framed lines, grown by a pen width past the ring, so the field's ink touches it
  const clear = [...inFront, ...letterClear]



  // the frame's bands, over the whole note
  const box = at => boxSdf(W / 2, H / 2, W / 2 - at, H / 2 - at)
  const inBands = unionSdf(...bands.map(([outer, inner]) => {
    const outerBox = box(outer)
    const innerBox = box(inner)
    return (x, y) => max(outerBox(x, y) + strokeWidth, strokeWidth - innerBox(x, y))
  }))


  // the border's gears are rolled here either way, so switching between them doesn't change what else the hash rolls
  const border = medallionBorder
    ? makeMedallions({ ...ring, ...tune.border }, chances.border, shape.border, [W, H], outermost, shared, pens.border)
    : makePattern(grids.border, chances.border, shape.border, [0, 0, W, H], inBands, [], shared, pens.border)
  // the medallions sit on top of everything else: whatever's under them is cut away, padding clear of their ink
  // (as one shape that only measures the medallions near a point, since everything drawn gets checked against it).
  // medallions the same size draw the same thing, so they share the slow part of working out where their ink reaches
  const envelopes = new Map()
  const medallionEnvelope = k => {
    const size = border.radii[k]
    if (!envelopes.has(size)) envelopes.set(size, rosetteEnvelope(border.cells[k]))
    return envelopes.get(size)
  }
  // each one's outline is cut back to where it's drawn (its own share of the ring, where its neighbors' seams cut it
  // off), grown as much, so nothing's cleared where a medallion isn't drawn
  const reachOf = (rosette, k) => {
    const grow = ring.padding + strokeWidth
    const outline = medallionEnvelope(k).at(rosette.config.center, grow)
    const drawn = growSdf(rosette.config.clip, grow)
    return Object.assign((x, y) => max(outline(x, y), drawn(x, y)), { bounds: outline.bounds })
  }
  const covered = medallionBorder ? [boundedUnionSdf(border.cells.map(reachOf))] : []
  const outsideBorder = covered.length ? subtractSdf(() => -Infinity, ...covered) : null
  function drawUnder(rosette) {
    const { clip } = rosette.config
    const underClip = !outsideBorder ? clip : clip ? subtractSdf(clip, ...covered) : outsideBorder
    drawRosette(svg, { ...rosette, config: { ...rosette.config, clip: underClip } })
  }
  if (!medallionBorder) border.cells.forEach(rosette => drawRosette(svg, rosette))

  // the field inside the frame, left white around the seal and the lettering
  const inset = interior + strokeWidth
  const field = makePattern(grids.field, chances.field, shape.field, [inset, inset, W - inset, H - inset], box(inset), clear, shared, pens.field)
  // its shadow goes under it, stopping at the same edges and around the same white space as the field does
  const shadowCopy = fieldShadow.on
    ? shadowPattern(field, [fieldShadow.x, fieldShadow.y], shadowStroke, box(inset), clear)
    : null
  shadowCopy?.cells.forEach(drawUnder)
  field.cells.forEach(drawUnder)

  // the frame's lines, and one around the field (its ink touching the field's), or just the outermost with the
  // medallions
  const rectPoints = at => [[at, at], [W - at, at], [W - at, H - at], [at, H - at]]
  for (const at of frameLines) {
    const clip = at === outermost ? null : outsideBorder
    const path = strokePath(rectPoints(at), { closed: true, clip, step: layout.clipStep })
    if (path) svg.path(path, { stroke: pens.frame, strokeWidth, strokeOpacity: bill.strokeOpacity })
  }

  backingRosettes.forEach(drawUnder)
  drawUnder(sealRosette)
  // the lettering and its frames sit on top of everything, the medallions included
  rosetteFrames.forEach(ring => drawRosette(svg, ring))
  for (const { text, x, y, size, align, pen: which='ink', font=cutive } of lettering) {
    drawText(svg, text, { x, y, size, align, font, stroke: pens[which], strokeWidth, strokeOpacity: bill.strokeOpacity })
  }

  // so the medallions are cut away around the lettering's white space, as the field is
  if (medallionBorder) {
    border.cells.forEach(rosette => drawRosette(svg, { ...rosette, config: { ...rosette.config, clip: subtractSdf(rosette.config.clip, ...letterClear) } }))
  }

  return {
    hash,
    svg,
    colors: palette,
    styles: {
      seal: sealRosette.config.style,
      border: border.style,
      field: field.style,
      second: backingFeatures.second.style,
      third: backingFeatures.third.style,
      frames: frameFeatures.style,
    },
    shapes: shape,
    spacing: { seal: centerpiece.spacing, border: grids.border.spacing, field: grids.field.spacing },
    gears: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.gears])),
    amplitude: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.amplitude])),
    smoothed: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.smoothed])),
    radiaChange: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.radiaChange])),
    radialDensity: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.radialDensity])),
    waveAmplitude: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.waveAmplitude])),
    curveAmplitude: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.curveAmplitude])),
    curveHz: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.curveHz])),
    noise: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.noise])),
    noiseSymmetry: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.noiseSymmetry])),
    noiseDepth: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.noiseDepth])),
    noiseDetail: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.noiseDetail])),
    noiseSeed: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.noiseSeed])),
    singleLayer: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.singleLayer])),
    symmetry: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.symmetry])),
    starts: Object.fromEntries(Object.entries(tune).map(([which, t]) => [which, t.starts])),
    size: { field: grids.field.size, border: grids.border.size, seal: centerpiece.radius * 2 },
    columns: { field: grids.field.columns, border: grids.border.columns },
    rows: { field: grids.field.rows, border: grids.border.rows },
    frames: textFrame,
    emblem: emblemSettings,
    second: backings.second,
    third: backings.third,
    shadow: fieldShadow,
    borderKind,
    medallions: ring,
    denomination,
    seal: sealRosette,
    backings: backingRosettes,
    border,
    field,
    fieldShadow: shadowCopy,
    bands,
    letterBoxes,
    interior,
  }
}
