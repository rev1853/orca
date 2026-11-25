// The manager's list: always offers New project, Open existing folder and New group, then every project
// on this computer (even one with no workspaces) with its path and group, and the groups with no project.
import { Pressable, ScrollView, Text, View } from 'react-native'
import { FolderOpen, FolderPlus, Layers } from 'lucide-react-native'
import { MobileLoadErrorState, MobileStateView } from '../../components/feedback/MobileStateView'
import { ListGroup, ListRow, SectionHeader } from '../../components/list/ListGroup'
import { SheetHeader } from '../../components/nav-bar/SheetHeader'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors, feedback, radii, spacing, typography } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { ManagedGroup, ManagedProject } from './project-management-model'
import { FormNote, ProjectMark } from './project-management-parts'
import type { ProjectCatalogRead } from './use-project-catalog'

export type ProjectListNotice = { tone: 'ok' | 'check'; text: string }

export function ProjectListPage(props: {
  computerName: string
  /** Why nothing can be changed, or null when everything can. */
  blockedReason: string | null
  catalog: ProjectCatalogRead
  notice: ProjectListNotice | null
  highlightedId: string | null
  onClose: () => void
  onNewProject: () => void
  onOpenFolder: () => void
  onNewGroup: () => void
  onEdit: (project: ManagedProject) => void
  onMove: (project: ManagedProject) => void
  onRemove: (project: ManagedProject) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const blocked = props.blockedReason !== null
  const { catalog } = props

  return (
    <View style={styles.page}>
      <SheetHeader
        title={t('projectManager.title', 'Manage projects')}
        subtitle={props.computerName}
        trailing={{ label: t('common.done', 'Done'), onPress: props.onClose }}
      />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {props.blockedReason ? <FormNote>{props.blockedReason}</FormNote> : null}
          {props.notice ? (
            <Text
              style={[styles.notice, props.notice.tone === 'check' && styles.noticeCheck]}
              accessibilityRole="alert"
            >
              {props.notice.text}
            </Text>
          ) : null}
          <ListGroup>
            <ListRow
              key="new"
              leading={<FolderPlus size={18} color={colors.textPrimary} />}
              title={t('projectManager.new.title', 'New project')}
              navigates
              disabled={blocked}
              onPress={props.onNewProject}
            />
            <ListRow
              key="open"
              leading={<FolderOpen size={18} color={colors.textPrimary} />}
              title={t('projectManager.open.title', 'Open existing folder')}
              navigates
              disabled={blocked}
              onPress={props.onOpenFolder}
            />
            <ListRow
              key="group"
              leading={<Layers size={18} color={colors.textPrimary} />}
              title={t('projectManager.group.title', 'New group')}
              navigates
              disabled={blocked}
              onPress={props.onNewGroup}
            />
          </ListGroup>
          {catalog.status === 'loading' ? (
            blocked ? null : (
              <MobileStateView loading title={t('projectManager.loading', 'Loading projects…')} />
            )
          ) : catalog.status === 'failed' ? (
            <MobileLoadErrorState error={catalog.error} onRetry={catalog.retry} />
          ) : (
            <CatalogSections {...props} catalog={catalog} blocked={blocked} />
          )}
        </View>
      </ScrollView>
    </View>
  )
}

function CatalogSections(
  props: Parameters<typeof ProjectListPage>[0] & {
    catalog: Extract<ProjectCatalogRead, { status: 'ready' }>
    blocked: boolean
  }
) {
  const t = useMobileTranslation()
  const { projects, groups } = props.catalog
  const groupNames = new Map(groups.map((group) => [group.id, group.ancestry]))
  const used = new Set(
    projects.flatMap((project) =>
      project.membership.kind === 'group' ? [project.membership.groupId] : []
    )
  )
  const emptyGroups = groups.filter((group) => !used.has(group.id))
  const groupLabel = (project: ManagedProject): string =>
    project.membership.kind === 'none'
      ? t('projectManager.list.noGroup', 'No group')
      : project.membership.kind === 'group'
        ? (groupNames.get(project.membership.groupId) ??
          t('projectManager.list.groupUnavailable', 'Group unavailable'))
        : t('projectManager.list.groupUnknown', 'Group unknown')
  return (
    <>
      <SectionHeader title={t('projectManager.list.projects', 'Projects')} />
      {projects.length === 0 ? (
        <MobileStateView
          icon={FolderOpen}
          title={t('projectManager.list.empty', 'No projects yet')}
          message={t(
            'projectManager.list.emptyHint',
            'Create a project or open a folder on {{computer}}.',
            { computer: props.computerName }
          )}
        />
      ) : (
        <View style={styles.cards}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              group={groupLabel(project)}
              highlighted={project.id === props.highlightedId}
              blocked={props.blocked}
              onEdit={props.onEdit}
              onMove={props.onMove}
              onRemove={props.onRemove}
            />
          ))}
        </View>
      )}
      {emptyGroups.length > 0 ? (
        <>
          <SectionHeader title={t('projectManager.list.emptyGroups', 'Empty groups')} />
          <ListGroup>
            {emptyGroups.map((group: ManagedGroup) => (
              <ListRow
                key={group.id}
                title={group.name}
                subtitle={group.ancestry !== group.name ? group.ancestry : undefined}
              />
            ))}
          </ListGroup>
        </>
      ) : null}
    </>
  )
}

function ProjectCard(props: {
  project: ManagedProject
  group: string
  highlighted: boolean
  blocked: boolean
  onEdit: (project: ManagedProject) => void
  onMove: (project: ManagedProject) => void
  onRemove: (project: ManagedProject) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { project } = props
  const actions = [
    {
      key: 'edit',
      label: t('projectManager.list.edit', 'Edit'),
      spoken: t('projectManager.list.editSpoken', 'Edit {{name}}', { name: project.name }),
      onPress: () => props.onEdit(project)
    },
    {
      key: 'move',
      label: t('projectManager.move.title', 'Move to group'),
      spoken: t('projectManager.list.moveSpoken', 'Move {{name}} to a group', {
        name: project.name
      }),
      onPress: () => props.onMove(project)
    },
    {
      key: 'remove',
      label: t('projectManager.remove.title', 'Remove from Orca'),
      spoken: t('projectManager.list.removeSpoken', 'Remove {{name}} from Orca', {
        name: project.name
      }),
      onPress: () => props.onRemove(project)
    }
  ]
  return (
    <View style={[styles.card, props.highlighted && styles.cardHighlighted]}>
      <View style={styles.cardHead}>
        <ProjectMark project={project} />
        <View style={styles.cardText}>
          <Text style={styles.name} numberOfLines={1}>
            {project.name}
          </Text>
          <Text style={styles.path} numberOfLines={2}>
            {project.path}
          </Text>
          <Text style={styles.group} numberOfLines={1}>
            {props.group}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.spoken}
            disabled={props.blocked}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.action,
              action.key === 'remove' && styles.actionRemove,
              props.blocked && styles.actionDisabled,
              pressed && styles.actionPressed
            ]}
          >
            <Text style={[styles.actionLabel, action.key === 'remove' && styles.actionLabelRemove]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  page: { flex: 1 },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  notice: {
    fontSize: 13,
    color: colors.statusGreen,
    backgroundColor: colors.sheetGroup,
    borderRadius: radii.surface,
    padding: spacing.md
  },
  noticeCheck: { color: colors.statusAmber },
  cards: { gap: spacing.sm },
  card: {
    backgroundColor: colors.sheetGroup,
    borderRadius: radii.surface,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  cardHighlighted: { borderColor: colors.statusGreen },
  cardHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  cardText: { flex: 1, gap: spacing.xxs },
  name: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  path: { fontSize: 12, color: colors.textMuted, fontFamily: typography.monoFamily },
  group: { fontSize: 12, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.translucentFill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionRemove: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.statusRed },
  actionDisabled: { opacity: feedback.disabledOpacity },
  actionPressed: { opacity: feedback.pressedOpacity },
  actionLabel: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  actionLabelRemove: { color: colors.statusRed }
}))
