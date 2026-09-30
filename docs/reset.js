import { $ } from './$.js'

// A button at the right end of a setting's row that puts it back to its default: reset() does the putting back (and
// the redrawing). It goes in the row's heading (its first span), or on the row itself if it hasn't got one
export function addReset($field, reset) {
  const $button = $.create('button')('↺', { type: 'button', class: 'reset', title: 'back to the default' })
  $button.addEventListener('click', e => {
    // (not the click the row's control would take, when the row's a label)
    e.preventDefault()
    e.stopPropagation()
    reset()
  })
  const $heading = [...$field.children].find($child => $child.tagName === 'SPAN') ?? $field
  $heading.append($button)
  return $field
}

// a default, copied, so a setting put back to it can be changed without changing it
export const copyOf = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
