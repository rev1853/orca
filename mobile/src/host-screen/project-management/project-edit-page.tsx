// A project's name and look on the paired computer. Only what changed is sent, so a rename never
// replaces an icon (an uploaded image included) the person didn't touch.
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Check } from 'lucide-react-native'
import {
  normalizeRepoBadgeColor,
  REPO_COLORS
} from '../../../../src/shared/repository/appearance/repo-badge-color'
import { TextField } from '../../components/composer-input/TextField'
import { MobileSegmentedControl } from '../../components/controls/MobileSegmentedControl'
import { SheetHeader } from '../../components/nav-bar/SheetHeader'
import { SheetPrimaryButton } from '../../components/sheets/SheetPrimaryButton'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors, spacing } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { ManagedProject } from './project-management-model'
import type { ProjectUpdateVars } from './project-management-operations'
import {
  FormError,
  FormLabel,
  FormNote,
  ProjectMark,
  projectFormStyles
} from './project-management-parts'

type IconMode = 'keep' | 'emoji' | 'letters' | 'default'

export function ProjectEditPage(props: {
  project: ManagedProject
  computerName: string
  blocked: boolean
  busy: boolean
  error: string | null
  onBack: () => void
  onSave: (updates: ProjectUpdateVars['updates']) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { project } = props
  const [name, setName] = useState(project.name)
  const [color, setColor] = useState(project.badgeColor)
  const [iconMode, setIconMode] = useState<IconMode>('keep')
  const [iconText, setIconText] = useState('')

  const colorNames: Record<(typeof REPO_COLORS)[number], string> = {
    '#737373': t('projectManager.edit.colors.neutral', 'Gray'),
    '#ef4444': t('projectManager.edit.colors.red', 'Red'),
    '#f97316': t('projectManager.edit.colors.orange', 'Orange'),
    '#eab308': t('projectManager.edit.colors.yellow', 'Yellow'),
    '#22c55e': t('projectManager.edit.colors.green', 'Green'),
    '#14b8a6': t('projectManager.edit.colors.teal', 'Teal'),
    '#8b5cf6': t('projectManager.edit.colors.purple', 'Purple'),
    '#ec4899': t('projectManager.edit.colors.pink', 'Pink')
  }
  // A color picked on the desktop stays selectable and selected until another is chosen.
  const customColor =
    project.badgeColor &&
    !REPO_COLORS.some((known) => known === normalizeRepoBadgeColor(project.badgeColor))
      ? project.badgeColor
      : null
  const swatches: { value: string; label: string }[] = [
    ...REPO_COLORS.map((value) => ({ value, label: colorNames[value] })),
    ...(customColor
      ? [{ value: customColor, label: t('projectManager.edit.colors.custom', 'Custom color') }]
      : [])
  ]

  const updates: ProjectUpdateVars['updates'] = {}
  const trimmedName = name.trim()
  if (trimmedName !== '' && trimmedName !== project.name) {
    updates.displayName = trimmedName
  }
  if (color && normalizeRepoBadgeColor(color) !== normalizeRepoBadgeColor(project.badgeColor)) {
    updates.badgeColor = color
  }
  const iconValue = iconText.trim()
  if (iconMode === 'emoji' && iconValue !== '') {
    updates.repoIcon = { type: 'emoji', emoji: iconValue }
  } else if (iconMode === 'letters' && iconValue !== '') {
    updates.repoIcon = { type: 'letters', text: iconValue }
  } else if (iconMode === 'default' && project.icon !== null) {
    updates.repoIcon = null
  }
  const changed = Object.keys(updates).length > 0

  return (
    <View style={projectFormStyles.page}>
      <SheetHeader
        title={t('projectManager.edit.title', 'Edit project')}
        subtitle={props.computerName}
        onBack={{ label: t('common.back', 'Back'), onPress: props.onBack }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={projectFormStyles.page}>
          <View style={styles.preview}>
            <ProjectMark
              project={{
                name: trimmedName || project.name,
                badgeColor: color,
                icon: updates.repoIcon === undefined ? project.icon : updates.repoIcon
              }}
            />
            <FormNote>{project.path}</FormNote>
          </View>
          <TextField
            label={t('projectManager.edit.name', 'Name')}
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!props.busy}
          />
          <View style={projectFormStyles.field}>
            <FormLabel>{t('projectManager.edit.color', 'Color')}</FormLabel>
            <View style={styles.swatches}>
              {swatches.map((swatch) => {
                const selected =
                  normalizeRepoBadgeColor(color) === normalizeRepoBadgeColor(swatch.value)
                return (
                  <Pressable
                    key={swatch.value}
                    accessibilityRole="radio"
                    accessibilityLabel={swatch.label}
                    accessibilityState={{ selected }}
                    disabled={props.busy}
                    onPress={() => setColor(swatch.value)}
                    style={[styles.swatch, { backgroundColor: swatch.value }]}
                  >
                    {selected ? <Check size={16} color="#ffffff" strokeWidth={3} /> : null}
                  </Pressable>
                )
              })}
            </View>
          </View>
          <View style={projectFormStyles.field}>
            <FormLabel>{t('projectManager.edit.icon', 'Icon')}</FormLabel>
            <MobileSegmentedControl
              fill
              onSheet
              selected={iconMode}
              disabled={props.busy}
              onSelect={(mode: IconMode) => {
                setIconMode(mode)
                setIconText('')
              }}
              segments={[
                { value: 'keep', label: t('projectManager.edit.iconKeep', 'Keep') },
                { value: 'emoji', label: t('projectManager.edit.iconEmoji', 'Emoji') },
                { value: 'letters', label: t('projectManager.edit.iconLetters', 'Initials') },
                { value: 'default', label: t('projectManager.edit.iconDefault', 'Default') }
              ]}
            />
            {iconMode === 'emoji' || iconMode === 'letters' ? (
              <TextField
                value={iconText}
                onChangeText={setIconText}
                maxLength={iconMode === 'letters' ? 2 : 16}
                autoCapitalize={iconMode === 'letters' ? 'characters' : 'none'}
                autoCorrect={false}
                editable={!props.busy}
                accessibilityLabel={
                  iconMode === 'letters'
                    ? t('projectManager.edit.initialsField', 'Initials, one or two characters')
                    : t('projectManager.edit.emojiIconField', 'Emoji icon')
                }
              />
            ) : null}
            {iconMode === 'keep' && project.icon?.type === 'image' ? (
              <FormNote>
                {t(
                  'projectManager.edit.imageKept',
                  'This project uses an image icon. It stays unless you pick another icon.'
                )}
              </FormNote>
            ) : null}
          </View>
          <FormError message={props.error} />
        </View>
      </ScrollView>
      <View style={projectFormStyles.foot}>
        <SheetPrimaryButton
          label={t('common.save', 'Save')}
          busy={props.busy}
          disabled={!changed || trimmedName === '' || props.blocked || props.busy}
          onPress={() => props.onSave(updates)}
        />
      </View>
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle
  }
}))
