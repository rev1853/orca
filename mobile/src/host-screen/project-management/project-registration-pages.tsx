// New project, Open existing folder and New group: forms on the paired computer's catalog.
import { ScrollView, View } from 'react-native'
import { FolderSearch } from 'lucide-react-native'
import { TextField } from '../../components/composer-input/TextField'
import { MobileSegmentedControl } from '../../components/controls/MobileSegmentedControl'
import { ListGroup, ListRow } from '../../components/list/ListGroup'
import { SheetHeader } from '../../components/nav-bar/SheetHeader'
import { SheetPrimaryButton } from '../../components/sheets/SheetPrimaryButton'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors } from '../../theme/mobile-theme'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import {
  FormError,
  FormLabel,
  FormNote,
  projectFormStyles as styles
} from './project-management-parts'

type FormState = {
  computerName: string
  /** Offline or an older computer: nothing can be sent. */
  blocked: boolean
  busy: boolean
  error: string | null
  onBack: () => void
}

function BrowseRow({
  computerName,
  onPress,
  disabled
}: {
  computerName: string
  onPress: () => void
  disabled: boolean
}) {
  const t = useMobileTranslation()
  return (
    <ListGroup>
      <ListRow
        leading={<FolderSearch size={18} color={colors.textSecondary} />}
        title={t('projectManager.form.browse', 'Browse on {{computer}}', {
          computer: computerName
        })}
        navigates
        disabled={disabled}
        onPress={onPress}
      />
    </ListGroup>
  )
}

export function NewProjectPage(
  props: FormState & {
    name: string
    onName: (value: string) => void
    parentPath: string
    onParentPath: (value: string) => void
    /** Null until the computer answers; false when it has no Git to start the repository with. */
    gitAvailable: boolean | null
    onBrowse: () => void
    onSubmit: () => void
    onUsePlainFolder: () => void
  }
) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const noGit = props.gitAvailable === false
  const ready = props.name.trim() !== '' && props.parentPath.trim() !== '' && !noGit
  return (
    <View style={styles.page}>
      <SheetHeader
        title={t('projectManager.new.title', 'New project')}
        subtitle={props.computerName}
        onBack={{ label: t('common.back', 'Back'), onPress: props.onBack }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <TextField
            label={t('projectManager.new.name', 'Name')}
            value={props.name}
            onChangeText={props.onName}
            placeholder={t('projectManager.new.namePlaceholder', 'my-project')}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!props.busy}
          />
          <TextField
            label={t('projectManager.new.location', 'Create in')}
            value={props.parentPath}
            onChangeText={props.onParentPath}
            autoCapitalize="none"
            autoCorrect={false}
            monospace
            editable={!props.busy}
          />
          <BrowseRow
            computerName={props.computerName}
            onPress={props.onBrowse}
            disabled={props.busy}
          />
          <FormNote>
            {t(
              'projectManager.new.explain',
              'Creates the folder on {{computer}}, starts a Git repository there and makes the first commit.',
              { computer: props.computerName }
            )}
          </FormNote>
          {noGit ? (
            <>
              <FormError
                message={t(
                  'projectManager.new.noGit',
                  'Git is not installed on {{computer}}, so a new project cannot be started there.',
                  { computer: props.computerName }
                )}
              />
              <ListGroup>
                <ListRow
                  title={t('projectManager.new.openInstead', 'Open an existing folder instead')}
                  navigates
                  onPress={props.onUsePlainFolder}
                />
              </ListGroup>
            </>
          ) : null}
          <FormError message={props.error} />
        </View>
      </ScrollView>
      <View style={styles.foot}>
        <SheetPrimaryButton
          label={t('projectManager.new.submit', 'Create project')}
          busy={props.busy}
          disabled={!ready || props.blocked || props.busy}
          onPress={props.onSubmit}
        />
      </View>
    </View>
  )
}

export function OpenFolderPage(
  props: FormState & {
    path: string
    onPath: (value: string) => void
    kind: 'git' | 'folder'
    onKind: (kind: 'git' | 'folder') => void
    onBrowse: () => void
    onSubmit: () => void
  }
) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  return (
    <View style={styles.page}>
      <SheetHeader
        title={t('projectManager.open.title', 'Open existing folder')}
        subtitle={props.computerName}
        onBack={{ label: t('common.back', 'Back'), onPress: props.onBack }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <TextField
            label={t('projectManager.open.path', 'Folder on {{computer}}', {
              computer: props.computerName
            })}
            value={props.path}
            onChangeText={props.onPath}
            placeholder={t('projectManager.open.pathPlaceholder', 'Absolute path')}
            autoCapitalize="none"
            autoCorrect={false}
            monospace
            editable={!props.busy}
          />
          <BrowseRow
            computerName={props.computerName}
            onPress={props.onBrowse}
            disabled={props.busy}
          />
          <View style={styles.field}>
            <FormLabel>{t('projectManager.open.kind', 'Open it as')}</FormLabel>
            <MobileSegmentedControl
              fill
              onSheet
              selected={props.kind}
              disabled={props.busy}
              onSelect={props.onKind}
              segments={[
                { value: 'git', label: t('projectManager.open.git', 'Git repository') },
                { value: 'folder', label: t('projectManager.open.plain', 'Plain folder') }
              ]}
            />
          </View>
          <FormNote>
            {props.kind === 'git'
              ? t(
                  'projectManager.open.gitExplain',
                  'The folder must already be a Git repository. Nothing is created or changed in it.'
                )
              : t(
                  'projectManager.open.plainExplain',
                  'Orca opens the folder as it is, without adding Git. Its files stay where they are.'
                )}
          </FormNote>
          <FormError message={props.error} />
        </View>
      </ScrollView>
      <View style={styles.foot}>
        <SheetPrimaryButton
          label={t('projectManager.open.submit', 'Open folder')}
          busy={props.busy}
          disabled={props.path.trim() === '' || props.blocked || props.busy}
          onPress={props.onSubmit}
        />
      </View>
    </View>
  )
}

export function NewGroupPage(
  props: FormState & { name: string; onName: (value: string) => void; onSubmit: () => void }
) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  return (
    <View style={styles.page}>
      <SheetHeader
        title={t('projectManager.group.title', 'New group')}
        subtitle={props.computerName}
        onBack={{ label: t('common.back', 'Back'), onPress: props.onBack }}
      />
      <View style={styles.page}>
        <TextField
          label={t('projectManager.group.name', 'Group name')}
          value={props.name}
          onChangeText={props.onName}
          autoCapitalize="sentences"
          editable={!props.busy}
        />
        <FormError message={props.error} />
      </View>
      <View style={styles.foot}>
        <SheetPrimaryButton
          label={t('projectManager.group.submit', 'Create group')}
          busy={props.busy}
          disabled={props.name.trim() === '' || props.blocked || props.busy}
          onPress={props.onSubmit}
        />
      </View>
    </View>
  )
}
