import { random, max, times } from './utils.js'

// Where each gear starts turning, as a fraction of a turn. fixed and even keep the rosette mirrored left/right;
// wonky breaks the symmetry entirely
export const gearStarts = {
  fixed: () => 0,
  even: r => r.prb(0.5) ? 0 : 0.5,
  wonky: r => r.rnd(0, 1),
}

// The gears that ride on a rosette's base gear and give it its wiggles (the base gear itself comes from bases.js).
// Each one turns `rotation` times per trip around the base gear (negative turns backwards), starting `phase` of a turn
// in (radiaStart in rosette2.js), with a radius of `radia` times the layer's size.
// start is a gearStarts name or a function. rotationMin above 0 keeps every gear turning at least that many times
// (either way). oddRotations makes every gear turn an odd number of times, which (with fixed starts) mirrors the
// rosette top to bottom as well as left to right. positive makes every gear turn forwards, the same way as the base
// gear. rolled, when it's given, is how many are rolled whatever count is, of which the first count are kept, so
// changing count changes nothing else that's rolled after them. r is where the randomness comes from
export function generateGears({ count=7, rolled=0, rotationMin=0, rotationMax=15, radiaMin=0, radiaMax=0.1, oddRotations=false, positive=false, start='fixed' }={}, r=random) {
  const startFn = typeof start === 'function' ? start : gearStarts[start]
  return times(max(count, rolled), () => {
    let rotation = rotationMin
      ? r.posOrNeg(Math.trunc(r.rnd(rotationMin, rotationMax)))
      : Math.trunc(r.rnd(-rotationMax, rotationMax))
    // the direction is still rolled either way, so turning positive on doesn't change anything else that's rolled
    if (positive) rotation = Math.abs(rotation)
    // an even one turns once more, away from 0
    if (oddRotations && rotation % 2 === 0) rotation += rotation < 0 ? -1 : 1
    return {
      rotation,
      radia: r.rnd(radiaMin, radiaMax),
      phase: startFn(r),
    }
  }).slice(0, count)
}

// Layer t of count's gears, with every radia shifted down by change in total: none of it at the innermost layer,
// all of it at the outermost
export const shiftRadia = (gears, change, t, count) => gears.map(g => ({
  ...g,
  radia: g.radia - change * t / max(count - 1, 1),
}))

// How a rosette can be mirrored: left to right (about a vertical line through its center), top to bottom (about a
// horizontal one), both, or neither, and what the console calls each
export const symmetries = ['both', 'vertical', 'horizontal', 'none']
export const symmetryLabels = { both: 'both', vertical: 'vertical (left = right)', horizontal: 'horizontal (top = bottom)', none: 'none' }

// Gears turned into ones that mirror a rosette as symmetry says, keeping how big they are and (as near as can be) how
// many times they turn, so they come out as close to what was rolled as they can. Every point around a rosette is
// placed at an angle from straight down (see getXYRotation), so a gear turning k times with a phase of 0 mirrors it
// left to right. top to bottom, it has to be at a phase of (1 - k) / 4k: 0 for an odd k, and for an even one a
// quarter turn back of the next odd, as it were (a gear that doesn't turn at all can't, so it turns once). both needs
// both: a phase of 0, and every gear turning an odd number of times (an even one turns once more, away from 0). none
// starts every gear at a phase picked with r, so nothing lines up. null (or anything else) leaves them as they are
export function withSymmetry(gears, symmetry, r) {
  if (!symmetries.includes(symmetry)) return gears
  return gears.map(g => {
    if (symmetry === 'none') return { ...g, phase: r.rnd() }
    if (symmetry === 'vertical') return { ...g, phase: 0 }
    let rotation = g.rotation || 1
    if (symmetry === 'both') {
      if (rotation % 2 === 0) rotation += rotation < 0 ? -1 : 1
      return { ...g, rotation, phase: 0 }
    }
    return { ...g, rotation, phase: rotation % 2 ? 0 : (1 - rotation) / (4 * rotation) }
  })
}

// Where gears start: fixed (as they are) or even, where each one also starts a half turn in, or not, picked with r, or
// random, which picks one of the two (with r too, so it's the same every time for the same rosette).
// a half turn in keeps whatever symmetry they have (for a gear turning k times it moves it k half turns, which mirrors
// the same way), so it only changes which way the odd-turning gears swing
export const gearStartOptions = ['fixed', 'even', 'random']
export function withStarts(gears, starts, r) {
  const picked = starts === 'random' ? (r.rnd() < 0.5 ? 'fixed' : 'even') : starts
  if (picked !== 'even') return gears
  return gears.map(g => ({ ...g, phase: g.phase + (r.rnd() < 0.5 ? 0 : 0.5) }))
}
