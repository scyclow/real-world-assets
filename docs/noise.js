import { createRandom } from './utils.js'

// Perlin noise in three dimensions (Ken Perlin's improved noise), from a seed: noise3(seed)(x, y, z) is smooth, about
// -1 to 1, the same every time for the same seed, and 0 at every whole-numbered point

const gradients = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]
const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t

const made = new Map()
export function noise3(seed=0) {
  if (made.has(seed)) return made.get(seed)
  // the corners' gradients, shuffled from the seed
  const random = createRandom(seed)
  const order = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random.rnd() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const p = [...order, ...order]
  const dot = (hash, x, y, z) => {
    const [gx, gy, gz] = gradients[hash % 12]
    return gx * x + gy * y + gz * z
  }

  const noise = (x, y, z) => {
    const [X, Y, Z] = [Math.floor(x) & 255, Math.floor(y) & 255, Math.floor(z) & 255]
    x -= Math.floor(x)
    y -= Math.floor(y)
    z -= Math.floor(z)
    const [u, v, w] = [fade(x), fade(y), fade(z)]
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z
    return lerp(
      lerp(lerp(dot(p[AA], x, y, z), dot(p[BA], x - 1, y, z), u), lerp(dot(p[AB], x, y - 1, z), dot(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(dot(p[AA + 1], x, y, z - 1), dot(p[BA + 1], x - 1, y, z - 1), u), lerp(dot(p[AB + 1], x, y - 1, z - 1), dot(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w,
    )
  }
  made.set(seed, noise)
  return noise
}
