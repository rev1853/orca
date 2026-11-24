import { matchesShortcutLetter } from '../platform/keyboard/matches-shortcut-letter'

export function bindHostSidebarShortcut(doc: Document, toggle: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !event.ctrlKey ||
      !event.shiftKey ||
      event.altKey ||
      event.metaKey ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.getModifierState('AltGraph') ||
      !matchesShortcutLetter(event, 'l') ||
      doc.querySelector('[aria-modal="true"]')
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) {
      toggle()
    }
  }
  doc.addEventListener('keydown', onKeyDown, true)
  return () => doc.removeEventListener('keydown', onKeyDown, true)
}
