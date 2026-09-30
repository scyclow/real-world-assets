import { $, ls } from './$.js'
import { saveSettings, followSettings, presetsPanel, hashesPanel } from './presets.js'
import { pens, penLetters, penMenu, colorOf, pensPanel, palettesPanel, describePen } from './pens.js'
import { historyPanel } from './history.js'
import { addReset, copyOf } from './reset.js'
import { rangeField, pickValue, valueFromParam, isRange } from './rangeSlider.js'
import { randomHash } from './utils.js'
import { paperFields, paperOf, onPaper } from './paper.js'
import { consoleSections } from './sections.js'

// A console for a drawing whose settings are a flat set of values: columns of controls that redraw it, its settings
// kept in local storage (so a reload keeps them, and any other copy of the page open follows along) and savable as
// named presets, its hashes savable by name too (see presets.js), refresh for a new hash, and reset for the defaults.
// It goes on paper, which has its own settings (see paper.js), in the pens every layout shares (see pens.js). What's
// in the url wins over what's saved, and what's saved over the defaults: ?hash= opens a particular drawing, and any
// setting can be set the same way. The one on show is always in the url as #hash, and space saves it.
//
// components are the controls, a column for each part of the drawing: [{ name, fields }], fields in order, each one of:
//   { key, name, options, labels, picked }: a menu (an option '' is 'from the hash', naming what the hash picked when
//     there's a picked(result) to say what that was)
//   { key, name, min, max, step, flip }: a slider (a flipped one runs backwards, so dragging right always draws denser)
//   { key, name, number: true, min }: a number typed in
//   { key, name, check: true }: a checkbox
//   { key, name, pen: true }: which pen draws something, by letter (the drawing's handed that pen's color)
//   { divider: true }: a line between runs of controls
//   and a slider with ranged: true can be a range ([low, high], two handles on one track), the value drawn picked
//     between the two from the hash (see rangeSlider.js)
// and any of them can have showIf(settings), to show it only when that's true. defaults has one for each, and for the
// paper: paperWidth, paperHeight, and paperMargin. upgrade(settings) brings settings saved before now up to date.
// draw(settings) draws it, returning { hash, svg }. It's all built into $art (the drawing), $controls (in the sections
// every console has, see sections.js, the last called title), and $hash, and everything it listens to outside of
// them stops when signal aborts
export function mountSimpleConsole({ storageKey, title, defaults, components, upgrade=settings => settings, draw: drawIt, filename, $art, $controls, $hash, signal }) {
  const params = new URLSearchParams(window.location.search)
  const fromHash = 'from the hash'
  const fields = components.flatMap(({ fields }) => fields)
  const allFields = [...paperFields, ...fields]

  const state = { ...defaults, ...upgrade(ls.get(storageKey) ?? {}), hash: params.get('hash') ?? undefined }
  for (const { key, options, check, pen, ranged } of allFields) {
    if (!key || !params.has(key)) continue
    const set = params.get(key)
    if (check) state[key] = set !== '0'
    else if (ranged) state[key] = valueFromParam(set) ?? state[key]
    else if (options || pen) state[key] = set
    else if (set !== '' && !isNaN(set)) state[key] = Number(set)
  }
  // a pen saved as a color, from before pens were picked by letter, goes back to its default
  for (const { key, pen } of fields) {
    if (pen && !penLetters.includes(state[key])) state[key] = defaults[key]
  }
  // the settings as they stand, without the hash
  const currentSettings = () => {
    const { hash, ...settings } = state
    return settings
  }

  // for every control, a function that sets it to what the settings say, for when they're changed from outside it (a
  // preset loaded, or another copy of the page), and the ones only shown sometimes
  const syncs = []
  const $conditional = []
  const showFields = () => $conditional.forEach(([$field, showIf]) => $field.hidden = !showIf(state))
  // the menus that can be left to the hash, with what the hash picked for them
  const $picks = []
  // the sliders that can be ranges, and the values picked for the drawing on show from the ones that are
  const $ranges = []
  const picks = {}

  function field({ key, name, options, labels, picked, check, number, pen, min, max, step, flip, showIf, divider, ranged }) {
    // a line between runs of controls
    if (divider) return $.create('hr')('', { class: 'divider' })
    let $field
    if (ranged) {
      $field = rangeField({ name, min, max, step, flip, get: () => state[key], picked: () => picks[key], set: value => {
        state[key] = value
        redraw()
      } })
      syncs.push($field.sync)
      $ranges.push($field)
    } else if (check) {
      $field = $.create('label')(`<span>${name}</span>`, { class: 'toggle' })
      const $check = $.create('input')('', { type: 'checkbox' })
      const sync = () => $check.checked = state[key]
      sync()
      syncs.push(sync)
      $check.addEventListener('change', () => {
        state[key] = $check.checked
        redraw()
      })
      $field.prepend($check)
    } else if (pen) {
      $field = $.create('label')(`<span>${name}</span>`)
      const $menu = penMenu({ get: () => state[key], set: letter => {
        state[key] = letter
        redraw()
      }, signal })
      syncs.push($menu.sync)
      $field.append($menu)
    } else if (options) {
      $field = $.create('label')(`<span>${name}</span>`)
      const $select = $.create('select')(options.map(option =>
        `<option value="${option}">${labels?.[option] ?? (option || fromHash)}</option>`))
      const sync = () => $select.value = state[key]
      sync()
      syncs.push(sync)
      $select.addEventListener('change', () => {
        state[key] = $select.value
        redraw()
      })
      $field.append($select)
      if (picked) $picks.push([$select, key, picked])
    } else if (number) {
      // typed in, and only taken once it's a number (a field left blank or invalid goes back to what it was)
      $field = $.create('label')(`<span>${name}</span>`)
      const $number = $.create('input')('', { type: 'number', min, step: step ?? 'any' })
      const sync = () => $number.value = state[key]
      sync()
      syncs.push(sync)
      $number.addEventListener('change', () => {
        const value = Number($number.value)
        if ($number.value !== '' && value >= min) state[key] = value
        sync()
        redraw()
      })
      $field.append($number)
    } else {
      $field = $.create('label')(`<span>${name} <b></b></span>`)
      const $range = $.create('input')('', { type: 'range', min, max, step })
      const mirror = value => flip ? min + max - value : value
      const $value = $field.querySelector('b')
      const show = () => $value.textContent = flip || step < 0.01 ? state[key].toFixed(3) : state[key]
      const sync = () => {
        $range.value = mirror(state[key])
        show()
      }
      sync()
      syncs.push(sync)
      $range.addEventListener('input', () => {
        state[key] = mirror(Number($range.value))
        show()
      })
      $range.addEventListener('change', redraw)
      $field.append($range)
    }
    if (showIf) $conditional.push([$field, showIf])
    // a button at the row's right end that puts it back to its default
    if (key in defaults) addReset($field, () => {
      state[key] = copyOf(defaults[key])
      syncs.forEach(sync => sync())
      redraw()
    })
    return $field
  }
  const column = (heading, columnFields) => {
    const $column = $.div(heading ? `<h2>${heading}</h2>` : '', { class: 'piece' })
    $column.append(...columnFields.map(field))
    return $column
  }
  const { $drawing, $paper, $pens, $layout } = consoleSections($controls, title)

  // a new hash: new gears, and whatever else is left to the hash
  const $refresh = $.create('button')('refresh')
  $refresh.addEventListener('click', () => {
    state.hash = undefined
    redraw()
  })

  const $columns = components.map(({ name, fields }) => column(name, fields))
  // back to the defaults (keeping the drawing's hash)
  const $reset = $.create('button')('reset')
  $reset.addEventListener('click', () => applySettings(null))
  $columns.at(-1).append($reset)

  // loads settings from outside the controls (a preset, or another copy of the page), keeping the drawing's hash
  function applySettings(settings, andDraw=true) {
    Object.assign(state, defaults, upgrade(settings ?? {}))
    syncs.forEach(sync => sync())
    if (andDraw) redraw()
  }
  // a hash saved with its settings and the pens it was drawn in, and loaded back with them (drawn once, whether the
  // pens change or not)
  $drawing.append($refresh, hashesPanel({ signal, key: storageKey,
    current: () => ({ hash: state.hash, settings: currentSettings(), pens: pens.get() }),
    apply: ({ hash, settings, pens: saved }) => {
      state.hash = hash
      if (settings) applySettings(settings, false)
      if (saved) pens.set(saved)
      else redraw()
    },
  }))
  $paper.append(column(null, paperFields))
  $pens.append(pensPanel({ signal, title: null }), palettesPanel({ signal }))
  $layout.append(presetsPanel({ key: storageKey, current: currentSettings, apply: applySettings, signal }), ...$columns)
  followSettings(storageKey, applySettings, signal)
  pens.subscribe(() => redraw(), signal)
  signal?.addEventListener('abort', () => window.onkeydown = null)

  // the changes made this session, to go back through (see history.js): the settings and the pens, each change put
  // in its column (the paper's in the paper's)
  const where = new Map([
    ...paperFields.map(({ key, name }) => [key, { section: 'paper', name }]),
    ...components.flatMap(({ name: section, fields }) => fields.map(({ key, name }) => [key, { section, name }])),
  ])
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
  $drawing.append(history.$panel)

  function redraw() {
    showFields()
    // every range's value, picked from the hash (so it needs one now, not from the drawing)
    state.hash ??= randomHash()
    for (const { key, ranged, step } of fields) {
      if (!ranged) continue
      if (isRange(state[key])) picks[key] = pickValue(state[key], { name: key, hash: state.hash, step })
      else delete picks[key]
    }
    // each pen picked by letter is handed to the drawing as its color
    const drawing = drawIt({
      ...state,
      ...picks,
      ...Object.fromEntries(fields.filter(({ pen }) => pen).map(({ key }) => [key, colorOf(state[key])])),
    })
    $ranges.forEach($range => $range.show())
    state.hash = drawing.hash
    saveSettings(storageKey, currentSettings())
    history.record()
    const paper = onPaper(drawing.svg, paperOf(state))

    $art.replaceChildren()
    paper.mount($art)
    $(paper.el, 'width', '100%')

    for (const [$select, key, picked] of $picks) {
      $select.options[0].textContent = state[key] ? fromHash : `${fromHash} (${picked(drawing)})`
    }
    $hash.textContent = drawing.hash
    window.location.hash = `#${drawing.hash}`
    console.log(drawing)

    // space saves it as it stands, on its paper
    window.onkeydown = e => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        paper.download(`${filename}-${drawing.hash}.svg`)
      }
    }
  }

  redraw()
}
