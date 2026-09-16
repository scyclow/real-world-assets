import { setSeed, getHash, rndSeed } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase } from './bases.js'
import { generateGears } from './gears.js'
import { createRosette, drawRosette, rosetteSdf } from './rosette.js'
import { lineSpine, arcSpine, ellipseSpine, sdfSpine } from './paths.js'
import { createVine, drawVine } from './vine.js'

// a sheet of vines (see vine.js): one unbroken curling line wound around each of the paths one can follow — a
// straight run, an arc, an oval, and a rosette's own outline. ?hash= remakes a sheet (a new one's hash shows up in
// the url as #hash)
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

// shared by every vine on the sheet, so the coils come out the same size whatever path they are wound around
const shared = {
  strokeWidth: canvas.strokeWidth,
  strokeOpacity: canvas.strokeOpacity,
  colorFn: () => pen.black,
}

// the rosette the last vine winds around
const rosette = {
  center: [152, 212],
  pen: pen.blue,
  // as a rosette's own settings (see rosette.js)
  layers: 8,
  minSize: 3,
  spacing: 2,
  gearOptions: { count: 3, rotationMin: 3, rotationMax: 9, radiaMin: 0.05, radiaMax: 0.1, oddRotations: true },
  // how far clear of the rosette's own outline the vine's path runs, and how much of the way around each radius is
  // averaged over to round that outline off
  gap: 11,
  smooth: 0.07,
  reach: 7,
}


// ---------------------------------------------------------------------------------------------------- drawing

const svg = new Svg(canvas)

const vine = config => drawVine(svg, createVine({ ...shared, seed: rndSeed(), ...config }))

// 1. a straight run. the vine leaves the starting point, swings out one side, curls back over itself, crosses, and
// curls the other way — all of it one unbroken line
vine({ spine: lineSpine([18, 32], [192, 32]), reach: 11 })

// 2. the same, with the vine swelling as it goes. one turn covers a set amount of path per reach, so the coils grow
// along with it instead of staying the same size on a band that doesn't
vine({ spine: lineSpine([18, 82], [192, 82]), reach: [4, 15] })

// 3. a circular arc, bulging below its chord
vine({ spine: arcSpine([18, 132], [192, 132], 0.1), reach: 10 })

// 4. an oval, wound right round and joined back up where it started. a closed path takes a whole number of turns,
// which is what lets the two ends of the vine meet
vine({ spine: ellipseSpine({ center: [60, 212], rx: 37, ry: 27 }), reach: 8.5 })

// 5. a rosette, the vine following its own outline at a set clearance rather than a circle around it
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

vine({
  spine: sdfSpine({
    sdf: rosetteSdf(middle),
    center: rosette.center,
    gap: rosette.gap,
    smooth: rosette.smooth,
    maxRadius: 70,
  }),
  reach: rosette.reach,
})

// 6. the same run with the vine only ever curling one way, which leaves the curls all down one side and the other
// side a plain arc
vine({ spine: lineSpine([18, 278], [192, 278]), reach: 8, alternate: false, curl: 2 })

console.log({ hash, rosette: middle })

svg.mount()

// space saves the sheet
window.addEventListener('keydown', e => {
  if (e.code === 'Space') svg.download(`${hash}.svg`)
})
