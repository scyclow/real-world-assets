import { symmetries, symmetryLabels, gearStartOptions } from './gears.js'

// What every rosette (or set of rosettes drawn alike) in every layout can be adjusted by, and the controls for it, so
// they're the same everywhere: its style, size, density (how close its layers are), how far its gears swing it
// (amplitude, as a fraction of each layer's size, half of that at least), whether they're smoothed (every gear turning
// forwards, the same way as the base gear, see generateGears), how many gears ride on it, how much their radia shrink from its innermost layer
// to its outermost (radia change, 0 or more on the sliders), and its columns and rows, where it's repeated over a grid. density
// is how much it draws going out from its center to its outline, and radial density how much going around it (see
// radialCounts in styles.js: its lines, waves, dashes, and so on, times radial density), and wave amplitude how high
// its style's waves, bumps, and spikes go (see waveHeights in styles.js), unlike amplitude, which is its gears'. symmetry is how it's mirrored:
// left to right (vertical), top to bottom (horizontal), both, or none (see withSymmetry in gears.js). what each layout
// starts at is its own, since a pattern needs both for its cells to meet at their seams. starts is where its gears
// start: fixed, or even (each a half turn in, or not, see withStarts in gears.js). curve amplitude and curve hz are how
// far its style's curves (spikes, waves, swings) reach, going around it: hz times all the way around, from as far as
// they'd reach to amplitude times that and back (see curveAt
// in rosette.js), and noise how much
// radial Perlin noise pushes its layers in and out (see noiseAt in rosette.js). single layer draws just its outermost
// layer, in its style, where every layer would fill it in otherwise

export const rosetteDefaults = {
  gears: 7, amplitude: 0.05, smoothed: false, noiseSymmetry: 'rosette', noiseDepth: 1.6, noiseDetail: 1.4, noiseSeed: 0, radiaChange: 0, radialDensity: 1, waveAmplitude: 1, starts: 'fixed', noise: 0, curveAmplitude: 1, curveHz: 0, singleLayer: false,
}

// gearOptions (for generateFeatures) with gears, amplitude, and smoothed applied. the gears roll the same either way,
// just scaled or turned around, and there are always the most there can be rolled (the first gears of them kept), so
// changing any of them changes nothing else the hash rolls
export const MAX_GEARS = 12
export const gearOptionsFor = (gearOptions, { gears=rosetteDefaults.gears, amplitude=rosetteDefaults.amplitude, smoothed=false }={}) =>
  ({ ...gearOptions, count: gears, rolled: MAX_GEARS, radiaMin: amplitude / 2, radiaMax: amplitude, positive: smoothed })

// the controls' names and ranges, for a console to give each its own key (density sets spacing, so it runs backwards:
// dragging right always draws denser)
// (what they're called: radial density is curve hz, how many curves go around; wave amplitude is curve amplitude, how
// far they reach; and curve amplitude and hz are curve² amplitude and hz, how that reach itself rises and falls going
// around. the settings keep their own names)
// (ranged: can be a range, [low, high], with the value drawn picked between the two from the hash, see rangeSlider.js)
export const rosetteControls = {
  size: { name: 'size', min: 0.2, max: 1.5, step: 0.01, ranged: true },
  density: { name: 'density', min: 0.3, max: 10, step: 0.025, flip: true, ranged: true },
  radialDensity: { name: 'curve hz', min: 0.25, max: 4, step: 0.05, ranged: true },
  waveAmplitude: { name: 'curve amplitude', min: 0, max: 6, step: 0.05, ranged: true },
  gears: { name: 'gears', min: 1, max: MAX_GEARS, step: 1, ranged: true },
  amplitude: { name: 'amplitude', min: 0, max: 0.4, step: 0.005, ranged: true },
  curveAmplitude: { name: 'curve² amplitude', min: 0, max: 3, step: 0.05, ranged: true },
  curveHz: { name: 'curve² hz', min: 0, max: 16, step: 1, ranged: true },
  noiseSymmetry: { name: 'noise symmetry', options: ['rosette', 'none', 'vertical', 'horizontal', 'both'], labels: { rosette: "the rosette's", none: 'none', vertical: 'vertical (left = right)', horizontal: 'horizontal (top = bottom)', both: 'both' } },
  noiseDepth: { name: 'noise depth', min: 0, max: 6, step: 0.05, ranged: true },
  noiseDetail: { name: 'noise detail', min: 0.2, max: 6, step: 0.05, ranged: true },
  noiseSeed: { name: 'noise seed', min: 0, max: 100, step: 1 },
  noise: { name: 'noise amplitude', min: 0, max: 0.5, step: 0.005, ranged: true },
  singleLayer: { name: 'single layer', check: true },
  smoothed: { name: 'smoothed', check: true },
  symmetry: { name: 'symmetry', options: symmetries, labels: symmetryLabels },
  starts: { name: 'gear starts', options: gearStartOptions },
  radiaChange: { name: 'radia change', min: 0, max: 0.15, step: 0.0025, ranged: true },
  columns: { name: 'columns', min: 1, max: 20, step: 1 },
  rows: { name: 'rows', min: 1, max: 20, step: 1 },
}

// settings saved before smoothed was called that: positive, and before that curvey
export function upgradeSmoothed({ positive, ...settings }) {
  return positive === undefined || 'smoothed' in settings ? settings : { ...settings, smoothed: positive }
}
