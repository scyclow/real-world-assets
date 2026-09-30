import { setSeed, getHash } from './utils.js'
import { Svg } from './svg.js'
import { canvas, drawPair } from './rosettePair.js'

// One primary rosette on a bg rosette (see rosettePair.js). ?hash= remakes a piece (a new one's hash shows up in the
// url as #hash). both rosettes are standard and the bg is rect unless ?style= and ?bgStyle= pick other styles, or
// ?bg=radial the bg's base
const params = new URLSearchParams(window.location.search)
const hash = getHash()
setSeed(hash)

const svg = new Svg({ width: canvas.size, height: canvas.size, background: canvas.background })
const { primary, bg } = drawPair(svg, {
  style: params.get('style') ?? 'standard',
  bgStyle: params.get('bgStyle') ?? 'standard',
  bgBase: params.get('bg') ?? 'rect',
})

console.log({ hash, primaryStyle: primary.config.style, bgStyle: bg.config.style, primary, bg })
svg.mount()

// space saves the svg
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
