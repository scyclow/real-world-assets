import { rnd, prb, posOrNeg, sample, chance, pick, times, rndSeed, createRandom } from './utils.js'
import { generateGears } from './gears.js'
import { MAX_LAYERS } from './rosette.js'

// Rolls everything random about a rosette besides where it goes and how big it is, ready to spread into
// createRosette's config. Every chance and range comes from settings (see index.js):
//   styleChances: { style: weight }. styleSettings: { style: settings }, where () => value gets picked now
//   pens, paletteSize: the pens a palette gets picked from, and how many
//   gearStartChances: { fixed, even, wonky } weights. gearOptions: for generateGears
//   ribbedStyles: the styles that can get a shadow, a second set of gears, or irregular spacing
//   shadowChance, multipleChance, irregularSpacingChance
//   spiralChances: [weight, t => degrees] pairs, turned either direction
//   radiaChangeChance, radiaChangeRange: [min, max]
//   auraChance, auraSettings (see auraStrokes in styles.js)
// Any feature can be set in settings instead of rolled: style, palette, gearStart, gears, shadow, multiple, spiral,
// radiaChange, spacingPattern, aura, colorFn, seed (false turns shadow, multiple, spacingPattern, and aura off)
export function generateFeatures(s) {
  const palette = s.palette ?? times(s.paletteSize, () => sample(s.pens))
  const style = s.style ?? pick(s.styleChances)
  const styleSettings = Object.fromEntries(
    Object.entries(s.styleSettings[style] ?? {}).map(([k, v]) => [k, typeof v === 'function' ? v() : v])
  )
  const ribbed = s.ribbedStyles.includes(style)

  const gearStart = s.gearStart ?? pick(s.gearStartChances)
  const gearOptions = { start: gearStart, ...s.gearOptions }
  const gears = s.gears ?? generateGears(gearOptions)

  // a copy of the rosette in another color, nudged over
  const shadow = s.shadow ?? (ribbed && prb(s.shadowChance) && {
    direction: [posOrNeg(), posOrNeg()],
    stroke: sample(palette),
  })

  // a second rosette with its own gears in another color, laid over the first
  const multiple = s.multiple ?? (ribbed && !shadow && prb(s.multipleChance) && {
    gears: generateGears(gearOptions),
    stroke: sample(palette),
  })

  const spiralDirection = posOrNeg()
  const spiralFn = chance(...s.spiralChances)
  const spiral = s.spiral ?? (t => spiralFn(t) * spiralDirection)

  const radiaChange = s.radiaChange ?? (prb(s.radiaChangeChance) ? rnd(...s.radiaChangeRange) : 0)

  // like rosette2.js, the layers only scatter when the radia hold steady
  const spacingPattern = s.spacingPattern ?? (ribbed && !radiaChange && prb(s.irregularSpacingChance) && times(MAX_LAYERS, () => rnd()))

  const aura = s.aura ?? (prb(s.auraChance) && s.auraSettings)

  const seed = s.seed ?? rndSeed()

  // a rosette with a shadow or a second set of gears keeps each pass to a single color. otherwise every layer (or
  // piece) gets its own pick, the same one every time it's drawn
  const color = sample(palette)
  const colorSeed = rndSeed()
  const colorFn = s.colorFn ?? (shadow || multiple
    ? () => color
    : t => palette[Math.trunc(createRandom(colorSeed + t).rnd(palette.length))])

  return { style, styleSettings, seed, palette, gearStart, gears, shadow, multiple, spiral, radiaChange, spacingPattern, aura, colorFn }
}
