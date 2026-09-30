import { $, ls } from './$.js'

// Every console in one place: pick a layout, and its art shows on the left with its controls on the right, each with
// its own settings and presets (the same ones its own page keeps in local storage, so they're all here from the start).
// ?view= opens one (along with any of its settings: ?view=grid&columns=6), and otherwise it's whichever was open
// last (not ?layout=, which is one of the swatch's own settings). The console can sit on any side of the art. Night mode comes on at 6pm and goes off at 6am, fading in if the page is open when it does, and the button
// switches it by hand until the next time it would change by itself


// ---------------------------------------------------------------------------------------------------- layouts

// each loads its console (see its mount())
const layouts = [
  { key: 'note', label: 'note', load: () => import('./billConsole.js') },
  { key: 'grid', label: 'rosette grid', load: () => import('./rosetteGridConsole.js') },
  { key: 'border', label: 'rosette border', load: () => import('./rosetteBorderConsole.js') },
  { key: 'strip', label: 'strip', load: () => import('./stripConsole.js') },
  { key: 'swatch', label: 'swatch', load: () => import('./swatchConsole.js') },
  { key: 'wave', label: 'wave border', load: () => import('./waveBorderConsole.js') },
  { key: 'walk', label: 'random walk', load: () => import('./randomWalkConsole.js') },
]

const $art = $.id('art')
const $controls = $.id('controls')
const $hash = $.id('hash')
const $layout = $.id('layout')

$layout.append(...layouts.map(({ key, label }) => {
  const $option = $.create('option')('', { value: key })
  $option.textContent = label
  return $option
}))

// the console on show, which is taken down (everything it listens to outside its own elements) when another replaces it
let showing = null
async function show(key) {
  const layout = layouts.find(layout => layout.key === key) ?? layouts[0]
  showing?.abort()
  const controller = new AbortController()
  showing = controller

  $layout.value = layout.key
  ls.set('studioLayout', JSON.stringify(layout.key))
  $art.replaceChildren()
  $controls.replaceChildren()
  $hash.textContent = ''

  const { mount } = await layout.load()
  // another layout was picked while this one loaded
  if (controller.signal.aborted) return
  mount({ $art, $controls, $hash, signal: controller.signal })
  foldAsSaved(layout.key)
}

// every section of the console, and every part within one, folds shut and open again by clicking its heading, and
// stays that way (per layout) for next time
const foldable = '.section > h1, .piece > h2'
const foldKey = $heading => `${$layout.value}/${$heading.closest('.section')?.querySelector('h1')?.textContent}/${$heading.textContent}`
const folded = () => new Set(ls.get('studioFolded') ?? [])
function foldAsSaved() {
  const shut = folded()
  $controls.querySelectorAll(foldable).forEach($heading => {
    $heading.parentElement.classList.toggle('folded', shut.has(foldKey($heading)))
    $heading.title = 'click to fold'
  })
}
$controls.addEventListener('click', e => {
  const $heading = e.target.closest(foldable)
  if (!$heading) return
  const shut = folded()
  const key = foldKey($heading)
  if ($heading.parentElement.classList.toggle('folded')) shut.add(key)
  else shut.delete(key)
  ls.set('studioFolded', JSON.stringify([...shut]))
})

$layout.addEventListener('change', () => {
  // the url's settings belong to the layout they came with
  window.history.replaceState(null, '', `${window.location.pathname}?view=${$layout.value}`)
  show($layout.value)
})

show(new URLSearchParams(window.location.search).get('view') ?? ls.get('studioLayout') ?? layouts[0].key)


// ---------------------------------------------------------------------------------------------------- the console

// where the console sits around the art, kept for next time
const placements = ['right', 'left', 'top', 'bottom']
const $placement = $.id('placement')
$placement.append(...placements.map(placement => {
  const $option = $.create('option')('', { value: placement })
  $option.textContent = placement
  return $option
}))
function place(placement) {
  const where = placements.includes(placement) ? placement : placements[0]
  document.body.dataset.panel = where
  $placement.value = where
  ls.set('studioPanel', JSON.stringify(where))
}
$placement.addEventListener('change', () => place($placement.value))
// ?panel=bottom puts it there
place(new URLSearchParams(window.location.search).get('panel') ?? ls.get('studioPanel'))

// how big the console is, dragged by the handle on its edge facing the art: its width beside the art and its height
// above or below it, each kept for next time. the art takes whatever's left, and its paper fits itself to that
const $panel = $.id('panel')
const $resize = $.id('resize')
const panelSize = { width: null, height: null, ...ls.get('studioPanelSize') }
const across = () => ['top', 'bottom'].includes(document.body.dataset.panel)
// never so small the controls are lost, or so big the art is
const clamp = (value, least, most) => Math.max(least, Math.min(most, value))
function sizePanel() {
  const { width, height } = panelSize
  if (width) $panel.style.setProperty('--panel-width', `${clamp(width, 240, window.innerWidth - 200)}px`)
  else $panel.style.removeProperty('--panel-width')
  if (height) $panel.style.setProperty('--panel-height', `${clamp(height, 120, window.innerHeight - 120)}px`)
  else $panel.style.removeProperty('--panel-height')
}

$resize.addEventListener('pointerdown', e => {
  e.preventDefault()
  $resize.setPointerCapture(e.pointerId)
  document.body.classList.add('resizing')
})
$resize.addEventListener('pointermove', e => {
  if (!$resize.hasPointerCapture(e.pointerId)) return
  const where = document.body.dataset.panel
  if (across()) panelSize.height = where === 'top' ? e.clientY : window.innerHeight - e.clientY
  else panelSize.width = where === 'left' ? e.clientX : window.innerWidth - e.clientX
  sizePanel()
})
const stopResizing = () => {
  document.body.classList.remove('resizing')
  ls.set('studioPanelSize', JSON.stringify(panelSize))
}
$resize.addEventListener('pointerup', stopResizing)
$resize.addEventListener('pointercancel', stopResizing)
// back to where it starts
$resize.addEventListener('dblclick', () => {
  if (across()) panelSize.height = null
  else panelSize.width = null
  sizePanel()
  ls.set('studioPanelSize', JSON.stringify(panelSize))
})
window.addEventListener('resize', sizePanel)
sizePanel()


// ---------------------------------------------------------------------------------------------------- night mode

const night = { from: 18, until: 6 }
const $root = document.documentElement
const $theme = $.id('theme')

const isNightTime = (date=new Date()) => date.getHours() >= night.from || date.getHours() < night.until

// the next time night mode would change by itself: 6am or 6pm, whichever comes first
function nextChange(date=new Date()) {
  const next = new Date(date)
  next.setMinutes(0, 0, 0)
  next.setHours(isNightTime(date) ? night.until : night.from)
  if (next <= date) next.setDate(next.getDate() + 1)
  return next.getTime()
}

// switched by hand, it stays that way until the next time it would change by itself (kept across reloads)
const overridden = () => {
  const saved = ls.get('studioTheme')
  return saved && Date.now() < saved.until ? saved.night : null
}
const wantsNight = () => overridden() ?? isNightTime()

// fade tells it to fade between the two (it only doesn't the first time, when the page opens). the fade is only on
// while it switches, so nothing else (a button lighting up under the mouse) is slowed down by it
let fadeDone = null
function setNight(on, fade=true) {
  if (fade) {
    $root.classList.add('fading')
    clearTimeout(fadeDone)
    fadeDone = setTimeout(() => $root.classList.remove('fading'), 900)
  }
  $root.classList.toggle('night', on)
  $theme.textContent = on ? '☀ day' : '☾ night'
  $theme.title = on ? 'switch to day mode' : 'switch to night mode'
}

$theme.addEventListener('click', () => {
  const on = !$root.classList.contains('night')
  ls.set('studioTheme', JSON.stringify({ night: on, until: nextChange() }))
  setNight(on)
})

// another copy of the page switching it
window.addEventListener('storage', e => {
  if (e.key === 'studioTheme') setNight(wantsNight())
})

setNight(wantsNight(), false)
// checks every half minute, so 6pm (or 6am) turns it on (or off) with the page open
setInterval(() => {
  if (wantsNight() !== $root.classList.contains('night')) setNight(wantsNight())
}, 30 * 1000)
