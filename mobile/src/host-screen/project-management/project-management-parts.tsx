import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import type { Translate } from '../../i18n/mobile-i18n'
import { colors, radii, spacing } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { describeProjectWriteError } from './project-write-errors'
import type { ManagedProject } from './project-management-model'

/** A project's color tile: its own emoji or initials, else its first letter. Images show as the letter. */
export function ProjectMark({
  project
}: {
  project: Pick<ManagedProject, 'badgeColor' | 'icon' | 'name'>
}) {
  useMobileColorScheme()
  const icon = project.icon
  const text =
    icon?.type === 'emoji'
      ? icon.emoji
      : icon?.type === 'letters'
        ? icon.text
        : (Array.from(project.name.trim())[0] ?? '?').toUpperCase()
  return (
    <View style={[styles.mark, { backgroundColor: project.badgeColor ?? colors.statusAmber }]}>
      <Text style={styles.markText} accessibilityElementsHidden importantForAccessibility="no">
        {text}
      </Text>
    </View>
  )
}

/** One write at a time: a second press while one is out is ignored, and its failure stays on the form. */
export function useWriteAttempt(t: Translate) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const run = useCallback(
    async (write: () => Promise<void>, onFailure?: () => void) => {
      if (inFlight.current) {
        return
      }
      inFlight.current = true
      setBusy(true)
      setError(null)
      try {
        await write()
      } catch (failure) {
        setError(describeProjectWriteError(failure, t))
        onFailure?.()
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [t]
  )
  const clear = useCallback(() => setError(null), [])
  return { busy, error, run, clear }
}

export function FormLabel({ children }: { children: ReactNode }) {
  useMobileColorScheme()
  return <Text style={styles.label}>{children}</Text>
}

export function FormError({ message }: { message: string | null }) {
  useMobileColorScheme()
  return message ? (
    <Text style={styles.error} accessibilityRole="alert">
      {message}
    </Text>
  ) : null
}

export function FormNote({ children }: { children: ReactNode }) {
  useMobileColorScheme()
  return <Text style={styles.note}>{children}</Text>
}

export const projectFormStyles = themedStyleSheet(() => ({
  page: { gap: spacing.md, paddingBottom: spacing.lg },
  field: { gap: spacing.xs },
  foot: { paddingTop: spacing.md, gap: spacing.sm },
  rowButtons: { flexDirection: 'row', gap: spacing.sm }
}))

const styles = themedStyleSheet(() => ({
  mark: {
    width: 32,
    height: 32,
    borderRadius: radii.tile,
    alignItems: 'center',
    justifyContent: 'center'
  },
  markText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  error: { fontSize: 13, color: colors.statusRed },
  note: { fontSize: 13, color: colors.textSecondary }
}))
