// @vitest-environment happy-dom
import { resolve } from 'node:path'
import type { TextInputInstance } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { sessionTerminalInputMountAdapters } from '../../test-support/rpc-recording/adapters/sessions/session-terminal-input-mount-adapters'
import { operationModuleLoader } from '../../test-support/rpc-recording/module-mounting/operation-module-loader'
import { mountFixture } from '../../test-support/rpc-recording/react-mounting/recorder-fixture-shape'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import { bindTerminalTextFieldSubmit } from './terminal-text-field-submit-binding.web'

vi.mock('../../platform/host-os', () => import('../../platform/host-os.web'))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function bind(paste = vi.fn<() => void>()) {
  const field = document.createElement('input')
  document.body.append(field)
  field.focus()
  const submit = vi.fn()
  const raw = vi.fn(() => true)
  // RN Web supplies the DOM input as its TextInputInstance.
  const unbind = bindTerminalTextFieldSubmit(
    field as unknown as TextInputInstance,
    submit,
    raw,
    undefined,
    paste
  )
  return { field, paste, raw, submit, unbind }
}

function press(field: HTMLInputElement, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'v',
    code: 'KeyV',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init
  })
  field.dispatchEvent(event)
  return event.defaultPrevented
}

it.each([true, false])(
  'delivers one hardware paste without Enter (bracketed: %s)',
  async (bracketedPasteMode) => {
    const sendRequest = vi.fn<RpcClient['sendRequest']>().mockResolvedValue({
      id: 'paste',
      ok: true,
      result: { send: { accepted: true } }
    })
    const adapters = sessionTerminalInputMountAdapters(
      operationModuleLoader(resolve(import.meta.dirname, '../../../..'))
    )
    const screen = adapters['session.terminal-clipboard']({
      client: mountFixture<RpcClient>({ sendRequest, getLastConnectedAt: () => 1 }),
      effect: vi.fn()
    })
    let delivery: unknown
    const { field, paste, submit, raw, unbind } = bind(
      vi.fn(() => {
        delivery = screen.action('paste', {})
      })
    )
    try {
      await screen.action('mount', { bracketedPasteMode })
      await screen.action('copy', { text: 'one—two\n三' })
      sendRequest.mockClear()
      expect(press(field)).toBe(true)
      expect(press(field, { repeat: true })).toBe(true)
      await delivery
      expect(paste).toHaveBeenCalledTimes(1)
      expect(raw).not.toHaveBeenCalled()
      expect(submit).not.toHaveBeenCalled()
      const text = bracketedPasteMode ? '\x1b[200~one—two\r三\x1b[201~' : 'one—two\r三'
      expect(sendRequest.mock.calls).toEqual([
        ['terminal.send', expect.objectContaining({ text, enter: false })]
      ])
    } finally {
      unbind()
      await screen.dispose()
    }
  }
)

it('claims the paste chord before Android terminal encoding, but preserves Ctrl+C', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android')
  const { field, paste, raw, submit } = bind()
  expect(press(field, { key: 'V' })).toBe(true)
  expect(press(field, { key: 'м' })).toBe(true)
  expect(press(field, { key: 'Unidentified' })).toBe(true)
  expect(raw).not.toHaveBeenCalled()
  expect(press(field, { key: 'c' })).toBe(true)
  expect(raw).toHaveBeenCalledWith(expect.objectContaining({ bytes: '\x03' }))
  expect(submit).not.toHaveBeenCalled()
  expect(paste).toHaveBeenCalledTimes(3)
})

it('leaves editing, composition, other fields and unmounted bindings alone', () => {
  const { field, paste, unbind } = bind()
  for (const init of [
    { ctrlKey: false, metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { isComposing: true },
    { keyCode: 229 }
  ]) {
    expect(press(field, init)).toBe(false)
  }
  field.dispatchEvent(new Event('compositionstart'))
  expect(press(field)).toBe(false)
  field.dispatchEvent(new Event('compositionend'))
  field.readOnly = true
  expect(press(field)).toBe(false)
  field.readOnly = false
  const other = document.createElement('input')
  document.body.append(other)
  other.focus()
  expect(press(other)).toBe(false)
  expect(press(field)).toBe(false)
  unbind()
  field.focus()
  expect(press(field)).toBe(false)
  expect(paste).not.toHaveBeenCalled()
})
