import { Svg } from './svg.js'
import { widthOf } from './pens.js'

// The paper a layout's drawing goes on: its width, height, and margin (in the paper's own units), with every line drawn
// as thick as its pen says in those units (see pens.js).

// the paper's controls, as fields for a console (see simpleConsole.js), each typed in, and the settings they're kept
// under (named so they can't be mistaken for any of a layout's own)
export const paperFields = [
  { key: 'paperWidth', name: 'width', number: true, min: 1 },
  { key: 'paperHeight', name: 'height', number: true, min: 1 },
  { key: 'paperMargin', name: 'margin', number: true, min: 0 },
]

// the paper from a console's settings
export const paperOf = ({ paperWidth, paperHeight, paperMargin }) => ({ width: paperWidth, height: paperHeight, margin: paperMargin })

// Puts a drawing (an Svg, see svg.js) on paper ({ width, height, margin }): scaled to fit inside the margins and
// centered, each pen still in its own group, and every line as thick as its pen is (on the paper, however much the
// drawing's scaled). A line in a color no pen has keeps the thickness it was drawn with, scaled with the drawing
export function onPaper(drawing, { width, height, margin=0 }) {
  const scale = Math.min((width - 2 * margin) / drawing.w, (height - 2 * margin) / drawing.h)
  if (!(scale > 0)) return new Svg({ width, height })

  const paper = new Svg({ width, height, background: drawing.el.style.background || '#fff' })
  const [dx, dy] = [(width - drawing.w * scale) / 2, (height - drawing.h * scale) / 2]
  for (const [stroke, $drawn] of drawing.pens) {
    const $group = paper.penGroup(stroke)
    $group.setAttribute('transform', `translate(${dx} ${dy}) scale(${scale})`)
    const thickness = widthOf(stroke)
    for (const $path of [...$drawn.children]) {
      // a path with a scale of its own (a letter, say) has its thickness scaled by that too
      const own = Number($path.getAttribute('transform')?.match(/scale\(([^)\s]+)/)?.[1] ?? 1)
      if (thickness) $path.setAttribute('stroke-width', thickness / (scale * own))
      $group.append($path)
    }
  }
  return paper
}
