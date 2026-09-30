import { setSeed, getHash, rnd, rndint, pick, max, times } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, intersectSdf, unionSdf, subtractSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, rosetteSdf, fitWithin, fillPast } from './rosette.js'
import { drawText, textBox } from './type.js'
import { cutive, cutiveOutline } from './cutive.js'

// A paper note: a rosette medallion and a seal on a guilloche field, inside a frame of rosette-pattern bands, with the
// lettering from type.js over it. Each of those picks its own style from the hash (see styles.js). ?hash= remakes one
// (a new one's hash shows up in the url as #hash)
const hash = getHash()
setSeed(hash)


// ---------------------------------------------------------------------------------------------------- settings
// everything is in mm, except where it says layer spacings

const bill = {
  // about banknote proportions
  width: 195,
  height: 82.5,
  background: '#fff',
  // a fine pen, so the patterns stay legible at how dense they are
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
  // the engraving's pen, and the one for the seal and the serials
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
  field: { columns: 7, rows: 3, spacing: 0.875 },
}

// the seal in the middle of the note, as its centerpiece (the field starts 10.4 in from the note's edge, so it sits
// inside that). spacing is how far apart its layers are: close together, so its rings read as dense engraving
const seal = { x: 97.5, y: 43.75, radius: 18.75, pen: 'accent', spacing: 0.875 }

// how much white space the field leaves around the seal, and around the lettering
const halo = { rosettes: 1.25, lettering: 2.75 }

// what style each piece is drawn in, as weights (see styles.js). the patterns stick to the styles that stay mirrored
// top to bottom on odd gears, so a cell's lines still meet its neighbors' at the seams
const styleChances = {
  seal: { standard: 1 },
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
const serial = `R${hash.slice(2, 9).toUpperCase()}`
const lettering = [
  // the denominations are drawn as outlines, so they read as display type against the single lines
  { text: '100', x: 16.25, y: 16.25, size: denominationSize, font: cutiveOutline, framed: true },
  { text: '100', x: 178.75, y: 16.25, size: denominationSize, align: 'right', font: cutiveOutline, framed: true },
  { text: 'REAL WORLD ASSETS', x: 97.5, y: titleY, size: titleSize, align: 'center', framed: true },
  // the series line sits in the bottom right corner, with room to its left to sign
  { text: 'SERIES 2026', x: 178.75, y: 64.375, size: 0.04375, align: 'right', room: { left: 26.875 } },
  // the serial, from the hash
  { text: serial, x: 16.25, y: 64.375, size: 0.05625, pen: 'accent' },
]

const layout = {
  // points around each layer, and how long the short lines curves are drawn as (and lines are cut into pieces this
  // long before clipping)
  pointCount: 900,
  clipStep: 0.5,
}

// each style's settings (styles.js says what they do). lengths are in layer spacings
const styleSettings = {
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
  // rings of waves, three copies of each woven together
  wavy: {
    spacing: 2.4,
    points: 54,
    pointsPerFourLayers: 12,
    pointsPerLayer: 20,
    amplitude: 1.5,
    repeats: 3,
    floor: 0.5,
  },
  // every layer as its own line
  standard: {},
  outwardSpikes: { spacing: 1.5, points: 28, pointsPerLayer: 20, depth: () => rnd(0.7, 0.9) },
  inwardSpikes: { spacing: 1.5, points: 28, pointsPerLayer: 20, bulge: 1, floor: 0.5 },
  ribbons: { lines: () => 60 * rndint(1, 3), minFraction: 0.2 },
}

// the patterns' rosettes are mirrored top to bottom as well as left to right (odd gears, and even swings where the
// style has them), so a cell's lines meet its neighbors' at the seams. the medallion and the seal get their own gears
const features = {
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

const { width: W, height: H, strokeWidth } = bill
const svg = new Svg({ width: W, height: H, background: bill.background })
const pens = { ink: bill.ink, accent: bill.accent }

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
// where the field starts, past the frame's padding
const interior = innermost + frame.padding

// the seal, in its own style. its gears don't have to mirror top to bottom
const rosetteAt = ({ x, y, radius, pen: which, spacing }, chances) => createRosette({
  ...shared,
  ...generateFeatures({
    ...features,
    styleChances: chances,
    palette: [pens[which]],
    gearOptions: { ...features.gearOptions, oddRotations: false },
  }),
  center: [x, y],
  base: radialBase(),
  spacing,
  minSize: spacing,
  layers: fitWithin(radius),
})
const sealRosette = rosetteAt(seal, styleChances.seal)

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
  style: 'single',
  palette: [bill.ink],
  gearOptions: { ...features.gearOptions, radiaMin: 0.015, radiaMax: 0.03, oddRotations: false },
})
const rosetteFrames = new Map(letterBoxes.filter(b => b.framed).map(b => {
  const [x, y, hw, hh] = letterSpace(b)
  return [b, createRosette({
    ...shared,
    ...frameFeatures,
    center: [x, y],
    base: rectBase({ exponent: 8, stretch: [hw - hh, 0] }),
    layers: 1,
    minSize: hh,
  })]
}))
const clear = [
  rosetteSdf(sealRosette, halo.rosettes + strokeWidth),
  // around the framed ones, grown by a pen width past the ring, so the field's ink touches it
  ...letterBoxes.map(b => b.framed ? rosetteSdf(rosetteFrames.get(b), strokeWidth) : boxSdf(...letterSpace(b))),
]

// one rosette repeated in every cell of a grid, each copy filling its cell, cut off at the cell's edges (so a cell's
// lines meet its neighbors' at the seams), and clipped to whatever else is passed in
function drawPattern({ columns, rows, spacing }, [x0, y0, x1, y1], clip, holes=[]) {
  const patternFeatures = generateFeatures({ ...features, styleChances: styleChances.pattern, palette: [bill.ink] })
  const cellW = (x1 - x0) / columns
  const cellH = (y1 - y0) / rows
  const base = pick({ radial: 1, rect: 1 }) === 'rect'
    ? rectBase({ exponent: 8, stretch: [max(0, cellW - cellH) / 2, max(0, cellH - cellW) / 2] })
    : radialBase()

  const cells = times(rows, row => times(columns, column => {
    const center = [x0 + cellW * (column + 0.5), y0 + cellH * (row + 0.5)]
    const cell = boxSdf(...center, cellW / 2, cellH / 2)
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
    drawRosette(svg, rosette)
    return rosette
  })).flat()

  return { style: patternFeatures.style, cells }
}

// the frame's bands, over the whole note
const box = at => boxSdf(W / 2, H / 2, W / 2 - at, H / 2 - at)
const inBands = unionSdf(...bands.map(([outer, inner]) => {
  const outerBox = box(outer)
  const innerBox = box(inner)
  return (x, y) => max(outerBox(x, y) + strokeWidth, strokeWidth - innerBox(x, y))
}))
const border = drawPattern(patterns.border, [0, 0, W, H], inBands)

// the field inside the frame, left white around the seal and the lettering
const inset = interior + strokeWidth
const field = drawPattern(patterns.field, [inset, inset, W - inset, H - inset], box(inset), clear)

// the frame's lines, and one around the field (its ink touching the field's)
const rectPath = at => `M ${at},${at} ${W - at},${at} ${W - at},${H - at} ${at},${H - at} Z`
for (const at of [...bands.flat(), interior]) {
  svg.path(rectPath(at), { stroke: bill.ink, strokeWidth, strokeOpacity: bill.strokeOpacity })
}

drawRosette(svg, sealRosette)
rosetteFrames.forEach(ring => drawRosette(svg, ring))

for (const { text, x, y, size, align, pen: which='ink', font=cutive } of lettering) {
  drawText(svg, text, { x, y, size, align, font, stroke: pens[which], strokeWidth, strokeOpacity: bill.strokeOpacity })
}

console.log({
  hash,
  styles: {
    seal: sealRosette.config.style,
    border: border.style,
    field: field.style,
  },
  seal: sealRosette,
  border,
  field,
  bands,
  letterBoxes,
  interior,
})

svg.mount()

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
