import { setSeed, randomHash, pick } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { drawRosette } from './rosette.js'
import { bill, layout, makeMedallions, styleChances, styleNames, defaults as billDefaults } from './bill.js'
import { rosetteDefaults } from './rosetteSettings.js'

// The note's rosette border on its own (see bill.js), at the note's size: a ring of medallions around its edge, cut
// off by the outermost rect, with nothing else, to work on by itself. drawRosetteBorder() draws one from a hash (a new
// one every time, unless it's handed one). rosetteBorderConsole.js drives it; rosetteBorder.html opens that.

// what the console starts at: the note's own medallion settings (how many along the top and bottom and down the sides,
// how far in their centers run, how big they are, and how far apart their layers are), its style and shape ('' leaves
// them to the hash, like the note does), their gears (see rosetteSettings.js), and the pen
export const defaults = {
  ...billDefaults.medallions,
  ...rosetteDefaults,
  symmetry: 'both',
  style: '',
  shape: '',
  color: 'black',
}

export { styleNames }

// Draws the border (see defaults for what can be set). Returns it, its hash, and the style and shape it came out in
export function drawRosetteBorder({ hash=randomHash(), ...settings }={}) {
  const s = { ...defaults, ...settings }
  setSeed(hash)
  const { width: W, height: H, strokeWidth, strokeOpacity } = bill
  const svg = new Svg({ width: W, height: H, background: bill.background })
  const stroke = pen[s.color] ?? s.color
  const shared = { pointCount: layout.pointCount, clipStep: layout.clipStep, strokeWidth, strokeOpacity }

  const shape = s.shape || pick({ radial: 1, rect: 1 })
  const chances = s.style ? { [s.style]: 1 } : styleChances.pattern
  // the outermost rect's line runs half a pen width inside the note's margin, as on the note
  const outermost = bill.margin + strokeWidth / 2
  const border = makeMedallions(s, chances, shape, [W, H], outermost, shared, stroke)

  border.cells.forEach(rosette => drawRosette(svg, rosette))
  svg.path(`M ${outermost},${outermost} ${W - outermost},${outermost} ${W - outermost},${H - outermost} ${outermost},${H - outermost} Z`,
    { stroke, strokeWidth, strokeOpacity })

  return { hash, svg, style: border.style, shape, settings: s, border }
}
