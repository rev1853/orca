// Move to group: this computer's groups (with their ancestry, so same-named ones stay apart) or none.
import { ScrollView, View } from 'react-native'
import { SheetHeader } from '../../components/nav-bar/SheetHeader'
import { ListGroup, ListRow } from '../../components/list/ListGroup'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { ManagedGroup, ManagedProject } from './project-management-model'
import { FormError, FormNote, projectFormStyles as styles } from './project-management-parts'

export function ProjectMovePage(props: {
  project: ManagedProject
  groups: readonly ManagedGroup[]
  computerName: string
  blocked: boolean
  busy: boolean
  error: string | null
  onBack: () => void
  onMove: (groupId: string | null) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { membership } = props.project
  return (
    <View style={styles.page}>
      <SheetHeader
        title={t('projectManager.move.title', 'Move to group')}
        subtitle={props.project.name}
        onBack={{ label: t('common.back', 'Back'), onPress: props.onBack }}
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <ListGroup>
            <ListRow
              key="none"
              title={t('projectManager.move.none', 'No group')}
              selected={membership.kind === 'none'}
              disabled={props.blocked || props.busy || membership.kind === 'none'}
              accessibilityRole="radio"
              onPress={() => props.onMove(null)}
            />
            {props.groups.map((group) => (
              <ListRow
                key={group.id}
                title={group.name}
                subtitle={group.ancestry !== group.name ? group.ancestry : undefined}
                selected={membership.kind === 'group' && membership.groupId === group.id}
                disabled={
                  props.blocked ||
                  props.busy ||
                  (membership.kind === 'group' && membership.groupId === group.id)
                }
                accessibilityRole="radio"
                onPress={() => props.onMove(group.id)}
              />
            ))}
          </ListGroup>
          {props.groups.length === 0 ? (
            <FormNote>
              {t(
                'projectManager.move.noGroups',
                '{{computer}} has no groups yet. Create one from the project list.',
                { computer: props.computerName }
              )}
            </FormNote>
          ) : null}
          <FormError message={props.error} />
        </View>
      </ScrollView>
    </View>
  )
}
