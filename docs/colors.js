// the pens: Sakura Pigma Microns, in the colors Sakura gives them (pink is the one Sakura calls rose)
export const pen = {
  black: '#000000',
  blue: '#0066ff',
  green: '#00a877',
  pink: '#ff168d',
  red: '#ff0000',
  brown: '#964b00',
  orange: '#ff7f00',
  purple: '#660297',
}

// the pens a rosette's palette gets picked from, on a white background and on a black one
export const penColorsOnWhite = [pen.black, pen.blue, pen.green, pen.pink, pen.red, pen.brown, pen.orange, pen.purple]
export const penColorsOnBlack = ['#ffffff', ...penColorsOnWhite.slice(1)]

// the pen's name if it's one of ours, otherwise the color itself
export const penName = stroke => Object.keys(pen).find(name => pen[name] === stroke) ?? stroke

// the pens before they were Microns (as #rrggbb), and the Micron that took each one's place, so colors saved back then
// come out in the nearest pen we have now
const oldPens = {
  '#000000': 'black', '#e21432': 'red', '#ff6d07': 'orange', '#fdb603': 'orange', '#81c616': 'green',
  '#047b41': 'green', '#00b1d3': 'blue', '#0303a7': 'blue', '#8729cc': 'purple', '#b680c4': 'purple',
  '#d31479': 'pink', '#f92c88': 'pink',
}
export const upgradePenColor = color => pen[oldPens[String(color).toLowerCase()]] ?? color
