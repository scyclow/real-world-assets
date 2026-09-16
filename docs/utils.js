export const PI = Math.PI
export const TWO_PI = Math.PI * 2
export const { min, max, sin, cos, abs, atan2, hypot } = Math
export const dist = (x1, y1, x2, y2) => hypot(x2 - x1, y2 - y1)

export function times(t, fn) {
  const out = []
  for (let i = 0; i < t; i++) out.push(fn(i))
  return out
}

export const last = a => a[a.length - 1]

// The point radius away from (cx, cy) at angle (radians). Angle 0 is straight down (+y), turning toward +x
export function getXYRotation(angle, radius, cx=0, cy=0) {
  return [
    sin(angle) * radius + cx,
    cos(angle) * radius + cy,
  ]
}

// Turns a point around the origin by angle (radians), clockwise on screen like css rotate()
export const rotate = ([x, y], angle) => [
  x * cos(angle) - y * sin(angle),
  x * sin(angle) + y * cos(angle),
]

// Random helpers, all drawing from next (a source of 0-1 numbers)
function randomHelpers(next) {
  function rnd(mn, mx) {
    const out = next()
    if (mx != null) return mn + out * (mx - mn)
    else if (mn != null) return out * mn
    else return out
  }

  const prb = x => rnd() < x

  // Picks from [weight, value] pairs: chance([3, 'a'], [1, 'b']) is 'a' three times as often as 'b'
  function chance(...chances) {
    const total = chances.reduce((t, c) => t + c[0], 0)
    const seed = rnd()
    let sum = 0
    for (let i = 0; i < chances.length; i++) {
      const val =
        chances[i][0] === true ? 1
        : chances[i][0] === false ? 0
        : chances[i][0]
      sum += val / total
      if (seed <= sum && chances[i][0]) return chances[i][1]
    }
  }

  return {
    rnd,
    rndint: (mn, mx) => Math.trunc(rnd(mn, mx)),
    prb,
    posOrNeg: (x=1) => x * (prb(0.5) ? 1 : -1),
    sample: a => a[Math.trunc(rnd(a.length))],
    chance,
    // Picks a key from { key: weight }
    pick: weights => chance(...Object.entries(weights).map(([key, weight]) => [weight, key])),
    // v itself, or a random number within it if it's a [min, max] range
    within: v => Array.isArray(v) ? rnd(v[0], v[1]) : v,
  }
}

// Seeded randomness (xorshift): everything random runs through it, so the same hash always makes the same piece
let randomSeed = 1

export function setSeed(hash) {
  randomSeed = parseInt(hash.slice(50, 58), 16) || 1
}

function xorshift() {
  randomSeed ^= randomSeed << 13
  randomSeed ^= randomSeed >> 17
  randomSeed ^= randomSeed << 5
  return (((randomSeed < 0) ? ~randomSeed + 1 : randomSeed) % 1000) / 1000
}

export const random = randomHelpers(xorshift)
export const { rnd, rndint, prb, posOrNeg, sample, chance, pick, within } = random

// A separate stream of random numbers from a seed (mulberry32), for anything that has to come out the same every
// time it's remade
export function createRandom(seed) {
  let s = seed >>> 0
  return randomHelpers(() => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  })
}

// A seed for createRandom, from the seeded randomness
export const rndSeed = () => times(3, () => Math.floor(rnd() * 1000)).reduce((s, d) => s * 1000 + d, 0)

export const randomHash = () => '0x' + times(64, () => Math.floor(Math.random() * 16).toString(16)).join('')

// The hash asked for with ?hash=, or a new random one, which goes in the url as #hash (like genTokenData in the other
// projects) so it can be copied into ?hash= to remake the piece
export function getHash() {
  const requested = new URLSearchParams(window.location.search).get('hash')
  if (requested) return requested
  const hash = randomHash()
  window.location.hash = '#' + hash
  return hash
}
