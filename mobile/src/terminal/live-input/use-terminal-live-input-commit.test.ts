// @vitest-environment happy-dom
import type { TextInputInstance } from 'react-native'
import { act } from 'react-test-renderer'
import { expect, it } from 'vitest'
import { hookMount } from '../../test-support/rpc-recording/react-mounting/hook-mount'
import { useTerminalLiveInputCommit } from './use-terminal-live-input-commit'

it('consumes terminal arrows synchronously but leaves caret, IME and modified keys alone', async () => {
  const field = document.createElement('input')
  const writes: string[] = []
  let input!: ReturnType<typeof useTerminalLiveInputCommit>
  const screen = hookMount(() => {
    input = useTerminalLiveInputCommit({
      activeHandle: 'term',
      activeHandleRef: { current: 'term' },
      activeSessionTabType: 'terminal',
      activeSessionTabTypeRef: { current: 'terminal' },
      connected: true,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: RN Web exposes the DOM field as TextInputInstance; this key path reads only its value and selection.
      liveInputRef: { current: field as unknown as TextInputInstance },
      setLiveInputCapture: (text) => {
        field.value = text
      },
      sendLiveTerminalInputRef: {
        current: async (_handle, bytes) => {
          writes.push(bytes)
          return true
        }
      }
    })
  })
  function press(key: string, init?: KeyboardEventInit): boolean {
    const nativeEvent = new KeyboardEvent('keydown', { key, cancelable: true, ...init })
    input.handleLiveInputKeyPress({ nativeEvent })
    return nativeEvent.defaultPrevented
  }

  screen.mount()
  try {
    await act(async () => {
      expect(press('ArrowLeft')).toBe(true)
      expect(press('ArrowRight')).toBe(true)
      expect(press('ArrowLeft', { isComposing: true })).toBe(false)
      expect(press('ArrowRight', { metaKey: true })).toBe(false)
    })
    expect(writes.splice(0)).toEqual(['\x1b[D', '\x1b[C'])

    await act(async () => {
      input.handleLiveInputChange({ nativeEvent: { text: 'ab', isComposing: false } })
    })
    expect(writes.splice(0)).toEqual(['ab'])
    field.setSelectionRange(1, 1)
    await act(async () => expect(press('ArrowRight')).toBe(false))
    expect(writes).toEqual([])
    field.setSelectionRange(2, 2)
    await act(async () => expect(press('ArrowRight')).toBe(true))
    expect(writes).toEqual(['\x1b[C'])
  } finally {
    await screen.unmount()
  }
})
