import { setSeed, randomHash, PI, TWO_PI, hypot, min, max } from './utils.js'
import { pen } from './colors.js'
import { Svg } from './svg.js'
import { radialBase } from './bases.js'
import { generateFeatures } from './features.js'
import { createRosette, drawRosette } from './rosette.js'
import { features, styleNames, stableStyleNames } from './bill.js'
import { rosetteDefaults, gearOptionsFor } from './rosetteSettings.js'

// A rosette drawn around the border of a sheet instead of around a center: its primary gear, which would carry it
// around a circle, carries it along a sine wave running around a rounded rect instead. Going around the rosette is
// going around the border, and going out from its center is going out from the rect's line, by as much as the wave
// is high there, so where the wave dips below the line the rosette comes out upside down, and where it crosses the line
// it pinches away to nothing. Its style, gears, and everything else are just as they'd be around a center, following a
// different path. drawWaveBorder() draws one from a hash (a new one every time, unless it's handed one).
// waveBorderConsole.js drives it; studio.html opens that.

// the rosette's own size, which the border's band stands in for: its outermost layer reaches this far from its center
const reach = 30

const layout = {
  pointCount: 4000,
  clipStep: 0.5,
  strokeWidth: 0.3,
  strokeOpacity: 0.9,
}

// what the console starts at:
//   width, height: the sheet. margin: how far in from its edge the border's line runs. corner: how round its corners
//   are. band: how far either side of the line the rosette reaches, where the wave's highest. waves: how many times
//   the wave goes up and down, all the way around. symmetrical: every wave is a turn of the rosette's primary gear,
//   the whole rosette once over, so they're all alike, and (the rosette mirrored left to right, and an even number of
//   them) the border's mirrored left to right and top to bottom, and meets itself wherever it starts. otherwise, the
//   rosette goes around the border once, as its symmetry says, times a sine wave that goes up and down waves times
//   style ('' leaves it to the hash), spacing (how far apart its layers are, out of the rosette's own reach of 30), and
//   the rest of what every rosette can be adjusted by (see rosetteSettings.js), and its pen
export const defaults = {
  width: 200,
  height: 150,
  margin: 16,
  corner: 16,
  band: 10,
  waves: 14,
  symmetrical: true,
  style: 'standard',
  spacing: 2,
  ...rosetteDefaults,
  symmetry: 'vertical',
  color: 'black',
}

export { styleNames }

// A rounded rect's line, inset from a width x height sheet: progress (0-1 of the way around, clockwise from the middle
// of its top) => { point, normal }, normal pointing out
export function roundedRect(width, height, inset, radius) {
  const [x0, y0, x1, y1] = [inset, inset, width - inset, height - inset]
  const r = max(0, min(radius, (x1 - x0) / 2, (y1 - y0) / 2))
  const straight = (a, b, normal) => ({
    length: hypot(b[0] - a[0], b[1] - a[1]),
    at: f => ({ point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], normal }),
  })
  const arc = ([cx, cy], from) => ({
    length: PI / 2 * r,
    at: f => {
      const a = from + PI / 2 * f
      return { point: [cx + r * Math.cos(a), cy + r * Math.sin(a)], normal: [Math.cos(a), Math.sin(a)] }
    },
  })
  const middle = (x0 + x1) / 2
  const pieces = [
    straight([middle, y0], [x1 - r, y0], [0, -1]),
    arc([x1 - r, y0 + r], -PI / 2),
    straight([x1, y0 + r], [x1, y1 - r], [1, 0]),
    arc([x1 - r, y1 - r], 0),
    straight([x1 - r, y1], [x0 + r, y1], [0, 1]),
    arc([x0 + r, y1 - r], PI / 2),
    straight([x0, y1 - r], [x0, y0 + r], [-1, 0]),
    arc([x0 + r, y0 + r], PI),
    straight([x0 + r, y0], [middle, y0], [0, -1]),
  ]
  const total = pieces.reduce((sum, { length }) => sum + length, 0)
  return progress => {
    let along = (((progress % 1) + 1) % 1) * total
    for (const piece of pieces) {
      if (along <= piece.length || piece === pieces.at(-1)) return piece.at(piece.length ? min(1, along / piece.length) : 0)
      along -= piece.length
    }
  }
}

// Draws a wave border (see defaults for what can be set). Returns it, its hash, and the style it came out in
export function drawWaveBorder({ hash=randomHash(), ...settings }={}) {
  const s = { ...defaults, ...settings }
  setSeed(hash)
  const { strokeWidth, strokeOpacity } = layout
  const svg = new Svg({ width: s.width, height: s.height, background: '#fff' })
  const stroke = pen[s.color] ?? s.color

  const rolled = generateFeatures({
    ...features,
    styleChances: s.style ? { [s.style]: 1 } : Object.fromEntries(stableStyleNames.map(name => [name, 1])),
    palette: [stroke],
    gearOptions: { ...gearOptionsFor(features.gearOptions, s), oddRotations: false },
  })

  const path = roundedRect(s.width, s.height, s.margin, s.corner)
  // where along the border (0-1 of the way around, from the top's middle) and how far off it (out, or in below 0) a
  // point angle radians around the rosette and at height from its center goes, for the rosette drawn once all the
  // way around: along by its angle, off by its height, scaled from the rosette's reach to the band's
  const place = (along, height) => {
    const { point: [px, py], normal: [nx, ny] } = path(along)
    const off = height / reach * s.band
    return [px + nx * off, py + ny * off]
  }
  // a point's angle around the rosette, as far around as its layer's got (progress), give or take where its gears have
  // swung it, so it goes on past a whole turn rather than jumping back
  const angleOf = ([x, y], progress) => {
    const around = TWO_PI * progress
    let swung = Math.atan2(x, y) - around
    swung -= TWO_PI * Math.round(swung / TWO_PI)
    return around + swung
  }

  const spacing = max(0.05, s.spacing)
  const waves = s.symmetrical ? max(2, 2 * Math.round(s.waves / 2)) : s.waves
  const rosette = createRosette({
    ...rolled,
    radiaChange: s.radiaChange,
    radialDensity: s.radialDensity,
    waveAmplitude: s.waveAmplitude,
    curveAmplitude: s.curveAmplitude,
    curveHz: s.curveHz,
    noise: s.noise,
    noiseSymmetry: s.noiseSymmetry,
    noiseDepth: s.noiseDepth,
    noiseDetail: s.noiseDetail,
    noiseSeed: s.noiseSeed,
    singleLayer: s.singleLayer,
    // symmetrical, every wave's mirrored about its crest, which is all mirrored left to right needs
    symmetry: s.symmetrical ? 'vertical' : s.symmetry,
    starts: s.starts,
    colorFn: () => stroke,
    pointCount: s.symmetrical ? 900 : layout.pointCount,
    clipStep: layout.clipStep,
    strokeWidth,
    strokeOpacity,
    base: radialBase(),
    spacing,
    minSize: spacing,
    layers: max(1, Math.floor(reach / spacing)),
    // symmetrical, it's drawn around its center as usual, and laid along each wave below. otherwise, as it's drawn,
    // it's laid along the whole border at once: its angle all the way around it, and its distance from its center off
    // it, times a sine wave that goes up and down waves times, and turns it over where it dips below the line
    project: s.symmetrical ? null : ([x, y], progress) => {
      const angle = angleOf([x, y], progress)
      return place(angle / TWO_PI, hypot(x, y) * Math.sin(waves * angle))
    },
  })

  if (!s.symmetrical) drawRosette(svg, rosette)
  else {
    // symmetrical, the primary gear's circle becomes a sine wave: every turn of it is a wave, the rosette's height (its
    // height from its center, straight down being up, off the border) the wave's, so every wave's the whole rosette,
    // over and over around the border, turning over in every trough and pinching away where it crosses the line. each
    // of the rosette's lines, as it was drawn around its center, is followed point by point to see how far around it
    // goes (on past a whole turn, rather than jumping back), and one that goes all the way around goes on to where it
    // started, a turn on, so it runs into the next wave's without a gap
    for (const { points, closed, stroke: color } of rosette.strokes) {
      if (points.length < 2) continue
      let turn = Math.atan2(points[0][0], points[0][1]) / TWO_PI
      const followed = points.map(([x, y], j) => {
        if (j) {
          let step = Math.atan2(x, y) / TWO_PI - turn
          step -= Math.round(step)
          turn += step
        }
        return [turn, y]
      })
      let line = followed
      if (closed) {
        // how far on its start is, from its end, going the way it goes
        let step = followed[0][0] - turn
        step -= Math.round(step)
        const wound = Math.round(turn + step - followed[0][0])
        line = [...followed, [followed[0][0] + wound, followed[0][1]]]
      }
      for (let i = 0; i < waves; i++) {
        const placed = line.map(([turn, height]) => place((i + turn) / waves, height))
        svg.path(`M ${placed.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')}`, { stroke: color, strokeWidth, strokeOpacity })
      }
    }
  }

  return { hash, svg, style: rosette.config.style, settings: s, rosette }
}
