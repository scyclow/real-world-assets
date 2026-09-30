import { setSeed, getHash, times } from './utils.js'
import { Svg } from './svg.js'
import { canvas, drawPair } from './rosettePair.js'

// Three of index.html's design side by side, each with its primary and bg rosettes in random styles (see
// rosettePair.js). ?hash= remakes a set (a new one's hash shows up in the url as #hash)
const hash = getHash()
setSeed(hash)

const count = 3
const svg = new Svg({ width: canvas.size * count, height: canvas.size, background: canvas.background })
const pairs = times(count, i => drawPair(svg, { origin: [canvas.size * i, 0] }))

console.log({ hash, styles: pairs.map(({ primary, bg }) => ({ primary: primary.config.style, bg: bg.config.style })), pairs })
svg.mount()

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
