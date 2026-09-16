import { $ } from './$.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { cutive } from './cutive.js'
import { drawText, textWidth } from './type.js'

// Cutive as a specimen sheet: the whole set in a grid, then lines at the sizes a note uses. The sheet is drawn the
// same way the notes are, so it plots as it stands
const which = 'cutive'
const font = cutive


// ---------------------------------------------------------------------------------------------------- settings
// everything is in mm

const sheet = {
  // the sheet grows to fit its widest line, but never comes out narrower than this
  minWidth: 190,
  background: '#fff',
  margin: 16,
  // a plotting pen. the notes use 0.2
  strokeWidth: 0.55,
  strokeOpacity: 0.9,
  ink: pen.black,
  accent: pen.blue,
}

// the whole character set, laid out in a grid. every glyph is centered in its own cell
const grid = {
  // 13 columns puts the alphabet in two rows and the digits in a third
  columns: 13,
  // scales the glyphs (they're 58 tall at 1, so 0.2 draws them about 12mm)
  size: 0.2,
  rowGap: 4,
  columnGap: 1,
}

// what the sheet says, top to bottom. size scales the glyphs, gap is the space under the block, and grid is the
// character set. pen picks one of sheet's pens
const blocks = [
  { text: 'CUTIVE MONO', size: 0.13, pen: 'accent', gap: 3 },
  { text: 'SINGLE LINE FOR PLOTTING', size: 0.045, gap: 11 },
  { grid: true, gap: 13 },
  { text: 'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS', size: 0.07, gap: 8 },
  // the sizes a note's lettering uses, largest first
  { text: 'ROSETTE RESERVE NOTE', size: 0.1, gap: 6 },
  { text: 'ONE HUNDRED ROSETTES', size: 0.075, gap: 5 },
  { text: 'SERIES 2026 PLOTTED BY HAND', size: 0.06, gap: 4 },
  { text: 'R3F9A1C2 100', size: 0.045, gap: 4 },
  { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', size: 0.04, gap: 0 },
]


// ---------------------------------------------------------------------------------------------------- drawing

// every glyph the font has, apart from the blank one, in reading order: js hands back an object's number-like keys
// first, so without sorting the sheet would open on the digits
const order = c => /[A-Z]/.test(c) ? 0 : /[0-9]/.test(c) ? 1 : 2
const glyphs = Object.keys(font.chars)
  .filter(c => c.trim())
  .sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1))
const rows = Math.ceil(glyphs.length / grid.columns)

// one cell fits the font's widest glyph, so an uneven font still lines up in columns
const cellW = Math.max(...glyphs.map(c => font.chars[c][1])) * grid.size + grid.columnGap
const gridW = grid.columns * cellW - grid.columnGap

const blockWidth = b => b.grid ? gridW : textWidth(b.text, b.size, font)
const blockHeight = b => b.grid
  ? rows * font.glyphHeight * grid.size + (rows - 1) * grid.rowGap
  : font.glyphHeight * b.size

const W = Math.max(sheet.minWidth, Math.max(...blocks.map(blockWidth)) + sheet.margin * 2)
const H = sheet.margin * 2 + blocks.reduce((h, b) => h + blockHeight(b) + b.gap, 0)

const svg = new Svg({ width: W, height: H, background: sheet.background })
const pens = { ink: sheet.ink, accent: sheet.accent }

let y = sheet.margin
for (const b of blocks) {
  const args = {
    font,
    stroke: pens[b.pen ?? 'ink'],
    strokeWidth: sheet.strokeWidth,
    strokeOpacity: sheet.strokeOpacity,
  }
  if (b.grid) {
    const left = (W - gridW) / 2
    const lineH = font.glyphHeight * grid.size + grid.rowGap
    glyphs.forEach((c, i) => drawText(svg, c, {
      ...args,
      x: left + (i % grid.columns) * cellW + (cellW - grid.columnGap) / 2,
      y: y + Math.floor(i / grid.columns) * lineH,
      size: grid.size,
      align: 'center',
    }))
  } else {
    drawText(svg, b.text, { ...args, x: W / 2, y, size: b.size, align: 'center' })
  }
  y += blockHeight(b) + b.gap
}

const $sheet = $.id('sheet')
const $caption = $.id('caption')
svg.mount($sheet)
$caption.textContent = `${which}: ${glyphs.length} glyphs, ${Math.round(W)}x${Math.round(H)}mm`
  + ' — space saves the svg'

console.log({ font: which, glyphs: glyphs.length, width: W, height: H, svg })

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${which}-specimen.svg`)
})
