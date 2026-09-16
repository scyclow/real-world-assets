export const pen = {
  black: '#000',
  white: '#fff',
  red: '#e21432',
  orange: '#ff6d07',
  yellow: '#fdb603',
  lime: '#81c616',
  green: '#047b41',
  teal: '#00b1d3',
  blue: '#0303a7',
  purple: '#8729cc',
  lightPurple: '#b680c4',
  magenta: '#d31479',
  pink: '#f92c88',
}

// the pens a rosette's palette gets picked from, on a white background and on a black one
export const penColorsOnWhite = [pen.black, pen.blue, pen.teal, pen.red, pen.orange, pen.green, pen.lime, pen.yellow, pen.magenta, pen.purple, pen.pink]
export const penColorsOnBlack = [pen.white, ...penColorsOnWhite.slice(1)]

// the pen's name if it's one of ours, otherwise the color itself
export const penName = stroke => Object.keys(pen).find(name => pen[name] === stroke) ?? stroke
