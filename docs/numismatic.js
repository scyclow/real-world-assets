import { setSeed, getHash, prb, pick } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, subtractSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, rosetteSdf, fitWithin, fillPast } from './rosette.js'

// index.js's piece in the numismatic style throughout: a numismatic primary in the center, over a numismatic bg that
// fills the rest of the canvas, cut away around the primary. it's sized and penned like borderedRosette.js, so the
// wiggles come out at the same scale and the fine pen keeps the dense middles open. ?hash= remakes a piece (a new
// one's hash shows up in the url as #hash), and ?bg=rect or ?bg=radial picks the bg's base
const params = new URLSearchParams(window.location.search)
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

const layout = {
  // how far apart the layers are
  spacing: 3.5,
  // the primary's ink stays within this far of the center
  primaryRadius: 65,
  // how far short of the canvas edge the bg's ink stops
  margin: 5,
  // how far the bg's ink stays from the primary's
  gap: 2,
  // points around each layer
  pointCount: 1200,
  // curves are drawn as short lines about this long (and lines are cut into pieces this long before clipping)
  clipStep: 0.5,
}

// the broad shapes the bg can have (see bases.js)
const bases = {
  radial: radialBase(),
  rect: rectBase({ exponent: 8 }),
}

// see numismatic in styles.js. borderedRosette.js's settings, at the same layer spacing, so the layers pack in and
// swing exactly as far as they do there
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
  // copies of the ring in each layer, and how much of one swing they're spread across (1 spreads them evenly)
  repeats: 6,
  spread: 1,
  // how curved the lines between points are: 0 straight, 1 smooth curves through every point
  curve: 1,
  // how close to the center the layers get, in layer spacings of size. any layer that would swing in past it is left
  // out
  floor: 1.2,
}

// what both rosettes share (see features.js). only their pens, gears, and bases differ
const features = {
  style: 'numismatic',
  styleSettings: { numismatic },
  // where the gears start turning: fixed and even keep the rosette mirrored left/right, wonky doesn't
  gearStartChances: { fixed: 50, even: 45, wonky: 5 },
  // how much the gears' radia shift from the innermost layer to the outermost
  radiaChangeChance: 0,
  radiaChangeRange: [0.005, 0.1],
  // only the standard style uses these
  ribbedStyles: [],
  spiralChances: [[1, () => 0]],
  aura: false,
}

// one pen each, either way around
const [primaryPen, bgPen] = prb(0.5) ? [pen.red, pen.blue] : [pen.blue, pen.red]

const primarySettings = {
  base: 'radial',
  features: {
    ...features,
    palette: [primaryPen],
    // borderedRosette.js's gears: how many, how many times they turn (at least and at most), and how big they get (as
    // a fraction of each layer's size). two gentle gears that always turn
    gearOptions: { count: 2, rotationMin: 1, rotationMax: 16, radiaMin: 0.06, radiaMax: 0.12 },
  },
}

const bgSettings = {
  base: params.get('bg') ?? pick({ rect: 1, radial: 1 }),
  features: {
    ...features,
    palette: [bgPen],
    // its layers are big, so its wiggles are kept small enough for the base shape to show through
    gearOptions: { count: 2, rotationMin: 1, rotationMax: 16, radiaMin: 0.02, radiaMax: 0.05 },
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

console.log({ hash, bgBase: bgSettings.base, primary, bg })

drawRosette(svg, bg)
drawRosette(svg, primary)
svg.mount()

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
