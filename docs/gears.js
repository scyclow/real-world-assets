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
// rosette top to bottom as well as left to right. r is where the randomness comes from
export function generateGears({ count=7, rotationMin=0, rotationMax=15, radiaMin=0, radiaMax=0.1, oddRotations=false, start='fixed' }={}, r=random) {
  const startFn = typeof start === 'function' ? start : gearStarts[start]
  return times(count, () => {
    let rotation = rotationMin
      ? r.posOrNeg(Math.trunc(r.rnd(rotationMin, rotationMax)))
      : Math.trunc(r.rnd(-rotationMax, rotationMax))
    // an even one turns once more, away from 0
    if (oddRotations && rotation % 2 === 0) rotation += rotation < 0 ? -1 : 1
    return {
      rotation,
      radia: r.rnd(radiaMin, radiaMax),
      phase: startFn(r),
    }
  })
}

// Layer t of count's gears, with every radia shifted down by change in total: none of it at the innermost layer,
// all of it at the outermost
export const shiftRadia = (gears, change, t, count) => gears.map(g => ({
  ...g,
  radia: g.radia - change * t / max(count - 1, 1),
}))
