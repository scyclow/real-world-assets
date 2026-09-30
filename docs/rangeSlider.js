import { $ } from './$.js'
import { createRandom } from './utils.js'

// Settings that can be a range: a value (a number) or [low, high], with the value that's drawn picked between the two,
// once per drawing, from the drawing's hash, or [low, high, exact], a range with an exact value in use instead (the
// range kept, for going back to). Each setting picks from its own random numbers (seeded by the hash and
// the setting's name), so the same hash always picks the same value, and widening or narrowing one range changes
// nothing else the hash picks

export const isRange = value => Array.isArray(value)
// a value's low and high ends (a number's both the same), and its exact value in use instead of the range, if it has one
export const ends = value => isRange(value) ? [Math.min(value[0], value[1]), Math.max(value[0], value[1])] : [value, value]
export const pinnedOf = value => isRange(value) && typeof value[2] === 'number' ? value[2] : undefined

// a whole-number hash of a setting's name, for its random numbers
const nameSeed = name => [...name].reduce((seed, c) => (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0, 7)

// a value snapped to a slider's steps, from its low end (and whole, for a whole-number step)
const decimals = step => (String(step).split('.')[1] ?? '').length
const snap = (value, low, step) => {
  if (!step || step === 'any') return value
  const snapped = low + Math.round((value - low) / step) * step
  return Number(snapped.toFixed(decimals(step)))
}

// The value to draw for a setting: a number's itself, a range with an exact value in use that value, and a range's a
// pick between its ends, on its slider's steps
export function pickValue(value, { name, hash, step }) {
  if (!isRange(value)) return value
  if (pinnedOf(value) !== undefined) return pinnedOf(value)
  const [low, high] = ends(value)
  if (low === high) return low
  const seed = (parseInt(String(hash).slice(18, 26), 16) || 1) + nameSeed(name)
  return snap(low + createRandom(seed).rnd() * (high - low), low, step)
}

// a value as the URL gives it: a number, two with a comma between for a range (?size=0.5,0.9), or three for a range
// with an exact value in use (?size=0.5,0.9,0.7)
export function valueFromParam(param) {
  const numbers = String(param).split(',').filter(part => part !== '').map(Number)
  if (!numbers.length || numbers.some(isNaN)) return undefined
  if (numbers.length >= 3) return numbers.slice(0, 3)
  return numbers.length === 1 || numbers[0] === numbers[1] ? numbers[0] : [numbers[0], numbers[1]]
}

// A setting's two sliders, one above the other: a range (one track, two knobs, for the low and high ends, the value
// drawn picked between them) and an exact value (one knob), only one of them in use at a time, blue, with the other
// gray. touching either puts it in use. name heads them, with what's drawn to its right: the exact value, or the range
// and (in gray) the value picked from it for the drawing on show. get() is the setting as it stands: a number (the
// exact value in use, its range just it), [low, high] (the range in use), or [low, high, exact] (the exact value in
// use, the range kept for going back to). set(value) is handed a new one, and picked() is the value drawn. flip runs
// them backwards (a setting that draws denser the smaller it is), and change fires only when a knob's let go, so
// dragging doesn't redraw at every step. a press on a track brings its nearest knob there. sync() puts them back to
// the setting's
export function rangeField({ name, min, max, step, flip=false, get, set, picked }) {
  const $field = $.div(`<span>${name} <b></b></span>`, { class: 'range' })
  const $value = $field.querySelector('b')
  const $rangeTrack = $.div('', { class: 'dual', title: 'a range: the value drawn is picked between the two knobs' })
  const $low = $.create('input')('', { type: 'range', min, max, step })
  const $high = $.create('input')('', { type: 'range', min, max, step })
  const $fill = $.div('', { class: 'fill' })
  $rangeTrack.append($fill, $low, $high)
  const $exactTrack = $.div('', { class: 'dual exact', title: 'an exact value, drawn just as it is' })
  const $exact = $.create('input')('', { type: 'range', min, max, step })
  const $exactFill = $.div('', { class: 'fill' })
  $exactTrack.append($exactFill, $exact)
  $field.append($rangeTrack, $exactTrack)

  // the knobs' positions are the setting's values, mirrored when it runs backwards
  const mirror = value => flip ? min + max - value : value
  const at = value => (mirror(value) - min) / (max - min) * 100
  const fixed = value => {
    const places = step < 0.01 || flip ? 3 : decimals(step)
    return Number(value).toFixed(Math.min(places, 3)).replace(/\.?0+$/, '') || '0'
  }
  const exactOf = value => isRange(value) ? pinnedOf(value) : value

  // the stretch of the range's track between its knobs, and of the exact one's up to its knob
  const fillBetween = (low, high) => {
    const [a, b] = [at(low), at(high)]
    $fill.style.left = `${Math.min(a, b)}%`
    $fill.style.width = `${Math.abs(b - a)}%`
  }
  // (always from the left end, even for one that runs backwards)
  const fillTo = value => {
    $exactFill.style.left = '0%'
    $exactFill.style.width = `${at(value)}%`
  }
  const show = () => {
    const value = get()
    const [low, high] = ends(value)
    const exact = exactOf(value)
    const pick = picked()
    $rangeTrack.classList.toggle('active', exact === undefined)
    $exactTrack.classList.toggle('active', exact !== undefined)
    $value.innerHTML = exact !== undefined ? fixed(exact)
      : `${fixed(low)}–${fixed(high)}${pick === undefined || low === high ? '' : ` <i class="picked">${fixed(pick)}</i>`}`
    fillBetween(low, high)
    // with the range in use, the exact knob sits at what's drawn, ready to take over from it
    const shown = exact ?? pick ?? low
    $exact.value = mirror(shown)
    fillTo(shown)
  }
  const sync = () => {
    const [low, high] = ends(get())
    const [a, b] = [mirror(low), mirror(high)].sort((x, y) => x - y)
    $low.value = a
    $high.value = b
    show()
  }

  // what the knobs say: the range's ends (either knob can pass the other), and the exact value
  const range = () => [Number($low.value), Number($high.value)].map(mirror).sort((x, y) => x - y)
  const exact = () => mirror(Number($exact.value))
  // the range put in use, or the exact value (keeping the range to go back to, unless it's just the one value)
  const useRange = () => set(range())
  const useExact = () => {
    const [low, high] = range()
    set(low === high ? exact() : [low, high, exact()])
  }

  // as a knob moves: its slider shown in use, and what it says
  const rangeMoved = () => {
    const [low, high] = range()
    $rangeTrack.classList.add('active')
    $exactTrack.classList.remove('active')
    $value.textContent = low === high ? fixed(low) : `${fixed(low)}–${fixed(high)}`
    fillBetween(low, high)
  }
  const exactMoved = () => {
    $exactTrack.classList.add('active')
    $rangeTrack.classList.remove('active')
    $value.textContent = fixed(exact())
    fillTo(exact())
  }
  for (const $knob of [$low, $high]) {
    $knob.addEventListener('input', rangeMoved)
    $knob.addEventListener('change', useRange)
  }
  $exact.addEventListener('input', exactMoved)
  $exact.addEventListener('change', useExact)

  // a press anywhere on a track (off its knobs) brings the nearest knob there, and it goes on following the pointer
  // until it's let go, which puts that slider in use. of two knobs in the same place, the one on the side pressed comes
  const followPointer = ($track, knobs, moved, done) => {
    let following = null
    // where on the track a pointer is, as a knob's position (the knobs' centers stop half a knob in from either end)
    const positionAt = x => {
      const { left, width } = $track.getBoundingClientRect()
      const inset = 6
      const f = Math.min(1, Math.max(0, (x - left - inset) / Math.max(1, width - 2 * inset)))
      return min + f * (max - min)
    }
    $track.addEventListener('pointerdown', e => {
      if (e.target.matches('input')) return
      const position = positionAt(e.clientX)
      following = knobs.reduce((nearest, $knob) => {
        const [d, best] = [Math.abs(Number($knob.value) - position), Math.abs(Number(nearest.value) - position)]
        if (d !== best) return d < best ? $knob : nearest
        // together: the higher one for a press above them, the lower below
        return (position > Number($knob.value)) === (Number($knob.value) >= Number(nearest.value)) ? $knob : nearest
      })
      following.value = position
      moved()
      e.preventDefault()
      // (so it goes on following past the track's ends; a pointer that can't be held just doesn't)
      try {
        $track.setPointerCapture(e.pointerId)
      } catch {}
    })
    $track.addEventListener('pointermove', e => {
      if (!following) return
      following.value = positionAt(e.clientX)
      moved()
    })
    const letGo = () => {
      if (!following) return
      following = null
      done()
    }
    $track.addEventListener('pointerup', letGo)
    $track.addEventListener('pointercancel', letGo)
  }
  followPointer($rangeTrack, [$low, $high], rangeMoved, useRange)
  followPointer($exactTrack, [$exact], exactMoved, useExact)

  sync()
  return Object.assign($field, { sync, show })
}
