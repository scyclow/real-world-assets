import { pen, penName } from './colors.js'

const ns = 'http://www.w3.org/2000/svg'

// A width x height canvas, in svg units. Paths are grouped by pen (stroke color), one group per pen, so each one
// can be plotted on its own
export class Svg {
  // displayWidth is how wide it shows on the page (css). by default it's sized to fit the window either way
  constructor({ width, height, background='#fff', displayWidth=`min(95vw, ${95 * width / height}vh)` }) {
    this.w = width
    this.h = height
    this.pens = new Map()
    this.el = this.create('svg', { viewBox: `0 0 ${width} ${height}` })
    this.el.setAttribute('style', `background: ${background}; width: ${displayWidth}`)
    // marks the document bounds, so plotting software keeps the whole canvas
    this.el.append(this.create('path', { d: `M 0 0 M ${width} ${height}` }))
  }

  create(tag, attrs={}) {
    const el = document.createElementNS(ns, tag)
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    return el
  }

  // transform (an svg transform, like `translate(10 10) scale(0.1)`) moves and scales the path, for drawings that come
  // in their own coordinates, like the letters in type.js. className tags the path so css can find it again
  path(d, { stroke=pen.black, strokeWidth=1, strokeOpacity=1, fill='none', transform=null, className=null }={}) {
    const path = this.create('path', {
      d,
      fill,
      stroke,
      'stroke-width': strokeWidth,
      'stroke-opacity': strokeOpacity,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...(transform ? { transform } : {}),
      ...(className ? { class: className } : {}),
    })
    this.penGroup(stroke).append(path)
    return path
  }

  penGroup(stroke) {
    if (!this.pens.has(stroke)) {
      const g = this.create('g', { id: penName(stroke).replace(/[^\w-]/g, '') })
      this.pens.set(stroke, g)
      this.el.append(g)
    }
    return this.pens.get(stroke)
  }

  mount(parent=document.body) {
    parent.append(this.el)
    return this
  }

  download(filename) {
    const source = '<?xml version="1.0" standalone="no"?>\r\n' + new XMLSerializer().serializeToString(this.el)
    const a = document.createElement('a')
    a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
    a.download = filename
    document.body.append(a)
    a.click()
    a.remove()
  }
}
