import { setSeed, randomHash, times, hypot, min } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf, closerToSdf, intersectSdf, subtractSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, fitWithin } from './rosette.js'
import { features, styleNames, stableStyleNames } from './bill.js'
import { rosetteDefaults, gearOptionsFor } from './rosetteSettings.js'

// A strip bordered in rosettes, like the note's medallion border (see bill.js): medallions with their centers on a
// rect inset from the strip's edge, overlapping, each cut off where it's closer to a neighbor than to its own center
// so their lines meet at the seams, and cut off by the outermost rect. The middle is left empty. drawStrip() draws one
// from a hash (a new one every time, unless it's handed one). stripConsole.js drives it; strip.html opens that.


// ---------------------------------------------------------------------------------------------------- settings
// everything is in mm, except where it says layer spacings

const strip = {
  width: 200,
  height: 30,
  background: '#fff',
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
  // how far short of the strip's edge the ink stops
  margin: 1,
  // how round the empty middle's corners are, at most (they're never rounder than half its height)
  holeRadius: 2,
}

const layout = {
  pointCount: 900,
  clipStep: 0.5,
}

// what the console starts at: how many medallions along the top and bottom and down the sides (the corners counting
// for both), how far in from the strip's edge their centers run, how big they are (1 just reaches halfway to the
// nearest one, so bigger overlaps), how far apart their layers are, their gears and symmetry (see rosetteSettings.js), and the
// empty middle's size. style '' leaves the style to the hash, and color is any pen in colors.js
export const defaults = {
  ...rosetteDefaults,
  symmetry: 'both',
  across: 12,
  high: 2,
  inset: 2,
  size: 1.4,
  spacing: 0.875,
  holeWidth: 150,
  holeHeight: 8,
  style: 'standard',
  shape: 'radial',
  color: 'black',
}

export { styleNames }


// ---------------------------------------------------------------------------------------------------- drawing

// Draws a strip (see defaults for what can be set). Returns it, its hash, and the style it came out in
export function drawStrip({ hash=randomHash(), ...settings }={}) {
  const s = { ...defaults, ...settings }
  setSeed(hash)
  const { width: W, height: H, strokeWidth } = strip
  const svg = new Svg({ width: W, height: H, background: strip.background })
  const stroke = pen[s.color] ?? s.color

  const medallionFeatures = {
    ...generateFeatures({
      ...features,
      styleChances: s.style ? { [s.style]: 1 } : Object.fromEntries(stableStyleNames.map(name => [name, 1])),
      palette: [stroke],
      gearOptions: gearOptionsFor(features.gearOptions, s),
    }),
    // set after the roll, so they don't change what else gets rolled
    radiaChange: s.radiaChange,
    radialDensity: s.radialDensity,
    waveAmplitude: s.waveAmplitude,
    curveAmplitude: s.curveAmplitude,
    curveHz: s.curveHz,
    noise: s.noise,
    noiseSymmetry: s.noiseSymmetry,
    noiseDepth: s.noiseDepth,
    noiseDetail: s.noiseDetail,
    noiseSeed: s.noiseSeed,
    singleLayer: s.singleLayer,
    symmetry: s.symmetry,
    starts: s.starts,
  }

  // the outermost rect (its line runs half a pen width inside margin), and the empty middle, grown by half a pen width
  // so the ink stops at its edge
  const outermost = strip.margin + strokeWidth / 2
  const inside = boxSdf(W / 2, H / 2, W / 2 - outermost, H / 2 - outermost)
  const hole = boxSdf(W / 2, H / 2, s.holeWidth / 2 + strokeWidth / 2, s.holeHeight / 2 + strokeWidth / 2,
    min(strip.holeRadius, s.holeHeight / 2))

  const d = s.inset
  const xs = times(s.across, i => d + i * (W - 2 * d) / (s.across - 1))
  const ys = times(s.high, j => d + j * (H - 2 * d) / (s.high - 1))
  const centers = [
    ...xs.map(x => [x, d]),
    ...xs.map(x => [x, H - d]),
    ...ys.slice(1, -1).flatMap(y => [[d, y], [W - d, y]]),
  ]

  const medallions = centers.map((center, k) => {
    const others = centers.filter((_, j) => j !== k)
    const nearest = Math.min(...others.map(([x, y]) => hypot(x - center[0], y - center[1])))
    return createRosette({
      ...medallionFeatures,
      pointCount: layout.pointCount,
      clipStep: layout.clipStep,
      strokeWidth,
      strokeOpacity: strip.strokeOpacity,
      center,
      base: s.shape === 'rect' ? rectBase({ exponent: 8 }) : radialBase(),
      spacing: s.spacing,
      minSize: s.spacing,
      layers: fitWithin(s.size * nearest / 2),
      // its own share of the ring, inside the outermost rect's ink and out of the middle
      clip: subtractSdf(intersectSdf(closerToSdf(center, others), (x, y) => inside(x, y) + strokeWidth), hole),
    })
  })
  medallions.forEach(medallion => drawRosette(svg, medallion))

  svg.path(`M ${outermost},${outermost} ${W - outermost},${outermost} ${W - outermost},${H - outermost} ${outermost},${H - outermost} Z`,
    { stroke, strokeWidth, strokeOpacity: strip.strokeOpacity })

  return { hash, svg, style: medallionFeatures.style, settings: s, medallions }
}
