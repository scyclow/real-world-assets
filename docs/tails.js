import { setSeed, getHash } from './utils.js'
import { drawNote, counter, banner } from './note.js'
import { cutiveOutline } from './cutive.js'

// The back of a note, laid out the way the engraved ones in money-images are: everything mirrored left to right
// around one big rosette, the legend in a banner straight across it, a counter either side, the denomination in all
// four corners, and the imprint along the bottom. No serial and nowhere to sign -- those belong on the front.
// Everything it's drawn with is in note.js. ?hash= remakes one (a new one's hash shows up in the url as #hash)
const hash = getHash()
setSeed(hash)

// the sheet is 195 x 82.5, and the field inside the frame runs from 10.4 to 184.6 across and 72.1 down
const W = 195
const middle = W / 2
// the corners' denominations, in from the field's edge
const corner = { left: 16.25, right: 178.75, top: 14, bottom: 65.5, size: 0.045 }

const note = drawNote({
  // the big rosette the back is built around, with a smaller one either side under the counters
  rosettes: [
    { x: middle, y: 41, radius: 21, pen: 'accent', spacing: 1.4, chances: { numismatic: 1 } },
    { x: 41, y: 41, radius: 15, pen: 'accent', spacing: 0.875, chances: { standard: 1 }, group: 'counter' },
    { x: W - 41, y: 41, radius: 15, pen: 'accent', spacing: 0.875, chances: { standard: 1 }, group: 'counter' },
  ],

  lettering: [
    // the legend, straight across the middle rosette
    banner('REDEEMABLE IN REAL WORLD ASSETS', middle, 38.5, 0.045),
    // a counter either side, over its own rosette
    counter('100', 41, 41, 0.07, { font: cutiveOutline, rings: 2 }),
    counter('100', W - 41, 41, 0.07, { font: cutiveOutline, rings: 2 }),
    // the denomination in all four corners
    { text: '100', x: corner.left, y: corner.top, size: corner.size, font: cutiveOutline },
    { text: '100', x: corner.right, y: corner.top, size: corner.size, align: 'right', font: cutiveOutline },
    { text: '100', x: corner.left, y: corner.bottom, size: corner.size, font: cutiveOutline },
    { text: '100', x: corner.right, y: corner.bottom, size: corner.size, align: 'right', font: cutiveOutline },
    // the imprint along the bottom
    { text: 'PLOTTED BY HAND', x: middle, y: 67, size: 0.03, align: 'center' },
  ],
})

console.log({ hash, ...note })

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') note.svg.download(`${hash}-tails.svg`)
})
