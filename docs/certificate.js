import { setSeed, getHash, rnd, rndint, pick, max, times } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, intersectSdf, unionSdf, subtractSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, rosetteSdf, fitWithin, fillPast } from './rosette.js'
import { drawText, textBox } from './type.js'
import { cutive, cutiveOutline } from './cutive.js'

// A paper note: a rosette seal and an emblem on a guilloche field, inside a frame of rosette-pattern bands, with the
// lettering from type.js over it. Each of those picks its own style from the hash (see styles.js). ?hash= remakes one
// (a new one's hash shows up in the url as #hash)
const hash = getHash()
setSeed(hash)


// ---------------------------------------------------------------------------------------------------- settings
// everything is in mm, except where it says layer spacings

const bill = {
  // about banknote proportions
  width: 279,
  height: 216,
  background: '#fff',
  // a fine pen, so the patterns stay legible at how dense they are
  strokeWidth: .45,
  strokeOpacity: 0.9,
  // the engraving's pen, and the one for the emblem and the serials
  ink: pen.black,
  accent: pen.green,
  // how far short of the note's edge the ink stops
  margin: 4,
}

const frame = {
  // bands of pattern around the note, each between a pair of rects, going in
  bands: 1,
  width: 3,
  gap: 2.5,
  // white space between the innermost band and the field
  padding: 2.5,
}

// the two patterns of repeated rosettes: a coarser one in the frame's bands, a finer one across the note
const patterns = {
  border: { columns: 8, rows: 3, spacing: 1.7 },
  field: { columns: 7, rows: 4, spacing: 1.5 },
}

// the seal left of center and the emblem on the right, both down in the body of the sheet so the header has the
// top band to itself (the field starts 9.7mm in from each edge). spacing is how far apart their layers are: the
// emblem's are close together, so its rings read as dense engraving
const seal = { x: 90, y: 105, radius: 30, pen: 'ink', spacing: 3.4 }
const emblem = { x: 200, y: 110, radius: 21, pen: 'accent', spacing: 1.2 }

// the denominations in the top corners, framed like the title (see lettering below), a little in from the field's
// edge
const denomination = { text: '100', size: 0.15, inset: 5 }

// how much white space the field leaves around the seal and the emblem, and around the lettering. The field is
// dense, so the text needs a real gap around it or it disappears into the pattern
const halo = { rosettes: 3, lettering: 4.5 }

// where the denominations' text starts, down from the top and in from either side: past the frame's band and padding
// (to the inside of the field's edge line), their inset, the rect's pen, and their white space
const denominationInset = bill.margin + bill.strokeWidth + frame.bands * frame.width + (frame.bands - 1) * frame.gap +
  frame.padding + denomination.inset + bill.strokeWidth / 2 + halo.lettering
const denominationMiddle = denominationInset + cutiveOutline.glyphHeight * denomination.size / 2

// what style each piece is drawn in, as weights (see styles.js). the patterns stick to the styles that stay mirrored
// top to bottom on odd gears, so a cell's lines still meet its neighbors' at the seams
// const styleChances = {
//   seal: { numismatic: 4, wavy: 2, standard: 2, inwardSpikes: 1, outwardSpikes: 1, ribbons: 1 },
//   emblem: { numismatic: 4, wavy: 2, standard: 2, outwardSpikes: 1 },
//   pattern: { numismatic: 4, wavy: 2, standard: 1 },
// }
const styleChances = {
  seal: { numismatic: 1 },
  emblem: { standard: 1 },
  // pattern: { outwardSpikes: 1 },
  pattern: { inwardSpikes: 1 },
}

// The lettering, in cutive (single line, uppercase and digits only -- see cutive.js). x and y are its left and top,
// align moves it, and size scales the glyphs (58 tall at 1, so 0.09 is about 5mm). It's drawn with the same pen as
// everything else.
//
// Laid out on the sheet: the centre line is W/2 and the text sits inside the frame, which ends at `interior`.
// room is extra white space cleared above a line: the series line uses it to leave somewhere to sign. framed draws a
// frame around the white space ('rect' for a straight line, 'rosette' for a single rectangular rosette ring, its line
// wobbled by gears), and the field stops right where its ink does
const series = { text: 'SERIES 2026', x: 26, y: 196, size: 0.05, room: 18 }
// the middle of the white space the series line clears (its room included), and where a line of text at size would
// start so it's centered on it
const seriesMiddle = series.y + (cutive.glyphHeight * series.size - series.room) / 2
const levelWithSeries = size => seriesMiddle - cutive.glyphHeight * size / 2

const titleSize = 0.145
const lettering = [
  // the title and the denominations are drawn in outlines, so they read as display type against the single lines. the
  // title is centered on the denominations
  { text: 'REAL WORLD ASSETS', x: 139.5, y: denominationMiddle - cutiveOutline.glyphHeight * titleSize / 2,
    size: titleSize, align: 'center', font: cutiveOutline, framed: 'rosette' },
  { text: denomination.text, x: denominationInset, y: denominationInset, size: denomination.size,
    font: cutiveOutline, framed: 'rosette' },
  { text: denomination.text, x: bill.width - denominationInset, y: denominationInset, size: denomination.size,
    align: 'right', font: cutiveOutline, framed: 'rosette' },
  { text: 'ONE HUNDRED SHARES', x: 139.5, y: levelWithSeries(0.075), size: 0.075, align: 'center', framed: 'rosette' },
  series,
  // the serial, from the hash
  { text: `R${hash.slice(2, 9).toUpperCase()}`, x: 253, y: levelWithSeries(0.07), size: 0.07, align: 'right', pen: 'accent' },
]

const layout = {
  // points around each layer, and how long the short lines curves are drawn as (and lines are cut into pieces this
  // long before clipping)
  pointCount: 900,
  clipStep: 0.4,
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
  // short arcs scattered all over
  fragmented: { fragmentsPerLayer: () => rnd(15, 35), length: [0.01, 0.1] },
  // dashed layers
  dashed: { points: 32, pointsPerLayer: 10 },
}

// the patterns' rosettes are mirrored top to bottom as well as left to right (odd gears, and even swings where the
// style has them), so a cell's lines meet its neighbors' at the seams. the seal and the emblem get their own gears
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

// the seal and the emblem, each in its own style. their gears don't have to mirror top to bottom
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
const emblemRosette = rosetteAt(emblem, styleChances.emblem)

// what the field leaves white: the seal, the emblem, and every line of lettering
const letterBoxes = lettering.map(({ text, x, y, size, align, font=cutive, room=0, framed=null }) =>
  ({ text, room, framed, ...textBox(text, { x, y, size, align, font }) }))
// each line's white space, grown upward by its room where it asks for somewhere to sign: its center and half sizes
const letterSpace = ({ left, top, right, bottom, room }) => [
  (left + right) / 2, (top - room + bottom) / 2,
  (right - left) / 2 + halo.lettering, (bottom - top + room) / 2 + halo.lettering,
]
// the rosette frames: a single ring tracing the edge of the line's white space, on a rectangular base. they all share
// one set of gears, so they wobble alike
const frameFeatures = generateFeatures({
  ...features,
  style: 'single',
  palette: [bill.ink],
  gearOptions: { ...features.gearOptions, radiaMin: 0.015, radiaMax: 0.03, oddRotations: false },
})
const rosetteFrames = new Map(letterBoxes.filter(b => b.framed === 'rosette').map(b => {
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
  rosetteSdf(emblemRosette, halo.rosettes + strokeWidth),
  // around the framed ones, grown by a pen width past the frame, so the field's ink touches the frame's
  ...letterBoxes.map(b => {
    if (b.framed === 'rosette') return rosetteSdf(rosetteFrames.get(b), strokeWidth)
    const [x, y, hw, hh] = letterSpace(b)
    const grow = b.framed ? strokeWidth : 0
    return boxSdf(x, y, hw + grow, hh + grow)
  }),
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

// the field inside the frame, left white around the seal, the emblem, and the lettering
const inset = interior + strokeWidth
const field = drawPattern(patterns.field, [inset, inset, W - inset, H - inset], box(inset), clear)

// the frame's lines, and one around the field (its ink touching the field's)
const rectPath = at => `M ${at},${at} ${W - at},${at} ${W - at},${H - at} ${at},${H - at} Z`
for (const at of [...bands.flat(), interior]) {
  svg.path(rectPath(at), { stroke: bill.ink, strokeWidth, strokeOpacity: bill.strokeOpacity })
}

drawRosette(svg, sealRosette)
drawRosette(svg, emblemRosette)

// the framed lines' frames
for (const [x, y, hw, hh] of letterBoxes.filter(b => b.framed === 'rect').map(letterSpace)) {
  svg.path(`M ${x - hw},${y - hh} ${x + hw},${y - hh} ${x + hw},${y + hh} ${x - hw},${y + hh} Z`,
           { stroke: bill.ink, strokeWidth, strokeOpacity: bill.strokeOpacity })
}
rosetteFrames.forEach(ring => drawRosette(svg, ring))

for (const { text, x, y, size, align, pen: which='ink', font=cutive } of lettering) {
  drawText(svg, text, { x, y, size, align, font, stroke: pens[which], strokeWidth, strokeOpacity: bill.strokeOpacity })
}

console.log({
  hash,
  styles: {
    seal: sealRosette.config.style,
    emblem: emblemRosette.config.style,
    border: border.style,
    field: field.style,
  },
  seal: sealRosette,
  emblem: emblemRosette,
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
