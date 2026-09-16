import { $ } from './$.js'
import { setSeed, getHash, chance, pick } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, subtractSdf } from './sdf.js'
import { generateGears } from './gears.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, rosetteSdf, fitWithin, fillPast } from './rosette.js'

// The same rosette in the numismatic and wavy styles, side by side, each over the same numismatic bg rosette. ?hash=
// remakes a pair (a new one's hash shows up in the url as #hash), and ?bg=rect or ?bg=radial picks the bg's base
const params = new URLSearchParams(window.location.search)
const hash = getHash()


// ---------------------------------------------------------------------------------------------------- settings
// everything is in svg units, except where it says layer spacings

const canvas = {
  size: 150,
  background: '#fff',
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
  // how wide each one shows on the page
  displayWidth: 'min(46vw, 85vh)',
}

const layout = {
  // how far apart the layers are
  spacing: 3.5,
  // the primary's ink stays within this far of the center
  radius: 65,
  // how far short of the canvas edge the bg's ink stops
  margin: 5,
  // how far the bg's ink stays from the primary's (0 runs it right up to the primary's ink)
  gap: 0,
  // points around each layer
  pointCount: 1200,
  // curves are drawn as short lines about this long (and lines are cut into pieces this long before clipping)
  clipStep: 0.5,
}

// see numismatic in styles.js. these start out like the numismatic rosettes in fake-internet-money
const numismatic = {
  // how far the outermost layer's points swing in and out, in layer spacings of size
  amplitude: 2.25,
  // how much the swing shrinks going in: 0 keeps it the same, 1 shrinks it in step with the layer's size
  shrink: 1,
  // the least it shrinks to, in layer spacings of size. with minWavelength, this sets how dense the middle gets (these
  // two match the fifth layer from the outside, so the layers inside it get no denser)
  minAmplitude: 0.7,
  // how far past the next layer out's lines every top of a layer reaches, in layer spacings of size
  overlap: 0.25,
  // in and out swings around the outermost layer, and how many fewer each layer in gets
  oscillations: 35,
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

// see wavy in styles.js
const wavy = {
  // between the rings, in layer spacings
  spacing: 2.4,
  // points around the innermost ring (plus pointsPerFourLayers for every four rings), and how many more each ring out
  // gets. every wave takes four
  points: 54,
  pointsPerFourLayers: 12,
  pointsPerLayer: 20,
  // how far the waves swing, in the rings' own spacing
  amplitude: 1.5,
  // copies of each ring, spread across one wave: 1 half the time, 2 30% of the time, 3 20% of the time
  repeats: () => chance([50, 1], [30, 2], [20, 3]),
  // the closest a wave's control point gets to the center, in layer spacings
  floor: 0.5,
}

// the primary's gears: how many, how many times they turn (at least and at most), and how big they get (as a fraction
// of each layer's size). like fake-internet-money's: two gentle gears that always turn, starting together
const gearOptions = { count: 2, rotationMin: 1, rotationMax: 16, radiaMin: 0.06, radiaMax: 0.12, start: 'fixed' }

// the primary's features, the same for both, so they only differ in style
const features = {
  styleSettings: { numismatic, wavy },
  palette: [pen.blue],
  gearStart: 'fixed',
  gearOptions,
  // how much the gears' radia shift from the innermost layer to the outermost
  radiaChangeChance: 0,
  radiaChangeRange: [0.005, 0.1],
  // only the standard style uses these
  ribbedStyles: [],
  spiralChances: [[1, () => 0]],
  aura: false,
}

// the broad shapes the bg can have (see bases.js)
const bases = {
  radial: radialBase(),
  rect: rectBase({ exponent: 8 }),
}

// the bg's numismatic settings: the same as the primary's to start
const bgNumismatic = { ...numismatic }

// the bg: a numismatic rosette behind the primary (see features.js)
const bgFeatures = {
  style: 'numismatic',
  styleSettings: { numismatic: bgNumismatic },
  palette: [pen.red],
  // where the gears start turning: fixed and even keep the rosette mirrored left/right, wonky doesn't
  gearStartChances: { fixed: 50, even: 45, wonky: 5 },
  // its layers are big, so its wiggles are kept small enough for the base shape to show through
  gearOptions: { count: 7, rotationMax: 15, radiaMax: 0.04 },
  // how much the gears' radia shift from the innermost layer to the outermost
  radiaChangeChance: 0.25,
  radiaChangeRange: [0.005, 0.1],
  // only the standard style uses these
  ribbedStyles: [],
  spiralChances: [[1, () => 0]],
  aura: false,
}


// ---------------------------------------------------------------------------------------------------- drawing

// the primary's gears and everything about the bg, picked once from the hash so both panels share them (wavy picks its
// copies first, so otherwise the two would end up with different ones)
setSeed(hash)
const gears = generateGears(gearOptions)
const bgBase = params.get('bg') ?? pick({ rect: 1, radial: 1 })
const bgRolled = generateFeatures(bgFeatures)

const center = [canvas.size / 2, canvas.size / 2]

// shared by every rosette
const shared = {
  center,
  spacing: layout.spacing,
  minSize: layout.spacing,
  pointCount: layout.pointCount,
  clipStep: layout.clipStep,
  strokeWidth: canvas.strokeWidth,
  strokeOpacity: canvas.strokeOpacity,
}

// the canvas, pulled in so the bg's ink (pen width included) stops margin short of its edge
const pull = layout.margin + canvas.strokeWidth / 2
const border = boxSdf(...center, canvas.size / 2 - pull, canvas.size / 2 - pull)

// draws the primary in style, with the bg behind it, into $parent
function drawIn(style, $parent) {
  setSeed(hash)
  const svg = new Svg({ width: canvas.size, height: canvas.size, background: canvas.background, displayWidth: canvas.displayWidth })
  const primary = createRosette({
    ...shared,
    ...generateFeatures({ ...features, style, gears }),
    base: radialBase(),
    layers: fitWithin(layout.radius),
  })
  const bg = createRosette({
    ...shared,
    ...bgRolled,
    base: bases[bgBase],
    // enough layers that the outermost one lies entirely past the border, so the bg fills the whole canvas
    layers: fillPast(border),
    // cut around the primary: everything within its reach, plus the gap and both half pen widths
    clip: subtractSdf(border, rosetteSdf(primary, layout.gap + canvas.strokeWidth)),
  })
  drawRosette(svg, bg)
  drawRosette(svg, primary)
  svg.mount($parent)
  return { svg, primary, bg }
}

const $numismatic = $.id('numismatic')
const $wavy = $.id('wavy')
const $wavyCaption = $.id('wavyCaption')
const numismaticPanel = drawIn('numismatic', $numismatic)
const wavyPanel = drawIn('wavy', $wavy)

const copies = wavyPanel.primary.config.styleSettings.repeats
$wavyCaption.textContent = `wavy: ${copies} ${copies === 1 ? 'copy' : 'copies'} per ring`

console.log({ hash, bgBase, numismatic: numismaticPanel, wavy: wavyPanel })

// space saves both svgs
window.addEventListener('keydown', e => {
  if (e.code !== 'Space') return
  numismaticPanel.svg.download(`${hash}-numismatic.svg`)
  wavyPanel.svg.download(`${hash}-wavy.svg`)
})
