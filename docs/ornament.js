import { setSeed, getHash, rndSeed, times } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase } from './bases.js'
import { generateGears } from './gears.js'
import { createRosette, drawRosette, rosetteSdf } from './rosette.js'
import { lineSpine, arcSpine, ellipseSpine, sdfSpine } from './paths.js'
import { createAcanthus, drawAcanthus } from './acanthus.js'

// a sheet of acanthus ornament (see acanthus.js): every kind of path the band will run along, and what happens when
// it swells or narrows along one. ?hash= remakes a sheet (a new one's hash shows up in the url as #hash)
const hash = getHash()
setSeed(hash)


// ---------------------------------------------------------------------------------------------------- settings
// everything is in svg units

const canvas = {
  width: 210,
  height: 297,
  background: '#fff',
  strokeWidth: 0.26,
  strokeOpacity: 1,
}

// shared by every band on the sheet
const shared = {
  strokeWidth: canvas.strokeWidth,
  strokeOpacity: canvas.strokeOpacity,
  colorFn: () => pen.black,
}

// the rosette the last panel's acanthus grows around
const rosette = {
  center: [152, 206],
  pen: pen.blue,
  // as a rosette's own settings (see rosette.js)
  layers: 7,
  minSize: 3,
  spacing: 2.4,
  gearOptions: { count: 4, rotationMin: 3, rotationMax: 11, radiaMin: 0.04, radiaMax: 0.1, oddRotations: true },
  // how far clear of the rosette's own outline the band runs, how much of the way around each radius is averaged
  // over to round that outline off, and how far the lobes reach past the path. the gap is wide enough that the
  // inward lobes stop short of the rosette rather than lying over it
  gap: 9,
  smooth: 0.06,
  stray: 7,
}


// ---------------------------------------------------------------------------------------------------- drawing

const svg = new Svg(canvas)

const band = config => drawAcanthus(svg, createAcanthus({ ...shared, seed: rndSeed(), ...config }))

// 1. a straight band, the lobes breaking either side in turn and the body winding up into a volute
band({ spine: lineSpine([16, 32], [176, 32]), stray: 11 })

// 2. the same, with the band swelling as it goes: every lobe is sized to reach exactly as far off the path as the
// stray says, and they space themselves by it too, so they crowd up where it is narrow
band({ spine: lineSpine([16, 76], [176, 76]), stray: [4, 15] })

// 3. a circular arc, bulging below its chord
band({ spine: arcSpine([16, 124], [176, 124], 0.14), stray: 10 })

// 4. a closed oval. the lobes break inward and outward in turn, so the band interlocks with itself all the way
// round the way the scrollwork on a banknote does
band({
  // a rounder oval keeps the curvature even: at the tight end of a narrow one the inward lobes crowd each other
  spine: ellipseSpine({ center: [58, 206], rx: 34, ry: 28 }),
  // enough clear air inside that the inward lobes never meet across the middle
  stray: 7.5,
  spacing: 2.1,
})

// 5. acanthus grown around a rosette: the band follows the rosette's own outline at a set clearance, rounded off so
// it keeps the broad swells of the shape without diving into every valley between its petals
const middle = createRosette({
  center: rosette.center,
  base: radialBase(),
  style: 'standard',
  gears: generateGears(rosette.gearOptions),
  layers: rosette.layers,
  minSize: rosette.minSize,
  spacing: rosette.spacing,
  colorFn: () => rosette.pen,
  strokeWidth: canvas.strokeWidth,
  strokeOpacity: canvas.strokeOpacity,
})
drawRosette(svg, middle)

band({
  spine: sdfSpine({
    sdf: rosetteSdf(middle),
    center: rosette.center,
    gap: rosette.gap,
    smooth: rosette.smooth,
    maxRadius: 70,
  }),
  stray: rosette.stray,
  spacing: 2,
})

// 6. a tailpiece: two bands run out of the middle in opposite directions, each narrowing to a volute, which is how a
// band gets a finished end at both ends. both start on the same point, so their two tapered tips land on top of one
// another and the join doesn't show
times(2, i => band({
  spine: lineSpine([105, 272], [i ? 192 : 18, 272]),
  stray: [11, 5],
  from: 0.05,
}))

console.log({ hash, rosette: middle })

svg.mount()

// space saves the sheet
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
