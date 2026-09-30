import { mountSimpleConsole } from './simpleConsole.js'
import { styleLabels } from './bill.js'
import { drawWaveBorder, styleNames, defaults } from './waveBorder.js'
import { rosetteControls, upgradeSmoothed } from './rosetteSettings.js'

// The console for the wave border (see waveBorder.js): its controls, with saved settings and presets (see
// simpleConsole.js). mount() builds it; studio.html calls it

// the controls, a column for each part: the border it runs around, the rosette, in the same order as every layout's
// (see rosetteSettings.js), and the pen
const { density, gears, radialDensity, waveAmplitude, amplitude, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer, smoothed, symmetry, starts, radiaChange } = rosetteControls
const components = [
  { name: 'border', fields: [
    { key: 'width', name: 'width (mm)', number: true, min: 10 },
    { key: 'height', name: 'height (mm)', number: true, min: 10 },
    { key: 'margin', name: 'inset', min: 0, max: 60, step: 0.5 },
    { key: 'corner', name: 'corner', min: 0, max: 60, step: 0.5 },
    { key: 'band', name: 'band', min: 1, max: 40, step: 0.5 },
    { key: 'waves', name: 'waves', min: 1, max: 60, step: 1 },
    // mirrored both ways and meeting itself where it starts (the rosette's own symmetry is set aside while it is)
    { key: 'symmetrical', name: 'symmetrical', check: true },
  ] },
  { name: 'rosette', fields: [
    { key: 'style', name: 'style', options: ['', ...styleNames], labels: styleLabels, picked: border => border.style },
    { key: 'symmetry', ...symmetry, showIf: settings => !settings.symmetrical },
    { key: 'starts', ...starts },
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
  { name: 'pens', fields: [
    { key: 'color', name: 'pen', pen: true },
  ] },
]

// Builds the console into $art (where the border goes), $controls, and $hash, until signal aborts
export const mount = elements => mountSimpleConsole({
  storageKey: 'waveBorder',
  title: 'wave border',
  // drawn in pen A, on paper the sheet's own size
  defaults: { ...defaults, color: 'A', paperWidth: defaults.width, paperHeight: defaults.height, paperMargin: 0 },
  components,
  upgrade: upgradeSmoothed,
  draw: drawWaveBorder,
  filename: 'wave-border',
  ...elements,
})
