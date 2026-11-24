// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindHostSidebarShortcut } from './bind-host-sidebar-shortcut'

let field: HTMLInputElement
let open: boolean
let unbind: () => void
const reachesField = vi.fn()

beforeEach(() => {
  open = true
  field = document.createElement('input')
  document.body.append(field)
  field.focus()
  reachesField.mockClear()
  field.addEventListener('keydown', reachesField)
  unbind = bindHostSidebarShortcut(document, () => {
    open = !open
  })
})

afterEach(() => {
  unbind()
  document.body.replaceChildren()
})

function keydown(init: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'L',
    code: 'KeyL',
    ctrlKey: true,
    shiftKey: true,
    ...init
  })
}

it('hides once per press before the field receives the key, then reveals without moving focus', () => {
  expect(field.dispatchEvent(keydown())).toBe(false)
  expect(open).toBe(false)
  expect(field.dispatchEvent(keydown({ repeat: true }))).toBe(false)
  expect(open).toBe(false)
  expect(field.dispatchEvent(keydown({ key: 'д' }))).toBe(false)
  expect(open).toBe(true)
  expect(reachesField).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(field)
})

it('leaves unrelated, modified, composing and already-handled keys with their owner', () => {
  for (const init of [
    { ctrlKey: false, shiftKey: false },
    { shiftKey: false },
    { ctrlKey: false },
    { key: 'b', code: 'KeyB', shiftKey: false },
    { key: 'D' },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
    { keyCode: 229 }
  ]) {
    expect(field.dispatchEvent(keydown(init))).toBe(true)
    expect(open).toBe(true)
  }
  const altGraph = keydown()
  vi.spyOn(altGraph, 'getModifierState').mockImplementation((modifier) => modifier === 'AltGraph')
  expect(field.dispatchEvent(altGraph)).toBe(true)
  const prevented = keydown()
  prevented.preventDefault()
  field.dispatchEvent(prevented)
  expect(reachesField).toHaveBeenLastCalledWith(prevented)
  expect(open).toBe(true)
})

it('does not claim the key behind a modal or after cleanup', () => {
  const modal = document.createElement('div')
  modal.setAttribute('aria-modal', 'true')
  document.body.append(modal)
  expect(field.dispatchEvent(keydown())).toBe(true)
  expect(open).toBe(true)
  modal.remove()
  unbind()
  expect(field.dispatchEvent(keydown())).toBe(true)
  expect(reachesField).toHaveBeenCalledTimes(2)
  expect(open).toBe(true)
})
