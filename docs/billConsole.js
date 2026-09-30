import { $, ls } from './$.js'
import { drawBill, styleNames, styleLabels, denominations, defaults } from './bill.js'
import { coloringField, coloringFromRule, cleanOrder } from './colorRules.js'
import { saveSettings, followSettings, presetsPanel, hashesPanel } from './presets.js'
import { pens, penLetters, penMenu, colorOf, pensInUse, pensPanel, palettesPanel, describePen } from './pens.js'
import { historyPanel } from './history.js'
import { addReset, copyOf } from './reset.js'
import { rangeField, pickValue, valueFromParam, isRange } from './rangeSlider.js'
import { randomHash } from './utils.js'
import { paperFields, onPaper } from './paper.js'
import { consoleSections } from './sections.js'
import { rosetteControls } from './rosetteSettings.js'

// The console behind bill.html: the note, and the controls that redraw it. Each menu pins one piece to a style (see
// styles.js) or a shape for its layers to follow, or leaves it to the hash on 'from the hash'. Refresh rolls a new
// hash, which remakes everything the menus haven't pinned. ?hash= opens a particular note (and its pieces can be set
// the same way: ?field=wavy&fieldShape=rect), and the one on show is always in the url as #hash. Every setting is kept
// in local storage, so a reload keeps them; reset goes back to the defaults

// the pieces the controls set, what each one is called on the note, and which menus it gets (all of them unless it
// says). the rings around the lettering and the oval rosettes behind the emblem have shapes of their own, so they get a
// style but no shape, and the oval rosettes and the shadow a box to turn them on
// each piece picks its own pens: pens are which of the note's colors it picks a pen for, and what the menu's called
const pieces = [
  // the note as a whole: what it's worth
  { key: 'note', label: 'note', menus: [], choices: { denomination: denominations } },
  // the lettering: whether it's there at all, and its pens
  { key: 'lettering', label: 'lettering', menus: [], lettering: true,
    pens: { display: 'title & denominations', serial: 'serial', series: 'series' } },
  { key: 'field', label: 'background', pens: { background: 'pen' } },
  // the border is either bands of pattern or a ring of medallions, and gets a menu to pick which
  { key: 'border', label: 'border', kinds: ['bands', 'rosettes'], pens: { border: 'pen', frame: 'rect pen' } },
  // the middle emblems, 1 the seal and 2 and 3 the oval rosettes behind it, each with a pattern and an order of pens
  // for their rings (see colorRules.js, and the settings group it's kept in)
  { key: 'seal', label: 'emblem 1', coloring: 'emblem' },
  { key: 'second', label: 'emblem 2', menus: ['styles'], toggle: true, coloring: 'second' },
  { key: 'third', label: 'emblem 3', menus: ['styles'], toggle: true, coloring: 'third' },
  { key: 'frames', label: 'text borders', menus: ['styles'], pens: { textBorders: 'pen' } },
  { key: 'shadow', label: 'background shadow', menus: [], toggle: true, pens: { tertiary: 'pen' } },
]

// what each piece can be set to: its style, and the shape its layers follow
const menus = [
  { group: 'styles', name: 'style', options: styleNames, labels: styleLabels },
  { group: 'shapes', name: 'shape', options: ['radial', 'rect'] },
]

// the sliders (and checkboxes and menus), a column's worth for each piece, every piece's rosettes' in the same order,
// after its style and shape: its symmetry, gear starts, and size, then its gears (how many, how far they swing it, and
// whether they're smoothed), then its layers (single layer, density, radia change), then its curves (curve hz and
// amplitude, and curve² amplitude and hz), then its noise, each run set off by a line (see rosetteSettings.js), then
// whatever else it has. group is the settings group each is kept in, key its setting there, and one with a kind only
// shows for that kind of border
const { size, density, gears, radialDensity, waveAmplitude, amplitude, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer, smoothed, symmetry, starts, radiaChange, columns, rows } = rosetteControls
// a piece's rosettes' controls, all kept by piece but its size and density, which are its own (and can be a kind's)
const rosetteOf = (piece, sizeAndDensity, extras=[]) => {
  const isDensity = ({ group, key }) => group === 'spacing' || key === 'spacing'
  return [
    { group: 'symmetry', key: piece, piece, ...symmetry },
    { group: 'starts', key: piece, piece, ...starts },
    ...sizeAndDensity.filter(slider => !isDensity(slider)),
    { divider: true, piece },
    { group: 'gears', key: piece, piece, ...gears },
    { group: 'amplitude', key: piece, piece, ...amplitude },
    { group: 'smoothed', key: piece, piece, ...smoothed },
    { divider: true, piece },
    { group: 'singleLayer', key: piece, piece, ...singleLayer },
    ...sizeAndDensity.filter(isDensity),
    { group: 'radiaChange', key: piece, piece, ...radiaChange },
    { divider: true, piece },
    { group: 'radialDensity', key: piece, piece, ...radialDensity },
    { group: 'waveAmplitude', key: piece, piece, ...waveAmplitude },
    { group: 'curveAmplitude', key: piece, piece, ...curveAmplitude },
    { group: 'curveHz', key: piece, piece, ...curveHz },
    { divider: true, piece },
    { group: 'noise', key: piece, piece, ...noise },
    { group: 'noiseSymmetry', key: piece, piece, ...noiseSymmetry },
    { group: 'noiseDepth', key: piece, piece, ...noiseDepth },
    { group: 'noiseDetail', key: piece, piece, ...noiseDetail },
    { group: 'noiseSeed', key: piece, piece, ...noiseSeed },
    ...(extras.length ? [{ divider: true, piece }, ...extras] : []),
  ]
}
const sliders = [
  // the background: how much of its cells it fills, and its grid
  ...rosetteOf('field', [
    { group: 'size', key: 'field', piece: 'field', ...size, max: 1 },
    { group: 'spacing', key: 'field', piece: 'field', ...density },
  ], [
    { group: 'columns', key: 'field', piece: 'field', ...columns },
    { group: 'rows', key: 'field', piece: 'field', ...rows, max: 12 },
  ]),
  // the border, as bands of pattern (how much of their cells they fill, and their grid) or as medallions (how big they
  // are, 1 just reaching halfway to the nearest one)
  ...rosetteOf('border', [
    { group: 'size', key: 'border', piece: 'border', kind: 'bands', ...size, max: 1 },
    { group: 'spacing', key: 'border', piece: 'border', kind: 'bands', ...density },
    { group: 'medallions', key: 'size', piece: 'border', kind: 'rosettes', ...size, min: 0.5, max: 3, step: 0.05 },
    { group: 'medallions', key: 'spacing', piece: 'border', kind: 'rosettes', ...density },
  ], [
    { group: 'columns', key: 'border', piece: 'border', kind: 'bands', ...columns },
    { group: 'rows', key: 'border', piece: 'border', kind: 'bands', ...rows, max: 8 },
    // the medallions: how many along the top and bottom and down the sides, how far in their centers run, how much
    // further in the corner ones sit (x and y together; below 0 is further out) and how big they are, how much further
    // in the lettering in the corners moves to clear them, and the white space they leave around what's under them
    { group: 'medallions', key: 'across', piece: 'border', kind: 'rosettes', name: 'across', min: 2, max: 16, step: 1 },
    { group: 'medallions', key: 'high', piece: 'border', kind: 'rosettes', name: 'high', min: 2, max: 8, step: 1 },
    { group: 'medallions', key: 'inset', piece: 'border', kind: 'rosettes', name: 'inset', min: -10, max: 25, step: 0.25 },
    { group: 'medallions', key: 'cornerOffset', piece: 'border', kind: 'rosettes', name: 'corners', min: -15, max: 15, step: 0.25 },
    { group: 'medallions', key: 'cornerSize', piece: 'border', kind: 'rosettes', name: 'corner size', min: 0.5, max: 3, step: 0.05 },
    { group: 'medallions', key: 'textInset', piece: 'border', kind: 'rosettes', name: 'text inset', min: 0, max: 20, step: 0.25 },
    { group: 'medallions', key: 'padding', piece: 'border', kind: 'rosettes', name: 'padding', min: 0, max: 10, step: 0.25 },
  ]),
  // the seal: how wide it is across (mm), and the white space around its outside, before whatever's behind it
  ...rosetteOf('seal', [
    { group: 'size', key: 'seal', piece: 'seal', ...size, name: 'size (mm)', min: 10, max: 70, step: 0.5 },
    { group: 'spacing', key: 'seal', piece: 'seal', ...density },
  ], [
    { group: 'emblem', key: 'padding', piece: 'seal', name: 'padding', min: 0, max: 10, step: 0.25 },
  ]),
  // the oval rosettes behind the emblem: how wide they are (mm), how flat, and the white space around their outsides
  ...['second', 'third'].flatMap(piece => rosetteOf(piece, [
    { group: piece, key: 'width', piece, ...size, name: 'size (mm)', min: 20, max: 180, step: 0.5 },
    { group: piece, key: 'spacing', piece, ...density },
  ], [
    { group: piece, key: 'ovalness', piece, name: 'ovalness', min: 0, max: 0.9, step: 0.01 },
    { group: piece, key: 'padding', piece, name: 'padding', min: 0, max: 10, step: 0.25 },
  ])),
  // the rings around the denominations and the title, and how many
  ...rosetteOf('frames', [
    { group: 'frames', key: 'spacing', piece: 'frames', ...density, min: 0.5 },
  ], [
    { group: 'frames', key: 'rings', piece: 'frames', name: 'rings', min: 1, max: 6, step: 1 },
  ]),
  // how far the background's shadow is moved over (right and down), in mm
  { group: 'shadow', key: 'x', piece: 'shadow', name: 'x offset', min: -5, max: 5, step: 0.05 },
  { group: 'shadow', key: 'y', piece: 'shadow', name: 'y offset', min: -5, max: 5, step: 0.05 },
]

const fromHash = 'from the hash'

// Builds the console into $art (where the drawing goes), $controls, and $hash, and draws. Everything it listens to
// outside of them stops when signal aborts, so another console can take its place (see studio.js)
export function mount({ $art, $controls, $hash, signal }) {
  signal?.addEventListener('abort', () => window.onkeydown = null)

  const params = new URLSearchParams(window.location.search)
  const capitalized = word => `${word[0].toUpperCase()}${word.slice(1)}`
  const paramFor = (key, group) => ({
    styles: key,
    shapes: `${key}Shape`,
    spacing: `${key}Spacing`,
    size: `${key}Size`,
    gears: `${key}Gears`,
    amplitude: `${key}Amplitude`,
    smoothed: `${key}Smoothed`,
    radiaChange: `${key}RadiaChange`,
    radialDensity: `${key}RadialDensity`,
    waveAmplitude: `${key}WaveAmplitude`,
    curveAmplitude: `${key}CurveAmplitude`,
    curveHz: `${key}CurveHz`,
    noise: `${key}Noise`,
    noiseSymmetry: `${key}NoiseSymmetry`,
    noiseDepth: `${key}NoiseDepth`,
    noiseDetail: `${key}NoiseDetail`,
    noiseSeed: `${key}NoiseSeed`,
    singleLayer: `${key}SingleLayer`,
    symmetry: `${key}Symmetry`,
    starts: `${key}Starts`,
    columns: `${key}Columns`,
    rows: `${key}Rows`,
    frames: `frame${capitalized(key)}`,
    second: `second${capitalized(key)}`,
    third: `third${capitalized(key)}`,
    emblem: `emblem${capitalized(key)}`,
    shadow: `shadow${capitalized(key)}`,
    medallions: `medallion${capitalized(key)}`,
  })[group]

  // every setting is saved as it's changed, so a reload picks up where it left off, and any other copy of the page
  // open follows along (the hash isn't, so a reload still makes a new note). what's in the url wins over what's saved,
  // and what's saved over the defaults. presets are saved settings too (see presets.js)
  const storageKey = 'billConsole'
  const groups = ['spacing', 'size', 'gears', 'amplitude', 'smoothed', 'radiaChange', 'radialDensity', 'waveAmplitude', 'curveAmplitude', 'curveHz', 'noise', 'noiseSymmetry', 'noiseDepth', 'noiseDetail', 'noiseSeed', 'singleLayer', 'symmetry', 'starts', 'columns', 'rows', 'frames', 'emblem', 'second', 'third', 'shadow', 'medallions', 'paper', 'pens']
  // the console's own: the paper the note goes on (the note's own size to start with), and which pen draws each of the
  // note's colors (see pens.js), by letter
  const consoleDefaults = {
    paper: { paperWidth: 195, paperHeight: 82.5, paperMargin: 0 },
    pens: {
      display: 'C', serial: 'B', series: 'A', background: 'A', border: 'A', frame: 'A', textBorders: 'A', tertiary: 'C',
    },
  }
  const defaultsFor = group => defaults[group] ?? consoleDefaults[group]
  // settings saved before every piece's rosettes could be adjusted alike: the background's grid and radia change, the
  // text borders' amplitude, and the medallions' smoothing (once positive) were each kept with the piece
  const upgrade = ({ grid, ...saved }) => {
    const put = (group, which, value) => {
      if (value !== undefined) saved[group] = { [which]: value, ...saved[group] }
    }
    put('columns', 'field', grid?.columns)
    put('rows', 'field', grid?.rows)
    put('radiaChange', 'field', grid?.radiaChange)
    put('amplitude', 'frames', saved.frames?.amplitude)
    put('smoothed', 'border', saved.medallions?.smoothed ?? saved.medallions?.positive)
    // pens once shared between pieces: primary drew the border, its rings, the text borders, and the series line, and
    // secondary the serial
    const { primary, secondary, ...pens } = saved.pens ?? {}
    if (primary || secondary) {
      const was = {
        ...Object.fromEntries(['series', 'background', 'border', 'frame', 'textBorders'].map(which => [which, primary])),
        serial: secondary,
        ...pens,
      }
      saved.pens = Object.fromEntries(Object.entries(was).filter(([, letter]) => penLetters.includes(letter)))
    }
    // an emblem's color rule (and how many rings its bands ran for), now a pattern and an order: solid was the
    // secondary pen
    for (const group of ['emblem', 'second', 'third']) {
      const { colors: rule, band, ...rest } = saved[group] ?? {}
      if (rule === undefined || 'pattern' in rest) continue
      const { pattern, order } = coloringFromRule(rule, { solid: secondary ?? 'B', count: pensInUse().length, band })
      saved[group] = { ...rest, pattern, order }
    }
    return saved
  }
  // a full set of settings from saved ones, with the defaults for anything they leave out
  const settingsFrom = (old={}) => {
    const saved = upgrade(old)
    const settings = {
      styles: { ...saved.styles },
      shapes: { ...saved.shapes },
      ...Object.fromEntries(groups.map(group => [group, { ...defaultsFor(group), ...saved[group] }])),
      borderKind: saved.borderKind ?? defaults.borderKind,
      denomination: saved.denomination ?? defaults.denomination,
      lettering: saved.lettering ?? defaults.lettering,
    }
    return settings
  }
  // the settings as they stand, without the hash
  const currentSettings = () => {
    const { hash, ...settings } = state
    return settings
  }

  const state = { hash: params.get('hash') ?? undefined, ...settingsFrom(ls.get(storageKey) ?? {}) }
  // ?borderKind=rosettes
  if (params.has('borderKind')) state.borderKind = params.get('borderKind')
  // ?denomination=20
  if (Number(params.get('denomination'))) state.denomination = Number(params.get('denomination'))
  // ?lettering=0 hides it
  if (params.has('lettering')) state.lettering = params.get('lettering') !== '0'
  // ?display=C&serial=B&background=A&border=A&frame=A picks the pens (a saved pen that isn't a letter goes back to its default)
  for (const which of Object.keys(consoleDefaults.pens)) {
    if (params.has(which)) state.pens[which] = params.get(which)
    if (!penLetters.includes(state.pens[which])) state.pens[which] = consoleDefaults.pens[which]
  }
  // ?paperWidth=210&paperHeight=297&paperMargin=10
  for (const { key } of paperFields) {
    if (Number(params.get(key)) > 0 || params.get(key) === '0') state.paper[key] = Number(params.get(key))
  }

  // the menus a piece has
  const menusOf = piece => menus.filter(({ group }) => (piece.menus ?? ['styles', 'shapes']).includes(group))
  for (const piece of pieces) {
    for (const { group } of menusOf(piece)) state[group][piece.key] = params.get(paramFor(piece.key, group)) ?? state[group][piece.key] ?? ''
    // ?emblemPattern=split&emblemOrder=ABBA (see colorRules.js)
    if (piece.coloring) {
      const group = piece.coloring
      if (params.has(paramFor('pattern', group))) state[group].pattern = params.get(paramFor('pattern', group))
      if (cleanOrder(params.get(paramFor('order', group)))) state[group].order = cleanOrder(params.get(paramFor('order', group)))
    }
    // ?second=1 turns it on
    if (piece.toggle && params.has(piece.key)) state[piece.key].on = params.get(piece.key) !== '0'
  }
  // ?fieldColumns=3&borderSmoothed=1
  for (const { group, key, check, options, ranged } of sliders) {
    if (!group) continue
    const set = params.get(paramFor(key, group))
    if (set === null) continue
    if (check) state[group][key] = set !== '0'
    else if (ranged) state[group][key] = valueFromParam(set) ?? state[group][key]
    else if (options) state[group][key] = options.includes(set) ? set : state[group][key]
    else if (set !== '' && !isNaN(set)) state[group][key] = Number(set)
  }

  const $note = $art
  const $menus = { styles: {}, shapes: {} }
  // for every control, a function that sets it to what the settings say, for when they're changed from outside it (a
  // preset loaded, or another copy of the page)
  const syncs = []
  // the sliders that can be ranges, and the values picked for the drawing on show from the ones that are (by their
  // group and key: 'amplitude.seal')
  const $ranges = []
  const picks = {}

  // the sliders that only belong to one kind of border, hidden while it's the other kind
  const $kindFields = []
  const showKinds = () => $kindFields.forEach(([$field, kind]) => $field.hidden = kind !== state.borderKind)

  // the console's sections (see sections.js): the note's own pieces go in its own, after its presets
  const { $drawing, $paper, $pens, $layout } = consoleSections($controls, 'note')
  $layout.append(presetsPanel({ signal, key: storageKey, current: currentSettings, apply: applySettings }))

  // a setting's row, with a button at its right end that puts it back to its default: reset puts the default (from a
  // full set of defaults) back where the setting's kept
  const withReset = ($field, reset) => addReset($field, () => {
    reset(settingsFrom({}))
    syncs.forEach(sync => sync())
    showKinds()
    draw()
  })

  // a column per piece, holding a menu for each thing it can be set to, each with the hash's own pick at the top
  for (const piece of pieces) {
    const { key, label, toggle } = piece
    const $piece = $.div(`<h2>${label}</h2>`, { class: 'piece' })
    // its colors, set apart at the bottom of it
    const $colors = $.div('<h3>colors</h3>', { class: 'colors' })

    if (toggle) {
      const $field = $.create('label')('<span>on</span>', { class: 'toggle' })
      const $check = $.create('input')('', { type: 'checkbox' })
      $check.checked = state[key].on
      syncs.push(() => $check.checked = state[key].on)
      $check.addEventListener('change', () => {
        state[key].on = $check.checked
        draw()
      })
      $field.prepend($check)
      $piece.append(withReset($field, fresh => state[key].on = fresh[key].on))
    }

    // whether the lettering is drawn: the denominations, the title, the serial and series, and their boxes
    if (piece.lettering) {
      const $field = $.create('label')('<span>on</span>', { class: 'toggle' })
      const $check = $.create('input')('', { type: 'checkbox' })
      $check.checked = state.lettering
      syncs.push(() => $check.checked = state.lettering)
      $check.addEventListener('change', () => {
        state.lettering = $check.checked
        draw()
      })
      $field.prepend($check)
      $piece.append(withReset($field, fresh => state.lettering = fresh.lettering))
    }

    // anything else about it that's picked from a list, like the note's denomination
    for (const [setting, options] of Object.entries(piece.choices ?? {})) {
      const $field = $.create('label')(`<span>${setting}</span>`)
      const $select = $.create('select')(options.map(option => `<option value="${option}">${option}</option>`))
      $select.value = state[setting]
      syncs.push(() => $select.value = state[setting])
      $select.addEventListener('change', () => {
        state[setting] = Number($select.value)
        draw()
      })
      $field.append($select)
      $piece.append(withReset($field, fresh => state[setting] = fresh[setting]))
    }

    // which kind it is, showing only the sliders for that kind
    if (piece.kinds) {
      const $field = $.create('label')('<span>kind</span>')
      const $select = $.create('select')(piece.kinds.map(kind => `<option value="${kind}">${kind}</option>`))
      $select.value = state.borderKind
      syncs.push(() => $select.value = state.borderKind)
      $select.addEventListener('change', () => {
        state.borderKind = $select.value
        showKinds()
        draw()
      })
      $field.append($select)
      $piece.append(withReset($field, fresh => state.borderKind = fresh.borderKind))
    }

    // how a middle emblem's rings are colored: a pattern, and an order of the pens in use
    if (piece.coloring) {
      const group = piece.coloring
      const $field = coloringField({
        name: 'rings',
        get: () => state[group],
        set: ({ pattern, order }) => {
          if (pattern) state[group].pattern = pattern
          if (order) state[group].order = order
          draw()
        },
      })
      syncs.push($field.sync)
      $colors.append(withReset($field, fresh => Object.assign(state[group], { pattern: fresh[group].pattern, order: fresh[group].order })))
    }

    // which pen draws each of the note's colors this piece has (see bill.js's defaults)
    for (const [which, name] of Object.entries(piece.pens ?? {})) {
      const $field = $.create('label')(`<span>${name}</span>`)
      const $menu = penMenu({ get: () => state.pens[which], set: letter => {
        state.pens[which] = letter
        draw()
      }, signal })
      syncs.push($menu.sync)
      $field.append($menu)
      $colors.append(withReset($field, fresh => state.pens[which] = fresh.pens[which]))
    }

    for (const { group, name, options, labels } of menusOf(piece)) {
      const $field = $.create('label')(`<span>${name}</span>`)

      const $select = $.create('select')([
        `<option value="">${fromHash}</option>`,
        ...options.map(option => `<option value="${option}">${labels?.[option] ?? option}</option>`),
      ])
      $select.value = state[group][key]
      syncs.push(() => $select.value = state[group][key] ?? '')
      $select.addEventListener('change', () => {
        state[group][key] = $select.value
        draw()
      })

      $field.append($select)
      $piece.append(withReset($field, () => state[group][key] = ''))
      $menus[group][key] = $select
    }

    // a slider draws denser to the right, so the ones set by spacing run backwards (smaller spacing, denser rosette)
    const ownSliders = sliders.filter(slider => slider.piece === key)
    for (const { group, key: setting, name, min, max, step, flip, kind, check, options, labels, divider, ranged } of ownSliders) {
      // a line between runs of controls
      if (divider) {
        $piece.append($.create('hr')('', { class: 'divider' }))
        continue
      }
      // a range, the value drawn picked from it (see rangeSlider.js)
      if (ranged) {
        const path = `${group}.${setting}`
        const $field = rangeField({ name, min, max, step, flip, get: () => state[group][setting], picked: () => picks[path], set: value => {
          state[group][setting] = value
          draw()
        } })
        if (kind) $kindFields.push([$field, kind])
        syncs.push($field.sync)
        $ranges.push($field)
        $piece.append(withReset($field, fresh => state[group][setting] = copyOf(fresh[group][setting])))
        continue
      }
      // a menu
      if (options) {
        const $field = $.create('label')(`<span>${name}</span>`)
        if (kind) $kindFields.push([$field, kind])
        const $select = $.create('select')(options.map(option => `<option value="${option}">${labels?.[option] ?? option}</option>`))
        const sync = () => $select.value = state[group][setting]
        sync()
        syncs.push(sync)
        $select.addEventListener('change', () => {
          state[group][setting] = $select.value
          draw()
        })
        $field.append($select)
        $piece.append(withReset($field, fresh => state[group][setting] = copyOf(fresh[group][setting])))
        continue
      }
      if (check) {
        const $field = $.create('label')(`<span>${name}</span>`, { class: 'toggle' })
        if (kind) $kindFields.push([$field, kind])
        const $check = $.create('input')('', { type: 'checkbox' })
        const sync = () => $check.checked = state[group][setting]
        sync()
        syncs.push(sync)
        $check.addEventListener('change', () => {
          state[group][setting] = $check.checked
          draw()
        })
        $field.prepend($check)
        $piece.append(withReset($field, fresh => state[group][setting] = copyOf(fresh[group][setting])))
        continue
      }
      const $field = $.create('label')(`<span>${name} <b></b></span>`)
      if (kind) $kindFields.push([$field, kind])

      const $range = $.create('input')('', { type: 'range', min, max, step })
      // a flipped slider's value is its setting mirrored, so dragging right always draws more
      const mirror = value => flip ? min + max - value : value
      $range.value = mirror(state[group][setting])

      const $value = $field.querySelector('b')
      const show = () => $value.textContent = flip || step < 0.01
        ? state[group][setting].toFixed(step < 0.01 ? 3 : 2)
        : state[group][setting]
      $range.addEventListener('input', () => {
        state[group][setting] = mirror(Number($range.value))
        show()
      })
      $range.addEventListener('change', draw)
      show()
      syncs.push(() => {
        $range.value = mirror(state[group][setting])
        show()
      })

      $field.append($range)
      $piece.append(withReset($field, fresh => state[group][setting] = copyOf(fresh[group][setting])))
    }

    if ($colors.children.length > 1) $piece.append($colors)
    $layout.append($piece)
  }

  showKinds()

  // loads settings from outside the controls (a preset, or another copy of the page), keeping the note's hash
  function applySettings(settings, andDraw=true) {
    Object.assign(state, settingsFrom(settings ?? {}))
    syncs.forEach(sync => sync())
    showKinds()
    if (andDraw) draw()
  }
  // the paper the note goes on, each typed in (a field left blank or invalid goes back to what it was)
  const $paperFields = $.div('', { class: 'piece' })
  for (const { key, name, min } of paperFields) {
    const $field = $.create('label')(`<span>${name}</span>`)
    const $number = $.create('input')('', { type: 'number', min, step: 'any' })
    const sync = () => $number.value = state.paper[key]
    sync()
    syncs.push(sync)
    $number.addEventListener('change', () => {
      if ($number.value !== '' && Number($number.value) >= min) state.paper[key] = Number($number.value)
      sync()
      draw()
    })
    $field.append($number)
    $paperFields.append(withReset($field, fresh => state.paper[key] = fresh.paper[key]))
  }
  $paper.append($paperFields)
  // the pens every layout shares, and their palettes
  $pens.append(pensPanel({ signal, title: null }), palettesPanel({ signal }))
  followSettings(storageKey, applySettings, signal)
  pens.subscribe(() => draw(), signal)

  // a new hash: everything the menus haven't pinned comes out different
  const $refresh = $.create('button')('refresh')
  $refresh.addEventListener('click', () => {
    state.hash = undefined
    draw()
  })
  // a hash saved with its settings and the pens it was drawn in, and loaded back with them (drawn once, whether the
  // pens change or not)
  $drawing.append($refresh, hashesPanel({ signal, key: storageKey,
    current: () => ({ hash: state.hash, settings: currentSettings(), pens: pens.get() }),
    apply: ({ hash, settings, pens: saved }) => {
      state.hash = hash
      if (settings) applySettings(settings, false)
      if (saved) pens.set(saved)
      else draw()
    },
  }))

  // the changes made this session, to go back through (see history.js): the settings and the pens, each change put in
  // the column it was made in. a setting's path is its group, then its key: for most, the key is the piece, and for
  // a piece's own group (the medallions', the oval rosettes', the text borders') it's the setting
  const labelOf = key => pieces.find(piece => piece.key === key)?.label ?? key
  // the groups that are a piece's own, and the piece
  const ownGroups = { medallions: 'border', emblem: 'seal', second: 'second', third: 'third', frames: 'frames', shadow: 'shadow' }
  const describe = path => {
    const [top, group, key] = path.split('.')
    if (top === 'pens') return describePen(group)
    if (group === 'paper') return { section: 'paper', name: paperFields.find(field => field.key === key)?.name ?? key }
    if (group === 'borderKind') return { section: 'border', name: 'kind' }
    if (group === 'denomination') return { section: 'note', name: 'denomination' }
    if (group === 'lettering') return { section: 'lettering', name: 'on' }
    // a piece's pen, in the column that picks it
    if (group === 'pens') {
      const piece = pieces.find(({ pens: roles }) => roles?.[key])
      return { section: piece?.label ?? 'pens', name: piece?.pens[key] ?? key }
    }
    if (group === 'styles' || group === 'shapes') return { section: labelOf(key), name: group === 'styles' ? 'style' : 'shape' }
    const slider = sliders.find(slider => slider.group === group && slider.key === key)
    if (slider) return { section: labelOf(slider.piece), name: slider.name }
    // a piece's own group, for what isn't a slider there: whether it's on, and its rings' colors
    const piece = ownGroups[group]
    if (piece) return { section: labelOf(piece), name: { on: 'on', pattern: 'rings pattern', order: 'rings order' }[key] ?? key }
    return { section: 'other', name: [group, key].filter(Boolean).join(' ') }
  }
  const history = historyPanel({
    signal,
    snapshot: () => ({ settings: currentSettings(), pens: pens.get() }),
    restore: ({ settings, pens: saved }) => {
      applySettings(settings, false)
      pens.set(saved)
    },
    describe,
  })
  $drawing.append(history.$panel)

  // back to the defaults (keeping the drawing's hash)
  const $reset = $.create('button')('reset')
  $reset.addEventListener('click', () => applySettings(null))
  $layout.append($reset)

  // only what's pinned is passed along; the rest is left to the hash
  const pinned = group => Object.fromEntries(Object.entries(state[group]).filter(([, value]) => value))

  function draw() {
    // every range's value, picked from the hash (so it needs one now, not from the drawing), and each settings group
    // with them in place of the ranges
    state.hash ??= randomHash()
    for (const { group, key, ranged, step } of sliders) {
      if (!ranged) continue
      const path = `${group}.${key}`
      if (isRange(state[group][key])) picks[path] = pickValue(state[group][key], { name: path, hash: state.hash, step })
      else delete picks[path]
    }
    const drawn = group => ({ ...state[group], ...Object.fromEntries(Object.entries(picks)
      .filter(([path]) => path.startsWith(`${group}.`)).map(([path, value]) => [path.slice(group.length + 1), value])) })
    const note = drawBill({
      hash: state.hash,
      styles: pinned('styles'),
      shapes: pinned('shapes'),
      spacing: drawn('spacing'),
      size: drawn('size'),
      gears: drawn('gears'),
      amplitude: drawn('amplitude'),
      smoothed: state.smoothed,
      radiaChange: drawn('radiaChange'),
      radialDensity: drawn('radialDensity'),
      waveAmplitude: drawn('waveAmplitude'),
      curveAmplitude: drawn('curveAmplitude'),
      curveHz: drawn('curveHz'),
      noise: drawn('noise'),
      noiseSymmetry: state.noiseSymmetry,
      noiseDepth: drawn('noiseDepth'),
      noiseDetail: drawn('noiseDetail'),
      noiseSeed: state.noiseSeed,
      singleLayer: state.singleLayer,
      symmetry: state.symmetry,
      starts: state.starts,
      columns: state.columns,
      rows: state.rows,
      frames: drawn('frames'),
      colors: Object.fromEntries(Object.entries(state.pens).map(([which, letter]) => [which, colorOf(letter)])),
      penColors: pensInUse().map(({ color }) => color),
      emblem: state.emblem,
      second: drawn('second'),
      third: drawn('third'),
      shadow: state.shadow,
      borderKind: state.borderKind,
      medallions: drawn('medallions'),
      denomination: state.denomination,
      lettering: state.lettering,
    })
    state.hash = note.hash
    $ranges.forEach($range => $range.show())
    saveSettings(storageKey, currentSettings())
    history.record()

    // on its paper
    const { paperWidth: width, paperHeight: height, paperMargin: margin } = state.paper
    const paper = onPaper(note.svg, { width, height, margin })
    $note.replaceChildren()
    paper.mount($note)
    $(paper.el, 'width', '100%')

    // what every piece ended up as, so the hash's own picks show up in the menus' labels
    for (const piece of pieces) {
      const { key } = piece
      for (const { group } of menusOf(piece)) {
        $menus[group][key].options[0].textContent = state[group][key] ? fromHash : `${fromHash} (${note[group][key]})`
      }
    }

    $hash.textContent = note.hash
    window.location.hash = `#${note.hash}`
    console.log(note)

    // space saves the note as it stands
    window.onkeydown = e => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        paper.download(`${note.hash}.svg`)
      }
    }
  }

  draw()
}
