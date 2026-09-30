import { $ } from './$.js'

// How a rosette's rings are colored: a pattern, and an order of pens by letter (like 'ABC', or 'AAB' -- a letter can
// come more than once). The rosette grid and the note's emblems both use them. Front is the innermost ring:
//   single: the order, ring by ring, over and over (a letter twice in a row makes a band two rings wide)
//   double: the same, each letter for two rings
//   split: the rings split into as many runs as there are letters, front to back, one letter each
//   random: every ring picks a letter from the order, so one that's in it twice comes up twice as often
// Each makes a rosette's colorFn from pens (the order's colors) and random (ring => a number 0-1, the same every time
// for that ring). t is a ring, counting out from the innermost, and count how many rings there are

export const colorPatterns = {
  single: { label: 'front to back single', rule: ({ pens }) => t => pens[t % pens.length] },
  double: { label: 'front to back double', rule: ({ pens }) => t => pens[Math.floor(t / 2) % pens.length] },
  split: {
    label: 'front to back split',
    rule: ({ pens }) => (t, count) => pens[Math.min(pens.length - 1, Math.floor(pens.length * t / count))],
  },
  random: { label: 'random', rule: ({ pens, random }) => t => pens[Math.floor(random(t) * pens.length)] },
}

const letters = 'ABCDEF'

// an order as typed, kept to the pens' letters: 'a, b c' is 'ABC'
export const cleanOrder = order => String(order ?? '').toUpperCase().replace(/[^A-F]/g, '')

// A colorFn from a coloring ({ pattern, order }), the pens in use (their colors, A first), and random. a letter past
// the pens in use draws with the last of them, and with no letters at all it's A alone
export function colorFnFor({ pattern, order }, pens, random) {
  const picked = [...cleanOrder(order)].map(letter => pens[Math.min(letters.indexOf(letter), pens.length - 1)])
  const { rule } = colorPatterns[pattern] ?? colorPatterns.single
  return rule({ pens: picked.length ? picked : [pens[0]], random })
}

// the rules colorings were before, by name (and before that, with how many pens they used in theirs): what each is
// now. solid is whichever pen it was drawn in, count how many pens were in use, and band how many rings a band ran for
const oldRules = {
  alternate2: ['alternate', 2], alternate3: ['alternate', 3],
  random2: ['random', 2], random3: ['random', 3],
  bands2: ['bands', 2], bands3: ['bands', 3],
  split2: ['insideOut', 2], split3: ['insideOut', 3], split3Reversed: ['outsideIn', 3],
}
export function coloringFromRule(rule, { solid='A', count=3, band=5 }={}) {
  const [name, used] = oldRules[rule] ?? [rule, count]
  const inUse = letters.slice(0, Math.max(1, Math.min(letters.length, used)))
  const reversed = [...inUse].reverse().join('')
  const banded = [...inUse].map(letter => letter.repeat(Math.max(1, band))).join('')
  return {
    alternate: { pattern: 'single', order: inUse },
    random: { pattern: 'random', order: inUse },
    bands: { pattern: 'single', order: banded },
    insideOut: { pattern: 'split', order: inUse },
    outsideIn: { pattern: 'split', order: reversed },
  }[name] ?? { pattern: 'single', order: solid }
}

// A coloring made up at random from the first count pens: any pattern, and two to five letters in any order (repeats
// and all)
export function randomColoring(count=3) {
  const pick = list => list[Math.floor(Math.random() * list.length)]
  const inUse = [...letters.slice(0, Math.max(1, count))]
  const length = 2 + Math.floor(Math.random() * 4)
  return { pattern: pick(Object.keys(colorPatterns)), order: Array.from({ length }, () => pick(inUse)).join('') }
}

// A coloring's controls: a menu of the patterns and a box for the order, side by side, under name (if there's one).
// get() is the coloring now ({ pattern, order, and weight where it's weighted }), and set(changes) is handed whichever
// changed. weighted adds a box for its weight (how often it's picked against the others). with shuffle, there's a
// button at the end of the row that makes it up again at random, and with remove, one that removes it (off while
// canRemove() says no). sync() puts them back to get()'s
export function coloringField({ name='colors', get, set, weighted=false, shuffle, remove, canRemove=() => true }) {
  const $field = $.create(name ? 'label' : 'div')(name ? `<span>${name}</span>` : '')
  const $row = $.div('', { class: 'coloring' })
  const $select = $.create('select')(Object.entries(colorPatterns).map(([pattern, { label }]) =>
    `<option value="${pattern}">${label}</option>`))
  const $order = $.create('input')('', { type: 'text', placeholder: 'ABC', spellcheck: 'false', title: 'pens, in order (A to F, repeats allowed)' })
  // taken once it's a number, 0 or more (0 leaves it out). left blank or invalid, it goes back to what it was
  const $weight = !weighted ? null : $.create('input')('', { type: 'number', min: 0, step: 'any', class: 'weight', title: 'weight: how often it\'s picked, against the others' })
  $weight?.addEventListener('change', () => {
    const weight = Number($weight.value)
    if ($weight.value !== '' && weight >= 0) set({ weight })
    sync()
  })
  const $shuffle = !shuffle ? null : $.create('button')('⟳', { type: 'button', class: 'shuffle', title: 'shuffle: make this one up again at random' })
  $shuffle?.addEventListener('click', shuffle)
  const $remove = !remove ? null : $.create('button')('×', { type: 'button', class: 'remove', title: 'delete this one' })
  $remove?.addEventListener('click', remove)
  const sync = () => {
    $select.value = get().pattern
    $order.value = get().order
    if ($weight) $weight.value = get().weight ?? 1
    if ($remove) $remove.disabled = !canRemove()
  }
  $select.addEventListener('change', () => set({ pattern: $select.value }))
  // only taken once it has a letter in it (left empty, it goes back to what it was)
  $order.addEventListener('change', () => {
    const order = cleanOrder($order.value)
    if (order) set({ order })
    sync()
  })
  sync()
  $row.append($select, $order, ...[$weight, $shuffle, $remove].filter(Boolean))
  $field.append($row)
  return Object.assign($field, { sync })
}
