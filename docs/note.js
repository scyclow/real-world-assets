import { rnd, rndint, pick, max, hypot, times } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, intersectSdf, unionSdf, subtractSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, rosetteSdf, fitWithin, fillPast } from './rosette.js'
import { drawText, textBox } from './type.js'
import { cutive } from './cutive.js'

// The parts every one of these notes is made of, so a drawing is just its layout (see heads.js and tails.js):
// a guilloche field inside a frame of rosette-pattern bands, rosettes over it, and lettering over that, each line
// free to carry a frame of its own. Everything is in mm, except where it says layer spacings.
//
// Laid out on the sheet: the field starts at `interior`, which is the margin, the frame's bands and its padding.
// drawNote returns that, along with everything it drew, so a layout can measure against it

// each style's settings (styles.js says what they do). lengths are in layer spacings
export const styleSettings = {
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
  wavy: { spacing: 2.4, points: 54, pointsPerFourLayers: 12, pointsPerLayer: 20, amplitude: 1.5, repeats: 3, floor: 0.5 },
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
// style has them), so a cell's lines meet its neighbors' at the seams. the note's own rosettes get their own gears
export const features = {
  styleSettings,
  gearStart: 'fixed',
  // how many, how many times they turn (at least and at most), and how big they get (as a fraction of each layer's
  // size): two gentle gears that always turn
  gearOptions: { count: 2, rotationMin: 1, rotationMax: 16, radiaMin: 0.06, radiaMax: 0.12, oddRotations: true },
  radiaChangeChance: 0,
  radiaChangeRange: [0.005, 0.1],
  // only the standard style uses these
  ribbedStyles: [],
  spiralChances: [[1, () => 0]],
  aura: false,
}

// the gears a frame's ring rides on: gentle, so it stays a ring with room for the lettering inside
const frameGears = { radiaMin: 0.015, radiaMax: 0.03, oddRotations: false }

export const noteDefaults = {
  sheet: {
    // about banknote proportions
    width: 195,
    height: 82.5,
    background: '#fff',
    // a fine pen, so the patterns stay legible at how dense they are
    strokeWidth: 0.3,
    strokeOpacity: 0.9,
    // the engraving's pen, and the one for the seals and the serials
    ink: pen.black,
    accent: pen.green,
    // how far short of the note's edge the ink stops
    margin: 5,
  },
  frame: {
    // bands of pattern around the note, each between a pair of rects, going in
    bands: 1,
    width: 3.75,
    gap: 1.5,
    // white space between the innermost band and the field
    padding: 1.5,
  },
  // the two patterns of repeated rosettes: a coarser one in the frame's bands, a finer one across the note
  patterns: {
    border: { columns: 8, rows: 3, spacing: 2.125 },
    field: { columns: 7, rows: 3, spacing: 0.875 },
  },
  // how much white space the field leaves around the rosettes, and around the lettering
  halo: { rosettes: 1.25, lettering: 2.75 },
  layout: {
    // points around each layer, and how long the short lines curves are drawn as (and lines are cut into pieces this
    // long before clipping)
    pointCount: 900,
    clipStep: 0.5,
  },
  // what style the patterns are drawn in, as weights (see styles.js). the patterns stick to the styles that stay
  // mirrored top to bottom on odd gears, so a cell's lines still meet its neighbors' at the seams
  pattern: { inwardSpikes: 1 },
  features,
  rosettes: [],
  lettering: [],
}

// the size a line's frame is built at: a round one clears the corners of its white space, and a rectangular one is
// stretched out to the sides, so its size is how far it reaches up and down
const frameReach = ([, , hw, hh], framed) => framed === 'circle' ? hypot(hw, hh) : hh

export function drawNote(spec) {
  const sheet = { ...noteDefaults.sheet, ...spec.sheet }
  const frame = { ...noteDefaults.frame, ...spec.frame }
  const patterns = { ...noteDefaults.patterns, ...spec.patterns }
  const halo = { ...noteDefaults.halo, ...spec.halo }
  const layout = { ...noteDefaults.layout, ...spec.layout }
  const pattern = spec.pattern ?? noteDefaults.pattern
  const noteFeatures = { ...features, ...spec.features }

  const { width: W, height: H, strokeWidth } = sheet
  const svg = new Svg({ width: W, height: H, background: sheet.background })
  const pens = { ink: sheet.ink, accent: sheet.accent }

  const shared = {
    pointCount: layout.pointCount,
    clipStep: layout.clipStep,
    strokeWidth,
    strokeOpacity: sheet.strokeOpacity,
  }

  // the frame's rects, going in from the outermost (its line runs half a pen width inside margin, so its ink stops
  // margin short of the note's edge), and where the field starts past the frame's padding
  const outermost = sheet.margin + strokeWidth / 2
  const bands = times(frame.bands, k => {
    const outer = outermost + k * (frame.width + frame.gap)
    return [outer, outer + frame.width]
  })
  const interior = bands.at(-1)[1] + frame.padding

  // every line's white space, grown by any room it asks for beside or above it (somewhere to sign): its center and
  // half sizes
  const letterBoxes = (spec.lettering ?? []).map(line => {
    const { text, x, y, size, align, font = cutive, room = {}, framed = null, rule = false } = line
    return { ...line, text, room, framed, rule, font, ...textBox(text, { x, y, size, align, font }) }
  })
  const letterSpace = ({ left, top, right, bottom, room }) => {
    const up = room.up ?? 0
    const before = room.left ?? 0
    const after = room.right ?? 0
    return [(left - before + right + after) / 2, (top - up + bottom) / 2,
            (right + after - left + before) / 2 + halo.lettering, (bottom - top + up) / 2 + halo.lettering]
  }

  // the framed lines' frames. 'rect' is a plain rect around the white space; 'rosette' is a single rectangular ring
  // and 'circle' a round one, both wobbled by their gears. the rings all share one set, so they wobble alike
  const frameFeatures = generateFeatures({
    ...noteFeatures,
    // standard draws every layer, so a frame asking for rings gets all of them
    style: 'standard',
    palette: [sheet.ink],
    gearOptions: { ...noteFeatures.gearOptions, ...frameGears },
  })
  const frames = new Map(letterBoxes.filter(b => b.framed && b.framed !== 'rect').map(b => {
    const space = letterSpace(b)
    const [x, y, hw, hh] = space
    // a round frame clears the corners of the white space; a rectangular one traces its edge
    const base = b.framed === 'circle' ? radialBase() : rectBase({ exponent: 8, stretch: [hw - hh, 0] })
    return [b, createRosette({
      ...shared,
      ...frameFeatures,
      center: [x, y],
      base,
      // rings of them, where the line asks for more than one
      layers: b.rings ?? 1,
      minSize: frameReach(space, b.framed) - ((b.rings ?? 1) - 1) * (b.ringGap ?? 1.2),
      spacing: b.ringGap ?? 1.2,
    })]
  }))

  // the lettering's white space, which the rosettes stop at too, so a banner reads over one
  const letterHoles = letterBoxes.map(b => {
    if (frames.has(b)) return rosetteSdf(frames.get(b), strokeWidth)
    const [x, y, hw, hh] = letterSpace(b)
    const grow = b.framed ? strokeWidth : 0
    return boxSdf(x, y, hw + grow, hh + grow)
  })
  const outsideLettering = subtractSdf(() => -Infinity, ...letterHoles)

  // the note's own rosettes, each in its own style. their gears don't have to mirror top to bottom, and the ones
  // sharing a group (a pair either side of the middle, say) are drawn from one set, so they come out alike
  const groups = new Map()
  const rosetteFeatures = r => {
    if (r.group && groups.has(r.group)) return groups.get(r.group)
    const rolled = generateFeatures({
      ...noteFeatures,
      styleChances: r.chances,
      palette: [pens[r.pen ?? 'ink']],
      gearOptions: { ...noteFeatures.gearOptions, oddRotations: false },
    })
    if (r.group) groups.set(r.group, rolled)
    return rolled
  }
  const rosettes = (spec.rosettes ?? []).map(r => ({
    ...r,
    rosette: createRosette({
      ...shared,
      ...rosetteFeatures(r),
      center: [r.x, r.y],
      base: radialBase(),
      spacing: r.spacing,
      minSize: r.spacing,
      layers: fitWithin(r.radius),
      clip: outsideLettering,
    }),
  }))

  // what the field leaves white: the rosettes, and every line's space (out past its frame, and a pen width more, so
  // the field's ink touches the frame's)
  const clear = [
    ...rosettes.map(({ rosette }) => rosetteSdf(rosette, halo.rosettes + strokeWidth)),
    ...letterHoles,
  ]

  // one rosette repeated in every cell of a grid, each copy filling its cell, cut off at the cell's edges (so a
  // cell's lines meet its neighbors' at the seams), and clipped to whatever else is passed in
  function drawPattern({ columns, rows, spacing }, [x0, y0, x1, y1], clip, holes = []) {
    const patternFeatures = generateFeatures({ ...noteFeatures, styleChances: pattern, palette: [sheet.ink] })
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

  // the field inside the frame, left white around the rosettes and the lettering
  const inset = interior + strokeWidth
  const field = drawPattern(patterns.field, [inset, inset, W - inset, H - inset], box(inset), clear)

  // the frame's lines, and one around the field (its ink touching the field's)
  const rectPath = at => `M ${at},${at} ${W - at},${at} ${W - at},${H - at} ${at},${H - at} Z`
  for (const at of [...bands.flat(), interior]) {
    svg.path(rectPath(at), { stroke: sheet.ink, strokeWidth, strokeOpacity: sheet.strokeOpacity })
  }

  rosettes.forEach(({ rosette }) => drawRosette(svg, rosette))

  // the plain rects, then the rings
  for (const b of letterBoxes.filter(b => b.framed === 'rect')) {
    const [x, y, hw, hh] = letterSpace(b)
    svg.path(`M ${x - hw},${y - hh} ${x + hw},${y - hh} ${x + hw},${y + hh} ${x - hw},${y + hh} Z`,
             { stroke: sheet.ink, strokeWidth, strokeOpacity: sheet.strokeOpacity })
  }
  frames.forEach(ring => drawRosette(svg, ring))

  // a line to sign on, right above the lines that ask for one
  for (const b of letterBoxes.filter(b => b.rule)) {
    const [x, , hw] = letterSpace(b)
    const at = b.top - halo.lettering / 2
    svg.path(`M ${x - hw + halo.lettering},${at} ${x + hw - halo.lettering},${at}`,
             { stroke: sheet.ink, strokeWidth, strokeOpacity: sheet.strokeOpacity })
  }

  for (const { text, x, y, size, align, pen: which = 'ink', font = cutive } of letterBoxes) {
    drawText(svg, text, { x, y, size, align, font, stroke: pens[which], strokeWidth, strokeOpacity: sheet.strokeOpacity })
  }

  svg.mount()

  return { svg, interior, bands, rosettes, letterBoxes, frames, styles: { border: border.style, field: field.style } }
}

// A note's own rosettes and lettering are where the layouts differ; these are the pieces they share.
// A counter: a denomination in a round frame, the way a note's corners carry one
export const counter = (text, x, y, size, extra = {}) =>
  ({ text, x: x, y: y - 58 * size / 2, size, align: 'center', framed: 'circle', ...extra })

// A banner: a line of lettering in a rectangular ring, for a title or a legend
export const banner = (text, x, y, size, extra = {}) =>
  ({ text, x, y, size, align: 'center', framed: 'rosette', ...extra })
