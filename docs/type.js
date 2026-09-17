// Letterforms for plotting, ported from the chars in rosettes/docs/svg2.js: each one is [path, width, yOffset] in a
// glyph space about 65 across and 58 tall, drawn as lines rather than filled outlines. Another typeface (ASSET, say)
// drops in the same way: its glyphs as path data on the same scale
export const chars = {
  $: ['M37 17.6C31.5 4.1 4 4.1 4 17.6s16 14 16 14c14.8 4 17 5 17 17s-33 14.5-33 0M19.5 0v67', 65, -2],
  A: ['m4 57 6.3-18m35.2 18L39 39m0 0L26.5 4h-4L10.3 39M39 39H10.3', 65, 0],
  B: ['M27 30H4m23 0 3-1.9a12.4 12.4 0 0 0 6-10.6v-1a13 13 0 0 0-3.4-8.7l-.3-.3c-.8-1-1.9-1.8-3-2.4C27.7 4.4 26 4 24.4 4H4v26m23 0 3.7 2a11.8 11.8 0 0 1 5.7 7l.1.3c.7 2.1.8 4.3.3 6.5l-.3 1.2c-.3 1.7-1 3.2-2 4.5-1.6 2-3.8 3.3-6.3 3.8l-2.4.4c-.9.2-1.7.3-2.6.3H4V30', 55, 0],
  C: ['M49.5 20.5c-7.1-24.8-43.4-20.8-45 5L4 35a23.4 23.4 0 0 0 39.7 18.2l5.8-5.7', 75, 0],
  D: ['M4 55V4h18c1.7 0 3.3.3 4.8 1l2.7 1 2.4 1.3a13 13 0 0 1 5 4.7l.5 1c.4.6.7 1.4 1 2.2l1.6 4.3 1.2 5 .4 2 .3 4v2l-.3 4.4c0 .7-.2 1.5-.4 2.2l-.7 3a13 13 0 0 1-1.6 3.6l-.6 1a13 13 0 0 1-1.8 2.3l-1.2 1.2a13 13 0 0 1-2.9 2.2l-1.1.6a13 13 0 0 1-3.8 1.4l-1.7.3c-.9.2-1.7.3-2.6.3H4Z', 65, 0],
  E: ['M35 4H4v25.8m31 25.7H4V29.7m0 0h29.5', 60, 0],
  F: ['M35.5 4H4v25.5m0 29v-29m0 0h29', 55, 0],
  G: ['m46 19-2-4.6a13 13 0 0 0-1.4-2.6l-.8-1.2a13 13 0 0 0-5.9-4.5l-1.6-.6a13 13 0 0 0-2.7-.7l-3.1-.5a13 13 0 0 0-4 0l-3.4.5-2.1.5-1.4.5a13 13 0 0 0-6 4.1l-1.2 1.5A13 13 0 0 0 9 13.8l-2 3.7a13 13 0 0 0-.7 2l-1.3 4.1a13 13 0 0 0-.5 2.8L4 30.5v2l.3 4c0 1 .2 2 .5 2.9l1 3.4A13 13 0 0 0 7.5 46L9 48.5a13 13 0 0 0 2.3 2.7l2.2 2a13 13 0 0 0 3.3 2.1l1.6.8c1.4.6 2.9 1 4.3 1l2.8.3h2l3.6-.3a13 13 0 0 0 3.7-.8l1.2-.5a13 13 0 0 0 5.7-4.3l1.4-1.8a13 13 0 0 0 1.5-2.6L46 44a13 13 0 0 0 1.1-5.2V34H28.5', 70, -2],
  H: ['M4 0v29m0 29V29m0 0h38m0 0V0m0 29v29', 70, 0],
  I: ['M4 0v58', 30, 0],
  J: ['M30.5 0v41.2c0 2.2-.4 4.3-1.2 6.3a12 12 0 0 1-8 7l-.5.1a13 13 0 0 1-6.6 0H14a13 13 0 0 1-8.5-7L4 44.4', 60, 0],
  K: ['M4 3v33m0 22V36m0 0 9.8-9.5M38 3 13.8 26.5m0 0L38 58', 60, -2],
  L: ['M4 0v52.5h28', 55, 0],
  M: ['M4 57.5V2l25 55.5L52.5 2v55.5', 75, 0],
  N: ['M4 67.5V12l39 55.5V12', 65, -5],
  O: ['M26.3 4c-28 0-31.4 54 0 53.5 31.4-.6 28-53.5 0-53.5Z', 75, 0],
  P: ['M4 59V4.6C41.8.5 38.6 37.5 4 34', 50, 0],
  Q: ['M28 42.5 44 65M26.3 4c-28 0-31.4 54 0 53.5 31.4-.6 28-53.5 0-53.5Z', 75, 0],
  R: ['M4 58.7V4.3c30-3.2 34.1 19.2 17.5 27M4 33.9c7.2.7 13.1-.3 17.5-2.4m0 0 15 27.3', 55, 0],
  S: ['M37 14.1C31.5.6 4 .6 4 14.1s16 14 16 14c14.8 4 17 5 17 17s-33 14.5-33 0', 60, 0],
  T: ['M0 4h20.8m20.7 0H20.7m0 0v55', 65, 0],
  U: ['M4 0v40.5c0 21 38.5 20 38.5 0V0', 70, 2],
  V: ['m4 2 20.5 56 22-56', 65, 0],
  W: ['m4 13 15.5 57.5L36 13l17.5 57.5L69 13', 90, -5],
  X: ['m3 2 37 57m0-57L3 59', 60, 0],
  Y: ['m3 2 20 31m0 0L43 2M23 33v26.5', 65, 0],
  Z: ['M3 4h36L7 55h32', 60, 0],
  0: ['M37 29c0 7.5-2.1 14.1-5.3 18.8C28.4 52.5 24.3 55 20 55c-4.3 0-8.4-2.5-11.7-7.2A33.5 33.5 0 0 1 3 29c0-7.5 2.1-14.1 5.3-18.8C11.6 5.5 15.7 3 20 3c4.3 0 8.4 2.5 11.7 7.2A33.5 33.5 0 0 1 37 29Z', 60, 2],
  1: ['m2 15 17-9v52.5', 50, 0],
  2: ['M4 15C6 1 31.5-.3 31.5 15 31.5 30.7 4 53 4 60c0-3 26 0 30.5 0', 57, 0],
  3: ['M5 15.2c12-28.5 52 5.5 9.5 15 40 5 12.5 43-11.5 17', 52, 0],
  4: ['M35 65V11L7 50h38', 63, -3],
  5: ['M35 4H9L6 28.5c46-18 34 49.5-3 19', 60, 0],
  6: ['M35.9 13.7c-9-18-34.2-10.9-31.7 20.1m0 0c.2 22.8 24.5 28.3 31.7 10.4C43 26.3 13.2 16.8 4.2 33.8Z', 60, 0],
  7: ['M0 4h33L7 58', 55, 0],
  8: ['M20.3 29.5c-18 0-21-25.5 0-25.5s14.5 25.5 0 25.5Zm0 0c18.5 1.5 23 27.5 0 27.5s-20.5-27.5 0-27.5Z', 60, 0],
  9: ['M6.5 47c0 13.6 31 16.6 27.5-22.4m0 0C34-5.4 4 2 4 18c-.4 17.3 16 25.2 30 6.7Z', 60, 0],
  "'": ['M9.5 2 4 19', 35, 0],
  '!': ['M7 34V0m2 53.5C9 56.3 9 56 6.5 56c-2.8 0-2.5.3-2.5-2.5s-.3-3 2.5-3 2.5.2 2.5 3Z', 40, 0],
  '.': ['M10 5A5 5 0 1 1 0 5a5 5 0 0 1 10 0Z', 40, 15],
  ' ': ['M0 0', 65, 0],
  ',': ['M9.5 2 4 19', 55, 20],
  '=': ['M0 24h33.5M0 44h33.5', 60, 0],
}

// how tall the glyphs run, in their own space
export const glyphHeight = 58

// A font is just { chars, glyphHeight }. This is the default one; cutive.js is another (Cutive Mono as single
// strokes), and every function below takes one as font, so a drawing can pick its own
export const plotter = { chars, glyphHeight }

const glyph = (font, c) => font.chars[c] ?? font.chars[' '] ?? plotter.chars[' ']

// how wide str comes out at size (1 draws the glyphs at their own size)
export const textWidth = (str, size=1, font=plotter) =>
  str.split('').reduce((w, c) => w + glyph(font, c)[1] * size, 0)

// where str sits: its left, top, right, and bottom. x, y is its left and top, or its center or right with align
export function textBox(str, { x, y, size=0.1, align='left', font=plotter }) {
  const width = textWidth(str, size, font)
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x
  return { left, top: y, right: left + width, bottom: y + font.glyphHeight * size }
}

// Draws str on an Svg (see svg.js), one path per letter, scaled by size and moved into place. Everything else (stroke,
// strokeWidth, strokeOpacity) is passed along to the paths. strokeWidth is in the drawing's units, like every other
// path's: the scale would shrink it along with the letters, so it's scaled back up to match
export function drawText(svg, str, { x, y, size=0.1, align='left', font=plotter, strokeWidth=1, ...args }) {
  let left = textBox(str, { x, y, size, align, font }).left
  str.split('').forEach(c => {
    const [d, width, yOffset] = glyph(font, c)
    // a glyph that only moves the pen (a space is just 'M0 0') is skipped, or a plotter puts a dot down where it lands
    if (/[LHVCSQTAZ]/i.test(d)) {
      svg.path(d, { ...args, strokeWidth: strokeWidth / size,
                    transform: `translate(${left} ${y + yOffset * size}) scale(${size})` })
    }
    left += width * size
  })
}
