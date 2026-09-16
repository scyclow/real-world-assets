import { setSeed, getHash, rnd, rndint, prb, sample, pick, chance, sin } from './utils.js'
import { pen, penColorsOnWhite } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, subtractSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, rosetteSdf, fitWithin, fillPast } from './rosette.js'

// ?hash= remakes a piece (a new one's hash shows up in the url as #hash). ?style= and ?bgStyle= pick the rosettes'
// styles, and ?bg=rect or ?bg=radial the bg's base
const params = new URLSearchParams(window.location.search)
const hash = getHash()
setSeed(hash)


// ---------------------------------------------------------------------------------------------------- settings
// everything is in svg units, except where it says layer spacings

const canvas = {
  size: 150,
  background: '#fff',
  strokeWidth: 1,
  strokeOpacity: 0.9,
}

const layout = {
  // how far apart the layers are
  spacing: 3.5,
  // the primary's ink stays within this far of the center
  primaryRadius: 65,
  // how far short of the canvas edge the bg's ink stops
  margin: 5,
  // how far the bg's ink stays from the primary's
  gap: 2,
  // how far a shadow is nudged over, in layer spacings
  shadowOffset: 1 / 6,
  // points around each layer
  pointCount: 1200,
  // lines are cut into pieces this long before clipping, so none skip over the clip's edge
  clipStep: 0.5,
}

// the broad shapes a rosette can have (see bases.js)
const bases = {
  radial: radialBase(),
  rect: rectBase({ exponent: 8 }),
}

// how likely each style is, as weights (rosette2.js's odds; the ones at 0 were unfinished or turned off there)
const styleChances = {
  standard: 30,
  lines: 2,
  grid: 5,
  fragmented: 10,
  spiral: 0,
  outwardSpikes: 5,
  inwardSpikes: 5,
  wavy: 10,
  numismatic: 10,
  circles: 2,
  heterocircles: 1,
  ribbons: 5,
  blocks: 2,
  dashed: 2,
  mixed: 0,
  wavyRibbons: 0,
  horizontalDashes: 1,
  single: 0,
}

// each style's settings (styles.js says what they do). lengths are in layer spacings. () => value gets picked once per
// rosette, and a [min, max] range separately for each piece the style draws
const waveSettings = { spacing: 2.4, points: 54, pointsPerFourLayers: 12, pointsPerLayer: 20, amplitude: 1.5, repeats: 1, floor: 0.5 }
const circleSettings = {
  shape: () => sample(['circle', 'square', 'rosette']),
  radius: 1 / 12,
  points: 14,
  pointsPerLayer: 5,
  pointMult: () => prb(0.5) ? rnd(1, 4) : 1,
  symbolRadius: 0.28,
  symbolGears: { count: 7, rotationMax: 15, radiaMax: 0.1 },
}
const styleSettings = {
  standard: {},
  lines: { lines: () => 100 * rndint(1, 8) },
  grid: { lines: () => 100 * rndint(1, 4) },
  fragmented: { fragmentsPerLayer: () => rnd(15, 35), length: [0.01, 0.1] },
  spiral: { spirals: 4, turns: [2, 6] },
  outwardSpikes: { spacing: 1.5, points: 28, pointsPerLayer: 20, depth: () => rnd(0.7, 0.9) },
  inwardSpikes: { spacing: 1.5, points: 28, pointsPerLayer: 20, bulge: 1, floor: 0.5 },
  // copies of each ring: 1 half the time, 2 30% of the time, 3 20% of the time
  wavy: { ...waveSettings, repeats: () => chance([50, 1], [30, 2], [20, 3]) },
  numismatic: { amplitude: 2.25, shrink: 1, minAmplitude: 0.7, overlap: 0.25, oscillations: 35, oscillationsPerLayer: 0, minWavelength: 1.25, repeats: 6, spread: 1, curve: 1, floor: 1.2 },
  circles: circleSettings,
  heterocircles: { ...circleSettings, pointMult: [1, 5] },
  ribbons: { lines: () => 100 * rndint(1, 4), minFraction: 0.2 },
  blocks: { points: 150 },
  dashed: { points: 32, pointsPerLayer: 10 },
  mixed: { ...waveSettings, points: 102, pointsPerFourLayers: 0, circlePoints: 102, circlesPerLayer: 1, radius: 1 / 12, skipOuter: 2 },
  wavyRibbons: { ...waveSettings, spacing: 1.92, points: 102, pointsPerFourLayers: 0, ringEvery: 4 },
  horizontalDashes: { points: 14, pointsPerLayer: 5, length: 1 },
  single: {},
}

// the odds and ranges behind every rosette's features (see features.js)
const features = {
  styleChances,
  styleSettings,
  // the pens a palette is picked from, and how many it gets
  pens: penColorsOnWhite,
  paletteSize: 3,
  // where the gears start turning: fixed and even keep the rosette mirrored left/right, wonky doesn't
  gearStartChances: { fixed: 50, even: 45, wonky: 5 },
  // the gears riding on the base gear: how many, how fast they turn at most, and how big they get at most (as a
  // fraction of each layer's size)
  gearOptions: { count: 7, rotationMax: 15, radiaMax: 0.1 },
  // the styles that can get a shadow, a second set of gears, or irregular spacing
  ribbedStyles: ['standard'],
  shadowChance: 0.07,
  multipleChance: 0.07,
  irregularSpacingChance: 0.25,
  // how far each layer t is turned, in degrees (in a random direction)
  spiralChances: [
    [1, () => 0],
    [1, t => t * 1.5],
    [1, t => t * sin(t / 4) * 0.25],
  ],
  // how much the gears' radia shift from the innermost layer to the outermost
  radiaChangeChance: 0.25,
  radiaChangeRange: [0.005, 0.1],
  // lines out through the outer layers on wilder gears (see auraStrokes in styles.js)
  auraChance: 0.05,
  auraSettings: { from: 2 / 3, to: 0.93, lines: 100, radiaShift: 0.2 },
}

// one pen each, either way around
const [primaryPen, bgPen] = prb(0.5) ? [pen.red, pen.blue] : [pen.blue, pen.red]

const primarySettings = {
  base: 'radial',
  features: {
    ...features,
    palette: [primaryPen],
    style: params.get('style') ?? undefined,
  },
}

const bgSettings = {
  base: params.get('bg') ?? pick({ rect: 1, radial: 1 }),
  features: {
    ...features,
    palette: [bgPen],
    style: params.get('bgStyle') ?? undefined,
    // its layers are big, so its wiggles are kept small enough for the base shape to show through
    gearOptions: { ...features.gearOptions, radiaMax: 0.04 },
  },
}


// ---------------------------------------------------------------------------------------------------- drawing

const center = [canvas.size / 2, canvas.size / 2]
const svg = new Svg({ width: canvas.size, height: canvas.size, background: canvas.background })

// shared by both rosettes
const rosette = {
  center,
  spacing: layout.spacing,
  minSize: layout.spacing,
  shadowOffset: layout.shadowOffset,
  pointCount: layout.pointCount,
  clipStep: layout.clipStep,
  strokeWidth: canvas.strokeWidth,
  strokeOpacity: canvas.strokeOpacity,
}

const primary = createRosette({
  ...rosette,
  ...generateFeatures(primarySettings.features),
  base: bases[primarySettings.base],
  layers: fitWithin(layout.primaryRadius),
})

// the canvas, pulled in so the bg's ink (pen width included) stops margin short of its edge
const pull = layout.margin + canvas.strokeWidth / 2
const border = boxSdf(...center, canvas.size / 2 - pull, canvas.size / 2 - pull)

const bg = createRosette({
  ...rosette,
  ...generateFeatures(bgSettings.features),
  base: bases[bgSettings.base],
  // enough layers that the outermost one lies entirely past the border, so the bg fills the whole canvas
  layers: fillPast(border),
  // cut around the primary: everything within its reach, plus the gap and both half pen widths
  clip: subtractSdf(border, rosetteSdf(primary, layout.gap + canvas.strokeWidth)),
})

console.log({ hash, primaryStyle: primary.config.style, bgStyle: bg.config.style, bgBase: bgSettings.base, primary, bg })

drawRosette(svg, bg)
drawRosette(svg, primary)
svg.mount()

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
