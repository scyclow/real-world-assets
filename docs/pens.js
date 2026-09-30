import { $, ls } from './$.js'
import { pen, upgradePenColor } from './colors.js'
import { saveSettings, presetsPanel } from './presets.js'

// The pens every layout draws with, shared between them all: how many are in use (1 to 6, A first), and each one's
// color and how thick it draws (in the paper's units). They're kept in local storage, so they carry over from one
// layout to the next, a reload keeps them, and any other copy of the page follows along. Layouts pick which pen draws
// what by letter (see penMenu), and the paper sets each pen's thickness after the drawing's been scaled onto it (see
// paper.js). The controls for them are pensPanel() and palettesPanel()

export const penLetters = ['A', 'B', 'C', 'D', 'E', 'F']
export const penKeys = penLetters.map(letter => `color${letter}`)
export const widthKeys = penLetters.map(letter => `width${letter}`)

// a color as #rrggbb, which is what a color picker wants: a pen's name (see colors.js), or a #rgb spelled out
export function toHex(color) {
  const hex = pen[color] ?? color
  return typeof hex === 'string' && /^#[0-9a-f]{3}$/i.test(hex) ? `#${[...hex.slice(1)].map(c => c + c).join('')}` : hex
}

export const penDefaults = {
  colors: 3,
  ...Object.fromEntries(penKeys.map((key, i) => [key, toHex(['black', 'blue', 'red', 'green', 'orange', 'purple'][i])])),
  ...Object.fromEntries(widthKeys.map(key => [key, 0.3])),
}

const storageKey = 'pens'

// saved pens, with the defaults for anything missing and every color as #rrggbb (one saved before the pens were
// Microns as the Micron that took its place)
function complete(saved) {
  const pens = { ...penDefaults, ...saved }
  for (const key of penKeys) pens[key] = upgradePenColor(toHex(pens[key]))
  pens.colors = Math.max(1, Math.min(penLetters.length, pens.colors))
  return pens
}

// before they were shared, the pens were the rosette grid's own settings, so the first time they're picked up from there
function fromRosetteGrid() {
  const grid = ls.get('rosetteGrid') ?? {}
  return Object.fromEntries(['colors', ...penKeys, ...widthKeys].filter(key => key in grid).map(key => [key, grid[key]]))
}

let current = complete(ls.get(storageKey) ?? fromRosetteGrid())
const listeners = new Set()
const tell = () => listeners.forEach(listener => listener(current))

export const pens = {
  // the pens as they stand
  get: () => current,
  // changes some of them (only what's given), and tells everyone listening
  set(changes) {
    current = complete({ ...current, ...changes })
    saveSettings(storageKey, current)
    tell()
  },
  // listener(pens) whenever they change, until signal aborts
  subscribe(listener, signal) {
    listeners.add(listener)
    signal?.addEventListener('abort', () => listeners.delete(listener))
  },
}

// another copy of the page changing them
window.addEventListener('storage', e => {
  if (e.key !== storageKey) return
  current = complete(e.newValue ? JSON.parse(e.newValue) : {})
  tell()
})

// the pens in use, in order: { letter, color, width }
export const pensInUse = (p=current) =>
  penLetters.slice(0, p.colors).map((letter, i) => ({ letter, color: p[penKeys[i]], width: p[widthKeys[i]] }))

// the color of the pen with this letter, or of the last one in use if it's past them
export function colorOf(letter) {
  const inUse = pensInUse()
  return (inUse.find(p => p.letter === letter) ?? inUse.at(-1)).color
}

// how thick a color draws: as thick as the first pen in use that's that color
export const widthOf = color => pensInUse().find(p => p.color.toLowerCase() === String(color).toLowerCase())?.width


// ---------------------------------------------------------------------------------------------------- controls

// the pens by name (see colors.js), and the name of a color if it's one of theirs
const penNames = Object.keys(pen)
const nameOf = color => penNames.find(name => toHex(pen[name]) === color)
const swatch = color => `<i class="swatch" style="background: ${color}"></i>${nameOf(color) ?? color}`

// A menu of the pens in use for picking which one draws something, by letter (with its color), kept up to date as the
// pens change. get() is the letter picked now, and set(letter) is handed a new one
export function penMenu({ get, set, signal }) {
  const $select = $.create('select')('')
  const render = () => {
    const inUse = pensInUse()
    $select.replaceChildren(...inUse.map(({ letter, color }) => {
      const $option = $.create('option')('', { value: letter })
      $option.textContent = `${letter} · ${nameOf(color) ?? color}`
      return $option
    }))
    // a letter past the pens in use draws with the last of them
    $select.value = inUse.some(p => p.letter === get()) ? get() : inUse.at(-1).letter
  }
  $select.addEventListener('change', () => set($select.value))
  pens.subscribe(render, signal)
  render()
  return Object.assign($select, { sync: render })
}

// The pens' column: − and + for how many are in use, then a row for each, with its color and how thick it draws, dragged
// by its handle to put them in a different order (a pen's thickness goes with it), headed by title (if there's one).
// Stops following the pens when signal aborts
export function pensPanel({ signal, title='pens' }={}) {
  const $panel = $.div(title ? `<h2>${title}</h2>` : '', { class: 'piece' })
  const $palette = $.div('', { class: 'palette' })
  const $stepper = $.div('<span>pens</span>', { class: 'stepper' })
  const $less = $.create('button')('−', { type: 'button' })
  const $count = $.create('b')('')
  const $more = $.create('button')('+', { type: 'button' })
  const $rows = $.div('', { class: 'pens' })
  // under them, every pen's thickness at once: it says what they all are when they're the same, and nothing when
  // they're not. setting it sets every pen's, the ones not in use too, so a pen added after draws the same
  const $all = $.div('<span class="handle">⠿</span><span>·</span><span class="every">every pen</span>', { class: 'pen all' })
  const $allWidths = $.create('input')('', { type: 'number', min: 0.05, step: 0.05, title: 'every pen\'s thickness', placeholder: 'mixed' })
  $allWidths.addEventListener('change', () => {
    const width = Number($allWidths.value)
    if ($allWidths.value !== '' && width > 0) pens.set(Object.fromEntries(widthKeys.map(key => [key, width])))
    else showAll()
  })
  const showAll = () => {
    const widths = [...new Set(pensInUse().map(({ width }) => width))]
    const shown = widths.length === 1 ? widths[0] : ''
    // left alone while it's what's being typed in and already says the same
    if (document.activeElement !== $allWidths || Number($allWidths.value) !== shown) $allWidths.value = shown
  }
  $all.append($allWidths)
  $stepper.append($less, $count, $more)
  $palette.append($stepper, $rows, $all)
  $panel.append($palette)

  $less.addEventListener('click', () => pens.set({ colors: current.colors - 1 }))
  $more.addEventListener('click', () => pens.set({ colors: current.colors + 1 }))

  // closes every open menu of colors, or with a click, every one it isn't inside
  const closePickers = e => $panel.querySelectorAll('.picker .list').forEach($list => {
    if (!e || !$list.parentElement.contains(e.target)) $list.hidden = true
  })
  document.addEventListener('click', closePickers, { signal })

  // a menu of the colors, each by its name. pick is handed the one picked, as #rrggbb. show(color) shows another
  function penPicker(pick) {
    const $picker = $.div('', { class: 'picker' })
    const $button = $.create('button')('', { type: 'button', class: 'picked' })
    const $list = $.div(penNames.map(name =>
      `<button type="button" data-pen="${name}">${swatch(toHex(pen[name]))}</button>`), { class: 'list' })
    $list.hidden = true
    const show = color => {
      $button.innerHTML = swatch(color)
      $list.querySelectorAll('[data-pen]').forEach($option => $option.classList.toggle('on', toHex(pen[$option.dataset.pen]) === color))
    }
    $button.addEventListener('click', () => {
      const open = $list.hidden
      closePickers()
      $list.hidden = !open
    })
    $list.addEventListener('click', e => {
      const $option = e.target.closest('[data-pen]')
      if (!$option) return
      $list.hidden = true
      pick(toHex(pen[$option.dataset.pen]))
    })
    $picker.append($button, $list)
    return Object.assign($picker, { show })
  }

  // moves the pen at from to to, shifting the ones between along
  const move = (from, to) => {
    if (from === to) return
    const moved = pensInUse().map(({ color, width }) => [color, width])
    moved.splice(to, 0, ...moved.splice(from, 1))
    pens.set(Object.fromEntries(moved.flatMap(([color, width], i) => [[penKeys[i], color], [widthKeys[i], width]])))
  }

  // a row for the pen at i, built once and kept (so a thickness being typed in, or stepped up and down with the arrow
  // keys, keeps its focus as the pens change), and show(pen) to show what it is now
  let dragging = null
  const row = i => {
    const letter = penLetters[i]
    const $row = $.div(`<span class="handle" title="drag to reorder">⠿</span><span>${letter}</span>`, { class: 'pen' })
    const $handle = $row.querySelector('.handle')
    const $width = $.create('input')('', { type: 'number', min: 0.05, step: 0.05, title: 'thickness' })
    $width.addEventListener('change', () => {
      if (Number($width.value) > 0) pens.set({ [widthKeys[i]]: Number($width.value) })
      else $width.value = current[widthKeys[i]]
    })
    const $picker = penPicker(picked => pens.set({ [penKeys[i]]: picked }))
    $row.append($picker, $width)
    $row.show = ({ color, width }) => {
      $picker.show(color)
      // left alone while it's what's being typed in and already says the same
      if (Number($width.value) !== width || document.activeElement !== $width) $width.value = width
    }

    // only the handle starts a drag, so the thickness can still be selected and typed in
    $handle.addEventListener('pointerdown', () => $row.draggable = true)
    $handle.addEventListener('pointerup', () => $row.draggable = false)
    $row.addEventListener('dragstart', e => {
      dragging = i
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', letter)
      $row.classList.add('dragging')
    })
    $row.addEventListener('dragend', () => {
      dragging = null
      $row.draggable = false
      $row.classList.remove('dragging')
      $rows.querySelectorAll('.over').forEach($over => $over.classList.remove('over'))
    })
    $row.addEventListener('dragover', e => {
      if (dragging === null) return
      e.preventDefault()
      $row.classList.add('over')
    })
    $row.addEventListener('dragleave', () => $row.classList.remove('over'))
    $row.addEventListener('drop', e => {
      e.preventDefault()
      if (dragging !== null) move(dragging, i)
    })
    return $row
  }

  // the rows are only added or taken away as the pens in use are; otherwise each shows its pen as it is now
  const $penRows = []
  function render() {
    $count.textContent = current.colors
    $less.disabled = current.colors <= 1
    $more.disabled = current.colors >= penLetters.length
    const inUse = pensInUse()
    inUse.forEach((p, i) => ($penRows[i] ??= row(i)).show(p))
    if ($rows.children.length !== inUse.length) $rows.replaceChildren(...$penRows.slice(0, inUse.length))
    showAll()
  }
  pens.subscribe(render, signal)
  render()
  return $panel
}

// Named palettes of the pens: how many are in use, and their colors and thicknesses (see presets.js). They're kept
// under the rosette grid's old palettes, so those are all still there
export const palettesPanel = ({ signal }={}) => presetsPanel({
  key: 'rosetteGridPalette',
  title: 'palettes',
  current: () => current,
  apply: palette => pens.set(palette),
  signal,
})

// what a change to the pens is called in a console's history (see history.js), by the pen setting's key
export function describePen(key) {
  if (key === 'colors') return { section: 'pens', name: 'pens in use' }
  const [, what, letter] = key.match(/^(color|width)([A-F])$/) ?? []
  return { section: 'pens', name: what ? `${letter} ${what === 'color' ? 'color' : 'width'}` : key }
}
