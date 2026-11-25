// Remove from Orca: what removing stops and forgets, counted by the computer just now, and one explicit
// confirmation. The files on disk and other computers' copies are never touched.
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { MobileLoadErrorState, MobileStateView } from '../../components/feedback/MobileStateView'
import { MobilePendingButton } from '../../components/controls/MobilePendingButton'
import { SheetHeader } from '../../components/nav-bar/SheetHeader'
import { sheetPrimaryButtonStyles } from '../../components/sheets/SheetPrimaryButton'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { colors } from '../../theme/mobile-theme'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import type { ManagedProject } from './project-management-model'
import { previewProjectRemoval, type ProjectRemovalImpact } from './project-management-operations'
import {
  FormError,
  FormLabel,
  FormNote,
  projectFormStyles as styles
} from './project-management-parts'

export function ProjectRemovePage(props: {
  client: RpcClient | null
  project: ManagedProject
  computerName: string
  blocked: boolean
  busy: boolean
  error: string | null
  /** A confirmation answered with newer counts: the person must read them and confirm again. */
  recounted: ProjectRemovalImpact | null
  onBack: () => void
  onConfirm: (impact: ProjectRemovalImpact) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { client, project } = props
  const [preview, setPreview] = useState<
    | { status: 'loading' }
    | { status: 'failed'; error: unknown }
    | { status: 'ready'; impact: ProjectRemovalImpact }
  >({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!client) {
      return
    }
    let live = true
    setPreview({ status: 'loading' })
    previewProjectRemoval(client, project.id).then(
      (impact) => live && setPreview({ status: 'ready', impact }),
      (error: unknown) => live && setPreview({ status: 'failed', error })
    )
    return () => {
      live = false
    }
  }, [client, project.id, attempt])
  const impact = props.recounted ?? (preview.status === 'ready' ? preview.impact : null)

  return (
    <View style={styles.page}>
      <SheetHeader
        title={t('projectManager.remove.title', 'Remove from Orca')}
        subtitle={props.computerName}
        onBack={{ label: t('common.back', 'Back'), onPress: props.onBack }}
      />
      {preview.status === 'failed' && !props.recounted ? (
        <MobileLoadErrorState error={preview.error} onRetry={() => setAttempt(attempt + 1)} />
      ) : !impact ? (
        <MobileStateView
          loading
          title={t('projectManager.remove.counting', 'Checking what is open…')}
        />
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.page}>
              <FormLabel>
                {t('projectManager.remove.question', 'Remove {{name}} from Orca on {{computer}}?', {
                  name: project.name,
                  computer: props.computerName
                })}
              </FormLabel>
              <FormNote>{project.path}</FormNote>
              {props.recounted ? (
                <FormError
                  message={t(
                    'projectManager.remove.changed',
                    'More was open on {{computer}} since you looked. Review this and confirm again.',
                    { computer: props.computerName }
                  )}
                />
              ) : null}
              <FormNote>
                {t(
                  'projectManager.remove.terminals',
                  '{{n}} open terminals in this project will stop.',
                  { n: impact.liveTerminals }
                )}
              </FormNote>
              <FormNote>
                {t(
                  'projectManager.remove.workspaces',
                  'Orca will forget the details of {{n}} workspaces in it.',
                  { n: impact.workspacesWithMetadata }
                )}
              </FormNote>
              <FormNote>
                {t(
                  'projectManager.remove.keeps',
                  'The files in this folder stay on {{computer}}. Copies of this project on other computers stay registered.',
                  { computer: props.computerName }
                )}
              </FormNote>
              <FormError message={props.error} />
            </View>
          </ScrollView>
          <View style={styles.foot}>
            <MobilePendingButton
              label={t('projectManager.remove.confirm', 'Remove from Orca')}
              pending={props.busy}
              disabled={props.blocked || props.busy}
              style={[sheetPrimaryButtonStyles.button, { backgroundColor: colors.statusRed }]}
              labelStyle={[sheetPrimaryButtonStyles.label, { color: '#ffffff' }]}
              spinnerColor="#ffffff"
              onPress={() => props.onConfirm(impact)}
            />
            <MobilePendingButton
              label={t('common.cancel', 'Cancel')}
              disabled={props.busy}
              style={sheetPrimaryButtonStyles.button}
              labelStyle={sheetPrimaryButtonStyles.label}
              spinnerColor={colors.textPrimary}
              onPress={props.onBack}
            />
          </View>
        </>
      )}
    </View>
  )
}
