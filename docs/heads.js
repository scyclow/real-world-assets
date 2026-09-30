import { setSeed, getHash } from './utils.js'
import { drawNote, counter, banner } from './note.js'
import { cutive, cutiveOutline } from './cutive.js'

// The front of a note, laid out the way the engraved ones in money-images are: the issuer's name in a banner across
// the top, a vignette in the middle with a counter either side of it, what the note is worth in a banner below, the
// serial twice (top right and bottom left), and two lines to sign over their titles.
// Everything it's drawn with is in note.js. ?hash= remakes one (a new one's hash shows up in the url as #hash)
const hash = getHash()
setSeed(hash)

const serial = `R${hash.slice(2, 9).toUpperCase()}`

// the sheet is 195 x 82.5, and the field inside the frame runs from 10.4 to 184.6 across and 72.1 down
const W = 195
const middle = W / 2

const note = drawNote({
  // the vignette in the middle, and the engraving either side of it that the counters sit on. the vignette is the
  // note's centerpiece, so it gets the wider spacing and the ink pen; the counters' rosettes are dense and green
  rosettes: [
    { x: middle, y: 41, radius: 16, pen: 'ink', spacing: 1.6, chances: { numismatic: 1 } },
    { x: 33, y: 41, radius: 16, pen: 'accent', spacing: 0.875, chances: { standard: 1 }, group: 'counter' },
    { x: W - 33, y: 41, radius: 16, pen: 'accent', spacing: 0.875, chances: { standard: 1 }, group: 'counter' },
  ],

  lettering: [
    // the issuer, across the top
    banner('REAL WORLD ASSETS', middle, 13.5, 0.075),
    // the serial, up beside the title and again in the bottom left
    { text: serial, x: 178.75, y: 23.5, size: 0.05, align: 'right', pen: 'accent' },
    { text: serial, x: 16.25, y: 66.5, size: 0.045, pen: 'accent' },
    // the denominations, in outlines, in a round frame each: the counters the rosettes sit behind
    counter('100', 33, 41, 0.08, { font: cutiveOutline, rings: 2 }),
    counter('100', W - 33, 41, 0.08, { font: cutiveOutline, rings: 2 }),
    // what the note is worth, in a banner below the vignette
    banner('ONE HUNDRED SHARES', middle, 58, 0.045),
    // two lines to sign, each over its title
    { text: 'REGISTRAR', x: 44, y: 66.5, size: 0.03, room: { up: 7 }, rule: true },
    { text: 'TREASURER', x: 178.75, y: 66.5, size: 0.03, align: 'right', room: { up: 7 }, rule: true },
  ],
})

console.log({ hash, ...note })

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') note.svg.download(`${hash}-heads.svg`)
})
