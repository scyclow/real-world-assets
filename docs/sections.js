import { $ } from './$.js'

// The sections every console is laid out in, in order: the drawing on show (a new one, and saving its hash by name),
// the paper it's on, the pens (shared by every layout), and then the layout's own: its presets and its settings. Each is
// a <section> with its title, appended to $controls; layout is what to call the last one
export function consoleSections($controls, layout) {
  const section = (title, name) => {
    const $section = $.create('section')(`<h1>${title}</h1>`, { class: `section ${name}` })
    $controls.append($section)
    return $section
  }
  return {
    $drawing: section('drawing', 'drawing'),
    $paper: section('paper', 'paper'),
    $pens: section('pens', 'pens'),
    $layout: section(layout, 'layout'),
  }
}
