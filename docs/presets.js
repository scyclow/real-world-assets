import { $, ls } from './$.js'

// Settings kept in local storage for the consoles, and named presets of them, kept in step across every open copy of
// the page: when one copy changes the settings or the presets, the others pick the change up straight away (the
// browser tells every other window when local storage changes, though never the one that changed it).

// Saves a console's settings under key, unless they're already what's saved (so copies of the page picking up each
// other's changes don't set each other off again)
export function saveSettings(key, settings) {
  const json = JSON.stringify(settings)
  let stored = null
  try {
    stored = window.localStorage.getItem(key)
  } catch (e) {
    console.log(e)
  }
  if (json !== stored) ls.set(key, json)
}

// Calls apply(settings) whenever another copy of the page saves different settings under key (null once it's reset),
// until signal (an AbortSignal) aborts
export function followSettings(key, apply, signal) {
  window.addEventListener('storage', e => {
    if (e.key === key) apply(e.newValue ? JSON.parse(e.newValue) : null)
  }, { signal })
}

// A column of controls for the presets of the settings under key: a menu that loads one, a name to save the current
// settings (current()) as (saving over a preset of the same name), and a button that deletes the one picked. apply
// loads a preset's settings into the console, and title heads the column. It stops following other copies of the page
// when signal aborts. The presets are kept under key + suffix, as { name: settings }. The same works for anything else
// worth keeping under names (the hashes of drawings, say): noun is what one's called (and nouns more than one), and
// defaultName() what to call one saved without a name (the next free "preset n" otherwise)
export function presetsPanel({ key, current, apply, title='presets', signal, suffix='Presets', noun='preset', nouns=`${noun}s`, defaultName }) {
  const presetsKey = `${key}${suffix}`
  const read = () => ls.get(presetsKey) ?? {}
  const write = presets => ls.set(presetsKey, JSON.stringify(presets))

  const $panel = $.div(`<h2>${title}</h2>`, { class: 'piece' })
  const $select = $.create('select')('')
  const $name = $.create('input')('', { type: 'text', placeholder: 'name' })
  const $save = $.create('button')('save')
  const $delete = $.create('button')('delete')

  // the menu of presets, keeping whichever's picked if it's still there
  const list = () => {
    const picked = $select.value
    const names = Object.keys(read()).sort((a, b) => a.localeCompare(b))
    $select.replaceChildren(...[['', names.length ? `load a ${noun}` : `no ${nouns} yet`], ...names.map(name => [name, name])]
      .map(([value, label]) => {
        const $option = $.create('option')(label, { value })
        $option.textContent = label
        return $option
      }))
    $select.value = names.includes(picked) ? picked : ''
  }

  $select.addEventListener('change', () => {
    const preset = read()[$select.value]
    if (!preset) return
    $name.value = $select.value
    apply(preset)
  })

  // saved under the name typed (or its default name), over any preset already called that
  $save.addEventListener('click', () => {
    const presets = read()
    let name = $name.value.trim() || defaultName?.() || ''
    for (let n = Object.keys(presets).length + 1; !name; n++) {
      if (!presets[`${noun} ${n}`]) name = `${noun} ${n}`
    }
    write({ ...presets, [name]: current() })
    $name.value = name
    list()
    $select.value = name
  })

  $delete.addEventListener('click', () => {
    const name = $select.value
    if (!name) return
    const { [name]: _, ...rest } = read()
    write(rest)
    $name.value = ''
    list()
  })

  // other copies of the page saving or deleting presets
  window.addEventListener('storage', e => {
    if (e.key === presetsKey) list()
  }, { signal })

  list()
  const $buttons = $.div('', { class: 'buttons' })
  $buttons.append($save, $delete)
  $panel.append($select, $name, $buttons)
  return $panel
}

// The hashes saved for a console, so a drawing can be come back to: save keeps the hash on show along with how it's
// set up (current() is { hash, ...the rest }, the settings and whatever else it takes to draw it again), named for the
// hash itself. the same hash saved again set up differently is kept as <hash>-b, then -c, and so on (set up the same,
// it's the one already there). Picking one loads it back (apply({ hash, ...the rest })), and delete forgets it. It
// stops following other copies of the page when signal aborts. Kept under key + 'Hashes', as { name: saved }
export function hashesPanel({ key, current, apply, signal }) {
  const hashesKey = `${key}Hashes`
  const read = () => ls.get(hashesKey) ?? {}
  const write = hashes => ls.set(hashesKey, JSON.stringify(hashes))

  const $panel = $.div('<h2>hashes</h2>', { class: 'piece' })
  const $select = $.create('select')('')
  const $save = $.create('button')('save')
  const $delete = $.create('button')('delete')

  // a hash is long, so the menu shows its start, then which of its setups it is
  const label = name => {
    const [, hash, which] = name.match(/^(.*?)(-[b-z]+)?$/)
    return `${hash.slice(0, 12)}…${which ?? ''}`
  }
  const list = () => {
    const picked = $select.value
    const names = Object.keys(read()).sort((a, b) => a.localeCompare(b))
    $select.replaceChildren(...[['', names.length ? 'load a hash' : 'no hashes yet'], ...names.map(name => [name, label(name)])]
      .map(([value, text]) => {
        const $option = $.create('option')('', { value })
        $option.textContent = text
        return $option
      }))
    $select.value = names.includes(picked) ? picked : ''
  }

  // one saved before hashes kept their setups is just the hash
  $select.addEventListener('change', () => {
    const saved = read()[$select.value]
    if (saved) apply(typeof saved === 'string' ? { hash: saved } : saved)
  })

  const suffixes = ['', ...'bcdefghijklmnopqrstuvwxyz'].map(letter => letter && `-${letter}`)
  $save.addEventListener('click', () => {
    const { hash, ...setup } = current()
    if (!hash) return
    const hashes = read()
    const same = JSON.stringify(setup)
    const names = suffixes.map(suffix => `${hash}${suffix}`)
    const name = names.find(name => {
      const saved = hashes[name]
      return !saved || (typeof saved !== 'string' && JSON.stringify((({ hash, ...rest }) => rest)(saved)) === same)
    }) ?? names.at(-1)
    if (!hashes[name]) write({ ...hashes, [name]: { hash, ...setup } })
    list()
    $select.value = name
  })

  $delete.addEventListener('click', () => {
    const name = $select.value
    if (!name) return
    const { [name]: _, ...rest } = read()
    write(rest)
    list()
  })

  // other copies of the page saving or deleting hashes
  window.addEventListener('storage', e => {
    if (e.key === hashesKey) list()
  }, { signal })

  list()
  const $buttons = $.div('', { class: 'buttons' })
  $buttons.append($save, $delete)
  $panel.append($select, $buttons)
  return $panel
}
