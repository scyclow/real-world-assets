import { setSeed, randomHash, pick, max, min, times, createRandom } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase, rectBase } from './bases.js'
import { boxSdf } from './sdf.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette, fitWithin, fitInside } from './rosette.js'
import { features, styleNames, stableStyleNames } from './bill.js'
import { colorFnFor, coloringFromRule } from './colorRules.js'
import { rosetteDefaults, gearOptionsFor, upgradeSmoothed } from './rosetteSettings.js'

// A sheet of rosettes in a grid, one whole rosette in every cell, in the note's styles and gears (see bill.js) and
// colored by rules like its middle emblems', over as many as six pens, A to F.
// drawRosetteGrid() draws one from a hash (a new one every time, unless it's handed one). rosetteGridConsole.js drives
// it; rosetteGrid.html opens that.


// ---------------------------------------------------------------------------------------------------- settings
// everything is in mm, except where it says layer spacings

const layout = {
  pointCount: 900,
  clipStep: 0.5,
  strokeOpacity: 0.9,
}

// what the console starts at:
//   width, height: the sheet. margin: how far short of its edge the grid stops. gap: the space between cells
//   columns, rows: the grid
//   style: the rosettes' style, or 'random' for a different one in every cell. shape: 'radial', 'rect', or 'random'
//   size: how much of its cell a rosette fills (1 reaches the cell's nearer edges). spacing: how far apart its layers are
//   radialDensity: how much it draws going around its center, waveAmplitude how high its waves go, symmetry how it's mirrored, and starts where its gears
//   start (see rosetteSettings.js)
//   gears: how many ride on each rosette, and amplitude how big they get at most (as a fraction of each layer's size).
//   smoothed makes them all turn forwards (shield to flower), radiaChange is how much their radia shrink from the
//   innermost layer to the outermost (below 0 grows), and sameGears gives every cell the same ones (see
//   rosetteSettings.js)
//   colors: how many pens are in use (1 to 6), colorA to colorF the pens' colors (as #rrggbb), and widthA to widthF
//   how thick each draws (mm). colorings: the ways a rosette's rings can be colored, each a pattern and an order of
//   pens by letter (see colorRules.js), and a weight (1 if it has none). every rosette picks one of them at random,
//   each as often as its weight says, against the others'
export const defaults = {
  width: 200,
  height: 150,
  margin: 5,
  gap: 3,
  columns: 4,
  rows: 3,
  style: 'standard',
  shape: 'radial',
  size: 1,
  spacing: 0.875,
  gears: rosetteDefaults.gears,
  amplitude: rosetteDefaults.amplitude,
  smoothed: rosetteDefaults.smoothed,
  radiaChange: rosetteDefaults.radiaChange,
  radialDensity: rosetteDefaults.radialDensity,
  waveAmplitude: rosetteDefaults.waveAmplitude,
  curveAmplitude: rosetteDefaults.curveAmplitude,
  curveHz: rosetteDefaults.curveHz,
  noise: rosetteDefaults.noise,
  noiseSymmetry: rosetteDefaults.noiseSymmetry,
  noiseDepth: rosetteDefaults.noiseDepth,
  noiseDetail: rosetteDefaults.noiseDetail,
  noiseSeed: rosetteDefaults.noiseSeed,
  singleLayer: rosetteDefaults.singleLayer,
  symmetry: 'vertical',
  starts: rosetteDefaults.starts,
  sameGears: false,
  colors: 3,
  colorA: toHex(pen.black),
  colorB: toHex(pen.blue),
  colorC: toHex(pen.red),
  colorD: toHex(pen.green),
  colorE: toHex(pen.orange),
  colorF: toHex(pen.purple),
  widthA: 0.3,
  widthB: 0.3,
  widthC: 0.3,
  widthD: 0.3,
  widthE: 0.3,
  widthF: 0.3,
  colorings: [{ pattern: 'single', order: 'A' }],
}

export { styleNames }

// the pens, by letter, and the settings for each one's color and width
export const penLetters = ['A', 'B', 'C', 'D', 'E', 'F']
export const penKeys = penLetters.map(letter => `color${letter}`)
export const widthKeys = penLetters.map(letter => `width${letter}`)


// settings saved before now brought up to date: one coloring (a pattern and an order, or before that a color rule and
// how many rings its bands ran for) instead of several, pens by name (see colors.js) instead of color, one pen width for all of them, amplitude called
// wiggle, and smoothed called positive
export function upgradeSettings(settings) {
  const { colorRule, band, colorPattern, colorOrder, ...rest } = settings
  // a single coloring, once kept as a pattern and an order, and before that a rule
  const coloring = colorPattern ? { pattern: colorPattern, order: colorOrder ?? 'A' }
    : colorRule !== undefined ? coloringFromRule(colorRule, { solid: 'A', count: rest.colors, band })
    : null
  const { strokeWidth, wiggle, ...upgraded } = upgradeSmoothed({
    ...rest,
    ...(coloring && !rest.colorings ? { colorings: [coloring] } : {}),
  })
  for (const key of penKeys) {
    if (key in upgraded) upgraded[key] = toHex(upgraded[key])
  }
  if (strokeWidth) for (const key of widthKeys) upgraded[key] ??= strokeWidth
  // what's now amplitude was once wiggle
  if (wiggle !== undefined) upgraded.amplitude ??= wiggle
  return upgraded
}

// a color as #rrggbb, which is what a color picker wants: a pen's name (see colors.js), or a #rgb spelled out
export function toHex(color) {
  const hex = pen[color] ?? color
  return typeof hex === 'string' && /^#[0-9a-f]{3}$/i.test(hex) ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex
}


// ---------------------------------------------------------------------------------------------------- drawing

// Draws a grid (see defaults for what can be set). Returns it, its hash, and the rosettes, each with its style
export function drawRosetteGrid({ hash=randomHash(), ...settings }={}) {
  const s = upgradeSettings({ ...defaults, ...settings })
  setSeed(hash)
  const svg = new Svg({ width: s.width, height: s.height, background: '#fff' })
  const inUse = min(6, max(1, s.colors))
  const pens = penKeys.slice(0, inUse).map(key => s[key])
  // how thick each pen draws (two pens the same color draw as thick as the first of them)
  const widths = new Map(pens.map((color, i) => [color, s[widthKeys[i]]]).reverse())
  const widthOf = stroke => widths.get(stroke)
  // the widest, which is what the rosettes are fitted to their cells by
  const strokeWidth = max(...widths.values())
  const colorSeed = parseInt(hash.slice(10, 18), 16) || 1

  // which coloring each rosette gets, picked at random by weight (from the colors' own seed, as ring 200's would be,
  // where they've always been picked from, so it changes nothing else). if every weight's 0, they're all as likely
  const given = s.colorings?.length ? s.colorings : defaults.colorings
  const weights = given.map(({ weight=1 }) => max(0, Number(weight) || 0))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const coloringOf = k => {
    const roll = createRandom(colorSeed + k * 1000 + 200).rnd()
    if (!total) return given[Math.floor(roll * given.length)]
    let left = roll * total
    return given.find((_, i) => (left -= weights[i]) < 0) ?? given.findLast((_, i) => weights[i] > 0)
  }

  const cellW = (s.width - 2 * s.margin - (s.columns - 1) * s.gap) / s.columns
  const cellH = (s.height - 2 * s.margin - (s.rows - 1) * s.gap) / s.rows
  if (cellW <= 0 || cellH <= 0) return { hash, svg, settings: s, rosettes: [] }

  // a rosette's features: its style (picked from all of them when it's random) and gears
  const roll = () => generateFeatures({
    ...features,
    styleChances: s.style === 'random' ? Object.fromEntries(stableStyleNames.map(name => [name, 1])) : { [s.style]: 1 },
    palette: [pens[0]],
    gearOptions: { ...gearOptionsFor(features.gearOptions, s), oddRotations: false },
  })
  const shared = s.sameGears ? roll() : null

  // every cell's rosette, rolled (once) and fitted to its cell: as many layers as fit, however far its gears swing it
  const fitted = times(s.rows, row => times(s.columns, column => {
    const k = row * s.columns + column
    const center = [s.margin + column * (cellW + s.gap) + cellW / 2, s.margin + row * (cellH + s.gap) + cellH / 2]
    const shape = s.shape === 'random' ? pick({ radial: 1, rect: 1 }) : s.shape
    const [hw, hh] = [cellW / 2 * s.size, cellH / 2 * s.size]
    const config = {
      pointCount: layout.pointCount,
      clipStep: layout.clipStep,
      strokeWidth,
      strokeOpacity: layout.strokeOpacity,
      ...(shared ?? roll()),
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
      // set on the rosette rather than rolled with it, so changing the colors doesn't change anything else
      colorFn: colorFnFor(coloringOf(k), pens, t => createRandom(colorSeed + k * 1000 + t).rnd()),
      center,
      spacing: s.spacing,
      minSize: s.spacing,
      // a rect rosette is stretched to its cell and fills a box of it, a radial one a circle
      ...(shape === 'rect'
        ? {
          base: rectBase({ exponent: 8, stretch: [max(0, hw - hh), max(0, hh - hw)] }),
          layers: fitInside(boxSdf(...center, hw, hh)),
        }
        : { base: radialBase(), layers: fitWithin(min(hw, hh)) }),
    }
    return { config, rosette: createRosette(config) }
  })).flat()

  // then every one drawn with the same number of layers: as many as the one that fits the fewest does, so each of them
  // is as far apart as density says, and fits its cell
  const layers = min(...fitted.map(({ rosette }) => rosette.count))
  const rosettes = fitted.map(({ config, rosette: fits }) => {
    const rosette = fits.count === layers ? fits : createRosette({ ...config, layers })
    drawRosette(svg, rosette, widthOf)
    return rosette
  })

  return { hash, svg, settings: s, rosettes }
}
