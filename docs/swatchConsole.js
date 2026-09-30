import { mountSimpleConsole } from './simpleConsole.js'
import { styleLabels } from './bill.js'
import { drawSwatch, styleNames, defaults } from './swatch.js'
import { rosetteControls } from './rosetteSettings.js'

// The console for the swatch (see swatch.js): its controls, with saved settings and presets (see simpleConsole.js).
// mount() builds it; swatch.html and studio.html call it

const isLayout = layout => settings => settings.layout === layout
// the controls, a column for each part: the pattern's rosettes, in the same order as every layout's (see
// rosetteSettings.js), then how the swatch is cut into cells (only what belongs to the layout picked shows), and the
// shadow
const { size, density, gears, radialDensity, waveAmplitude, amplitude, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer, smoothed, symmetry, starts, radiaChange, columns, rows } = rosetteControls
const components = [
  { name: 'pattern', fields: [
    { key: 'style', name: 'style', options: ['', ...styleNames], labels: styleLabels, picked: swatch => swatch.style },
    { key: 'shape', name: 'shape', options: ['', 'radial', 'rect'], picked: swatch => swatch.shape },
    { key: 'symmetry', ...symmetry },
    { key: 'starts', ...starts },
    { key: 'size', ...size, max: 1 },
    { divider: true },
    { key: 'gears', ...gears },
    { key: 'amplitude', ...amplitude },
    { key: 'smoothed', ...smoothed },
    { divider: true },
    { key: 'singleLayer', ...singleLayer },
    { key: 'spacing', ...density, min: 0.4 },
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
    { divider: true },
    { key: 'color', name: 'pen', pen: true },
  ] },
  { name: 'cells', fields: [
    { key: 'layout', name: 'layout', options: ['subdivide', 'grid'] },
    { key: 'columns', ...columns, max: 10, showIf: isLayout('grid') },
    { key: 'rows', ...rows, max: 16, showIf: isLayout('grid') },
    { key: 'depth', name: 'splits', min: 0, max: 10, step: 1, showIf: isLayout('subdivide') },
    { key: 'minCell', name: 'smallest cell', min: 3, max: 50, step: 0.5, showIf: isLayout('subdivide') },
  ] },
  { name: 'shadow', fields: [
    { key: 'shadow', name: 'on', check: true },
    { key: 'shadowColor', name: 'pen', pen: true },
    { key: 'shadowX', name: 'x offset', min: -5, max: 5, step: 0.05 },
    { key: 'shadowY', name: 'y offset', min: -5, max: 5, step: 0.05 },
  ] },
]

// Builds the console into $art (where the swatch goes), $controls, and $hash, until signal aborts
export const mount = elements => mountSimpleConsole({
  storageKey: 'swatch',
  title: 'swatch',
  // drawn in pen A with its shadow in B, on paper the swatch's own size
  defaults: { ...defaults, color: 'A', shadowColor: 'B', paperWidth: 60, paperHeight: 100, paperMargin: 0 },
  components,
  draw: drawSwatch,
  filename: 'swatch',
  ...elements,
})
