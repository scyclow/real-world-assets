import { $, ls } from './$.js'
import { saveSettings, followSettings, presetsPanel, hashesPanel } from './presets.js'
import { pens, penLetters, pensPanel, palettesPanel, describePen } from './pens.js'
import { historyPanel } from './history.js'
import { addReset, copyOf } from './reset.js'
import { rangeField, pickValue, valueFromParam, isRange } from './rangeSlider.js'
import { randomHash } from './utils.js'
import { consoleSections } from './sections.js'
import { rosetteControls } from './rosetteSettings.js'
import { drawRosetteGrid, styleNames, upgradeSettings, defaults } from './rosetteGrid.js'
import { styleLabels } from './bill.js'
import { coloringField, randomColoring, cleanOrder } from './colorRules.js'

// The console behind rosetteGrid.html: the sheet, and the controls that redraw it. Refresh rolls a new hash. ?hash=
// opens a particular sheet, any setting can be set the same way (?columns=6&style=wavy&smoothed=1), and the one on show
// is always in the url as #hash. Every setting is kept in local storage, so a reload keeps them and any other copy of
// the page open follows along, and they can be saved as named presets, and hashes by name too (see presets.js); reset
// goes back to the defaults. It draws in the pens every layout shares (see pens.js), which can be saved as palettes.
// Space saves it

// Builds the console into $art (where the drawing goes), $controls, and $hash, and draws. Everything it listens to
// outside of them stops when signal aborts, so another console can take its place (see studio.js)
export function mount({ $art, $controls, $hash, signal }) {
  signal?.addEventListener('abort', () => window.onkeydown = null)

  const params = new URLSearchParams(window.location.search)

  // the controls, in groups: menus, sliders (one set by spacing runs backwards so dragging right always draws denser),
  // numbers to type in, and checkboxes. the rosettes' come in the same order as every layout's (see
  // rosetteSettings.js). the pens are every layout's (see pens.js), and come after the colors
  const { size, density, gears, radialDensity, waveAmplitude, amplitude, curveAmplitude, curveHz, noise, noiseSymmetry, noiseDepth, noiseDetail, noiseSeed, singleLayer, smoothed, symmetry, starts, radiaChange, columns, rows } = rosetteControls
  const controls = [
    { group: 'paper', fields: [
      { key: 'width', name: 'width', number: true, min: 1, step: 'any' },
      { key: 'height', name: 'height', number: true, min: 1, step: 'any' },
      { key: 'margin', name: 'margin', number: true, min: 0, step: 'any' },
    ] },
    // how each rosette looks
    { group: 'rosette', fields: [
      { key: 'style', name: 'style', options: ['random', ...styleNames], labels: styleLabels },
      { key: 'shape', name: 'shape', options: ['radial', 'rect', 'random'] },
      { key: 'symmetry', ...symmetry },
      { key: 'starts', ...starts },
      { key: 'size', ...size },
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
    // how they're laid out: the grid, and whether every cell's rosette is the same
    { group: 'rosette layout', fields: [
      { key: 'columns', ...columns },
      { key: 'rows', ...rows },
      { key: 'gap', name: 'gap', min: 0, max: 30, step: 0.25 },
      { key: 'sameGears', name: 'same in every cell', check: true },
    ] },
    { group: 'colors', fields: [
      // the colorings every rosette picks one of at random, each a pattern and the pens' order (see colorRules.js)
      { colorings: true },
    ] },
  ]
  const fields = controls.flatMap(({ fields }) => fields)

  // what's in the url wins over what's saved, and what's saved over the defaults (the hash isn't saved, so a reload
  // still makes a new sheet)
  const storageKey = 'rosetteGrid'
  // (brought up to date before the defaults fill in the rest, so an old setting isn't lost under a default)
  const state = { ...defaults, ...upgradeSettings(ls.get(storageKey) ?? {}), hash: params.get('hash') ?? undefined }
  // the settings as they stand, without the hash
  const currentSettings = () => {
    const { hash, ...settings } = state
    return settings
  }
  // ?colors=4&colorA=%23ff0000&colorB=teal&widthA=0.5 sets the pens (every layout's)
  const penParams = {}
  if (Number(params.get('colors')) > 0) penParams.colors = Number(params.get('colors'))
  for (const letter of penLetters) {
    if (params.has(`color${letter}`)) penParams[`color${letter}`] = params.get(`color${letter}`)
    if (Number(params.get(`width${letter}`)) > 0) penParams[`width${letter}`] = Number(params.get(`width${letter}`))
  }
  if (Object.keys(penParams).length) pens.set(penParams)
  for (const { key, options, check, ranged } of fields) {
    if (!key || !params.has(key)) continue
    const set = params.get(key)
    if (check) state[key] = set !== '0'
    else if (ranged) state[key] = valueFromParam(set) ?? state[key]
    else if (options) state[key] = set
    else if (set !== '' && !isNaN(set)) state[key] = Number(set)
  }
  // ?colorings=single:ABC:2,random:AAB (a weight at the end, or 1) (and before that ?colorPattern=split&colorOrder=ABBA, for one)
  if (params.has('colorings')) {
    const colorings = params.get('colorings').split(',').map(coloring => coloring.split(':'))
      .map(([pattern, order, weight]) => ({ pattern, order: cleanOrder(order) || 'A', weight: Number(weight) >= 0 && weight !== undefined ? Number(weight) : 1 }))
    if (colorings.length) state.colorings = colorings
  }
  if (params.has('colorPattern')) state.colorings = [{ pattern: params.get('colorPattern'), order: cleanOrder(params.get('colorOrder')) || 'A' }]
  Object.assign(state, upgradeSettings(state))

  const $sheet = $art
  const $selects = {}
  // for every control, a function that sets it to what the settings say, for when they're changed from outside it (a
  // preset loaded, or another copy of the page)
  const syncs = []
  // the sliders that can be ranges, and the values picked for the drawing on show from the ones that are
  const $ranges = []
  const picks = {}

  // the console's sections (see sections.js): the paper's controls go in its own, the colors in the pens', right
  // under the pens every layout shares and their palettes, and the rest in the grid's, after its presets
  const { $drawing, $paper, $pens, $layout } = consoleSections($controls, 'rosette grid')
  $pens.append(pensPanel({ signal, title: null }), palettesPanel({ signal }))
  $layout.append(presetsPanel({ signal, key: storageKey, current: currentSettings, apply: applySettings }))

  // a column per group
  // a setting's row, with a button at its right end that puts it back to its default
  const withReset = ($field, key) => key in defaults ? addReset($field, () => {
    state[key] = copyOf(defaults[key])
    syncs.forEach(sync => sync())
    draw()
  }) : $field

  for (const { group, fields } of controls) {
    const $group = $.div(group === 'paper' ? '' : `<h2>${group}</h2>`, { class: 'piece' })

    for (const { key, name, options, labels, check, number, colorings, divider, ranged, min, max, step, flip } of fields) {
      // a line between runs of controls
      if (divider) {
        $group.append($.create('hr')('', { class: 'divider' }))
      } else if (ranged) {
        // a range, the value drawn picked from it (see rangeSlider.js)
        const $field = rangeField({ name, min, max, step, flip, get: () => state[key], picked: () => picks[key], set: value => {
          state[key] = value
          draw()
        } })
        syncs.push($field.sync)
        $ranges.push($field)
        $group.append(withReset($field, key))
      } else if (colorings) {
        // a row for each coloring, with its weight, and buttons to shuffle it (make it up again at random, from the pens in use) and to
        // delete it (all but the last one left), then one to add another
        const $list = $.div('', { class: 'colorings' })
        const change = colorings => {
          state.colorings = colorings
          render()
          draw()
        }
        // the rows are only rebuilt when one's added or deleted; otherwise each shows its coloring as it is now, so a
        // weight being typed in, or stepped up and down with the arrow keys, keeps its focus
        let $fields = []
        const render = () => {
          if ($fields.length === state.colorings.length) return $fields.forEach($field => $field.sync())
          $fields = state.colorings.map((_, i) => coloringField({
            name: null,
            get: () => state.colorings[i],
            weighted: true,
            set: changes => change(state.colorings.map((coloring, j) => j === i ? { ...coloring, ...changes } : coloring)),
            // a new pattern and order, keeping its weight
            shuffle: () => change(state.colorings.map((coloring, j) => j === i ? { ...coloring, ...randomColoring(pens.get().colors) } : coloring)),
            remove: () => change(state.colorings.filter((_, j) => j !== i)),
            canRemove: () => state.colorings.length > 1,
          }))
          $list.replaceChildren(...$fields)
        }
        render()
        syncs.push(render)
        const $add = $.create('button')('add', { type: 'button' })
        $add.addEventListener('click', () => change([...state.colorings, { pattern: 'single', order: 'A' }]))
        const $buttons = $.div('', { class: 'buttons' })
        $buttons.append($add)
        $group.append(withReset($.create('label')('<span>colorings (each rosette picks one, by weight)</span>'), 'colorings'), $list, $buttons)
      } else if (number) {
        // typed in, and only taken once it's a number (a field left blank or invalid goes back to what it was)
        const $field = $.create('label')(`<span>${name}</span>`)
        const $number = $.create('input')('', { type: 'number', min, step })
        const sync = () => $number.value = state[key]
        sync()
        syncs.push(sync)
        $number.addEventListener('change', () => {
          const value = Number($number.value)
          if ($number.value !== '' && value >= min) state[key] = value
          sync()
          draw()
        })
        $field.append($number)
        $group.append(withReset($field, key))
      } else if (check) {
        const $field = $.create('label')(`<span>${name}</span>`, { class: 'toggle' })
        const $check = $.create('input')('', { type: 'checkbox' })
        $check.checked = state[key]
        syncs.push(() => $check.checked = state[key])
        $check.addEventListener('change', () => {
          state[key] = $check.checked
          draw()
        })
        $field.prepend($check)
        $group.append(withReset($field, key))
      } else if (options) {
        const $field = $.create('label')(`<span>${name}</span>`)
        const $select = $.create('select')(options.map(option => `<option value="${option}">${labels?.[option] ?? option}</option>`))
        $select.value = state[key]
        syncs.push(() => $select.value = state[key])
        $select.addEventListener('change', () => {
          state[key] = $select.value
          draw()
        })
        $field.append($select)
        $group.append(withReset($field, key))
        $selects[key] = $select
      } else {
        const $field = $.create('label')(`<span>${name} <b></b></span>`)
        const $range = $.create('input')('', { type: 'range', min, max, step })
        const mirror = value => flip ? min + max - value : value
        $range.value = mirror(state[key])

        const $value = $field.querySelector('b')
        const show = () => $value.textContent = flip || step < 0.01 ? state[key].toFixed(3) : state[key]
        $range.addEventListener('input', () => {
          state[key] = mirror(Number($range.value))
          show()
        })
        $range.addEventListener('change', draw)
        show()
        syncs.push(() => {
          $range.value = mirror(state[key])
          show()
        })

        $field.append($range)
        $group.append(withReset($field, key))
      }
    }

    const $section = { paper: $paper, colors: $pens }[group] ?? $layout
    $section.append($group)
  }

  // loads settings from outside the controls (a preset, or another copy of the page), keeping the sheet's hash
  function applySettings(settings, andDraw=true) {
    Object.assign(state, defaults, upgradeSettings(settings ?? {}))
    syncs.forEach(sync => sync())
    if (andDraw) draw()
  }
  followSettings(storageKey, applySettings, signal)
  pens.subscribe(() => draw(), signal)

  // the changes made this session, to go back through (see history.js): the settings and the pens, each change put in
  // its column
  const where = new Map(controls.flatMap(({ group, fields }) => fields.map(({ key, name, colorings }) =>
    [colorings ? 'colorings' : key, { section: group, name: colorings ? 'colorings' : name }])))
  const history = historyPanel({
    signal,
    snapshot: () => ({ settings: currentSettings(), pens: pens.get() }),
    restore: ({ settings, pens: saved }) => {
      applySettings(settings, false)
      pens.set(saved)
    },
    describe: path => {
      const [top, key] = path.split('.')
      return top === 'pens' ? describePen(key) : where.get(key) ?? { section: 'other', name: key }
    },
  })

  // a new hash: new gears, and new styles and shapes where they're random
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
  }), history.$panel)

  // back to the defaults (keeping the drawing's hash)
  const $reset = $.create('button')('reset')
  $reset.addEventListener('click', () => applySettings(null))
  $layout.append($reset)

  function draw() {
    // every range's value, picked from the hash (so it needs one now, not from the drawing)
    state.hash ??= randomHash()
    for (const { key, ranged, step } of fields) {
      if (!ranged) continue
      if (isRange(state[key])) picks[key] = pickValue(state[key], { name: key, hash: state.hash, step })
      else delete picks[key]
    }
    const sheet = drawRosetteGrid({ ...state, ...picks, ...pens.get() })
    $ranges.forEach($range => $range.show())
    state.hash = sheet.hash
    saveSettings(storageKey, currentSettings())
    history.record()

    $sheet.replaceChildren()
    sheet.svg.mount($sheet)
    $(sheet.svg.el, 'width', '100%')

    $hash.textContent = sheet.hash
    window.location.hash = `#${sheet.hash}`
    console.log(sheet)

    // space saves the sheet as it stands
    window.onkeydown = e => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        sheet.svg.download(`rosettes-${sheet.hash}.svg`)
      }
    }
  }

  draw()
}
