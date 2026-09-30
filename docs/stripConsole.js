import { mountSimpleConsole } from './simpleConsole.js'
import { styleLabels } from './bill.js'
import { drawStrip, styleNames, defaults } from './strip.js'
import { rosetteControls } from './rosetteSettings.js'

// The console for the strip (see strip.js): its controls, with saved settings and presets (see simpleConsole.js).
// mount() builds it; strip.html and studio.html call it

// the controls, a column for each part: the medallions' rosettes, in the same order as every layout's (see
// rosetteSettings.js), where they sit around the ring, the empty middle, and the pen
const { size, density, gears, radialDensity, waveAmplitude, amplitude, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer, smoothed, symmetry, starts, radiaChange } = rosetteControls
const components = [
  { name: 'medallions', fields: [
    { key: 'style', name: 'style', options: ['', ...styleNames], labels: styleLabels, picked: strip => strip.style },
    { key: 'shape', name: 'shape', options: ['radial', 'rect'] },
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
    { key: 'across', name: 'across', min: 2, max: 30, step: 1 },
    { key: 'high', name: 'high', min: 2, max: 6, step: 1 },
    { key: 'inset', name: 'inset', min: -10, max: 15, step: 0.25 },
  ] },
  { name: 'middle', fields: [
    { key: 'holeWidth', name: 'width', min: 0, max: 200, step: 1 },
    { key: 'holeHeight', name: 'height', min: 0, max: 30, step: 0.5 },
  ] },
  { name: 'pens', fields: [
    { key: 'color', name: 'pen', pen: true },
  ] },
]

// Builds the console into $art (where the strip goes), $controls, and $hash, until signal aborts
export const mount = elements => mountSimpleConsole({
  storageKey: 'strip',
  title: 'strip',
  // drawn in pen A, on paper the strip's own size
  defaults: { ...defaults, color: 'A', paperWidth: 200, paperHeight: 30, paperMargin: 0 },
  components,
  draw: drawStrip,
  filename: 'strip',
  ...elements,
})
