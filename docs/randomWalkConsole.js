import { mountSimpleConsole } from './simpleConsole.js'
import { drawRandomWalk, paths, defaults } from './randomWalk.js'
import { rosetteControls } from './rosetteSettings.js'

// The console for the random walk (see randomWalk.js): its controls, with saved settings and presets (see
// simpleConsole.js). mount() builds it; studio.html calls it

const isRosette = settings => settings.path === 'rosette' || settings.path === 'all'
// the controls, a column for each part: the path (the rosette's own only when there is one), the walk, its spirals,
// and the pen
const components = [
  { name: 'path', fields: [
    { key: 'path', name: 'path', options: paths },
    { key: 'size', name: 'size (mm)', min: 10, max: 120, step: 1 },
    { key: 'amplitude', ...rosetteControls.amplitude, showIf: isRosette },
    { key: 'gears', name: 'gears', min: 1, max: 7, step: 1, showIf: isRosette },
  ] },
  { name: 'walk', fields: [
    { key: 'steps', name: 'steps', min: 200, max: 6000, step: 50 },
    { key: 'roughness', name: 'roughness', min: 0, max: 0.5, step: 0.005 },
    { key: 'smoothness', name: 'smoothness', min: 0, max: 0.995, step: 0.005 },
    { key: 'tether', name: 'tether', min: 0, max: 0.05, step: 0.0005 },
    { key: 'strands', name: 'strands', min: 1, max: 12, step: 1 },
  ] },
  { name: 'spirals', fields: [
    { key: 'branches', name: 'branches', min: 0, max: 40, step: 1 },
    { key: 'turns', name: 'turns', min: 0.25, max: 8, step: 0.25 },
    { key: 'spiral', name: 'size (mm)', min: 1, max: 40, step: 0.5 },
  ] },
  { name: 'pens', fields: [
    { key: 'color', name: 'pen', pen: true },
  ] },
]

// Builds the console into $art (where the walks go), $controls, and $hash, until signal aborts
export const mount = elements => mountSimpleConsole({
  storageKey: 'randomWalk',
  title: 'random walk',
  // drawn in pen A, on paper that fits all three side by side
  defaults: { ...defaults, color: 'A', paperWidth: 300, paperHeight: 110, paperMargin: 0 },
  components,
  draw: drawRandomWalk,
  filename: 'random-walk',
  ...elements,
})
