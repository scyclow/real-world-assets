import { mountSimpleConsole } from './simpleConsole.js'
import { styleLabels } from './bill.js'
import { drawRosetteBorder, styleNames, defaults } from './rosetteBorder.js'
import { rosetteControls, upgradeSmoothed } from './rosetteSettings.js'

// The console for the note's rosette border on its own (see rosetteBorder.js): its controls, with saved settings and
// presets (see simpleConsole.js). mount() builds it; rosetteBorder.html and studio.html call it

// the controls, a column for each part: the medallions' rosettes, in the same order as every layout's (see
// rosetteSettings.js), where they sit around the ring, and the pen. the ranges are the note's
const { size, density, gears, radialDensity, waveAmplitude, amplitude, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer, smoothed, symmetry, starts, radiaChange } = rosetteControls
const components = [
  { name: 'medallions', fields: [
    { key: 'style', name: 'style', options: ['', ...styleNames], labels: styleLabels, picked: border => border.style },
    { key: 'shape', name: 'shape', options: ['', 'radial', 'rect'], picked: border => border.shape },
    { key: 'symmetry', ...symmetry },
    { key: 'starts', ...starts },
    { key: 'size', ...size, min: 0.5, max: 3, step: 0.05 },
    { divider: true },
    { key: 'gears', ...gears },
    { key: 'amplitude', ...amplitude },
    { key: 'smoothed', ...smoothed },
    { divider: true },
    { key: 'singleLayer', ...singleLayer },
    { key: 'spacing', ...density },
    { key: 'radiaChange', ...radiaChange },
    { divider: true },
    { key: 'radialDensity', ...radialDensity },
    { key: 'waveAmplitude', ...waveAmplitude },
    { key: 'curveAmplitude', ...curveAmplitude },
    { key: 'curveHz', ...curveHz },
    { divider: true },
    { key: 'noise', ...noise },
    { key: 'noiseSymmetry', ...noiseSymmetry },
    { key: 'noiseDepth', ...noiseDepth },
    { key: 'noiseDetail', ...noiseDetail },
    { key: 'noiseSeed', ...noiseSeed },
  ] },
  { name: 'ring', fields: [
    { key: 'across', name: 'across', min: 2, max: 16, step: 1 },
    { key: 'high', name: 'high', min: 2, max: 8, step: 1 },
    { key: 'inset', name: 'inset', min: -10, max: 25, step: 0.25 },
    // how much further in the corner ones sit, x and y together (below 0 is further out), and how big they are
    { key: 'cornerOffset', name: 'corners', min: -15, max: 15, step: 0.25 },
    { key: 'cornerSize', name: 'corner size', min: 0.5, max: 3, step: 0.05 },
  ] },
  { name: 'pens', fields: [
    { key: 'color', name: 'pen', pen: true },
  ] },
]

// Builds the console into $art (where the border goes), $controls, and $hash, until signal aborts
export const mount = elements => mountSimpleConsole({
  storageKey: 'rosetteBorder',
  title: 'rosette border',
  // drawn in pen A, on paper the note's size
  defaults: { ...defaults, color: 'A', paperWidth: 195, paperHeight: 82.5, paperMargin: 0 },
  components,
  // smoothed was once positive
  upgrade: upgradeSmoothed,
  draw: drawRosetteBorder,
  filename: 'border',
  ...elements,
})
