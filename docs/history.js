import { $ } from './$.js'
import { penName } from './colors.js'

// The changes made to a console's settings this session, to go back through and forward again (it starts over when
// the page is reloaded, or another layout's shown). snapshot() is everything that makes the drawing what it is (its
// settings and the pens), restore(snapshot) puts one back and draws it, and describe(path) says where a setting is
// ({ section, name }), its path being its keys, outermost first, joined by dots. record() takes a snapshot after every
// drawing, and keeps it if anything's different. Returns { $panel, record }: $panel a column with back and forward, and
// every change, grouped by the section it was made in (picking one goes to just after it). ⌘Z (ctrl+z) goes back, and
// ⇧⌘Z (ctrl+y) forward, when there's no box being typed in. Stops listening for the keys when signal aborts
export function historyPanel({ signal, snapshot, restore, describe }) {
  const copy = value => JSON.parse(JSON.stringify(value))
  // every snapshot so far, the first as it started, each after with what changed from the one before, and which one's
  // on show (the ones after it can be gone forward to, until something else changes)
  let states = []
  let at = -1
  let restoring = false

  const $panel = $.div('<h2>history</h2>', { class: 'piece history' })
  const $buttons = $.div('', { class: 'buttons' })
  const $back = $.create('button')('← back', { type: 'button', title: 'undo (⌘Z)' })
  const $forward = $.create('button')('forward →', { type: 'button', title: 'redo (⇧⌘Z)' })
  const $list = $.div('', { class: 'changes' })
  $buttons.append($back, $forward)
  $panel.append($buttons, $list)

  function go(to) {
    if (to < 0 || to >= states.length || to === at) return
    at = to
    restoring = true
    try {
      restore(copy(states[at].state))
    } finally {
      restoring = false
    }
    render()
  }
  $back.addEventListener('click', () => go(at - 1))
  $forward.addEventListener('click', () => go(at + 1))
  window.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.target.matches?.('input[type="text"], input[type="number"], textarea')) return
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey) go(at - 1)
    else if ((key === 'z' && e.shiftKey) || key === 'y') go(at + 1)
    else return
    e.preventDefault()
  }, { signal })

  // every setting, by its path, so two snapshots can be told apart setting by setting (a list, like the colorings, is
  // one setting)
  const flatten = (value, path=[]) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, inner]) => flatten(inner, [...path, key]))
    : [[path.join('.'), value]]
  const differences = (before, after) => {
    const was = new Map(flatten(before))
    return flatten(after)
      .filter(([path, value]) => JSON.stringify(was.get(path)) !== JSON.stringify(value))
      .map(([path, value]) => ({ path, from: was.get(path), to: value, ...describe(path) }))
  }

  // a setting's value as it's shown: numbers to three places at most, checkboxes as on and off, pens by name
  const shown = value => {
    if (typeof value === 'number') return String(Math.round(value * 1000) / 1000)
    if (typeof value === 'boolean') return value ? 'on' : 'off'
    if (typeof value === 'string') return value.startsWith('#') ? penName(value) : value || '—'
    if (value === undefined || value === null) return '—'
    // a range ([low, high], or pinned: [low, high, pinned]) as its ends, or its pinned value
    if (Array.isArray(value) && value.length <= 3 && value.every(v => typeof v === 'number')) {
      return value.length === 3 ? `${shown(value[2])} (pinned)` : `${shown(value[0])}–${shown(value[1])}`
    }
    return Array.isArray(value) ? `${value.length} ${value.length === 1 ? 'item' : 'items'}` : JSON.stringify(value)
  }

  function render() {
    $back.disabled = at <= 0
    $forward.disabled = at >= states.length - 1
    // the changes, section by section, in the order each section was first changed, latest first within it
    const sections = new Map()
    states.forEach(({ changes }, i) => changes?.forEach(change => {
      if (!sections.has(change.section)) sections.set(change.section, [])
      sections.get(change.section).push({ ...change, i })
    }))
    if (!sections.size) {
      $list.replaceChildren($.create('span')('no changes yet', { class: 'empty' }))
      return
    }
    $list.replaceChildren(...[...sections].map(([section, changes]) => {
      const $section = $.div(`<h3>${section}</h3>`, { class: 'section-changes' })
      for (const { name, from, to, i } of changes.reverse()) {
        const $change = $.create('button')('', { type: 'button', class: `change${i > at ? ' undone' : ''}${i === at ? ' current' : ''}` })
        $change.textContent = `${name}: ${shown(from)} → ${shown(to)}`
        $change.title = i > at ? 'undone: pick it to go forward to it' : 'go back to just after this'
        $change.addEventListener('click', () => go(i))
        $section.append($change)
      }
      return $section
    }))
  }

  // after every drawing: a change made (rather than one gone back or forward to) is kept, and anything that had been
  // gone back past is let go
  function record() {
    if (restoring) return
    const now = copy(snapshot())
    if (at >= 0 && JSON.stringify(now) === JSON.stringify(states[at].state)) return
    states = states.slice(0, at + 1)
    states.push({ state: now, changes: at >= 0 ? differences(states[at].state, now) : null })
    at = states.length - 1
    render()
  }

  render()
  return { $panel, record }
}
