// Prefer the layout's letter; use the physical key only when the layout supplies no Latin shortcut.
export function matchesShortcutLetter(event: KeyboardEvent, letter: 'v' | 'l'): boolean {
  return (
    event.key.toLowerCase() === letter ||
    (event.code === (letter === 'v' ? 'KeyV' : 'KeyL') &&
      (event.key === 'Unidentified' ||
        event.key === '' ||
        /^(?!\p{Script=Latin})\p{L}$/u.test(event.key)))
  )
}
