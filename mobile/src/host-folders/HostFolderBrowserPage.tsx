// Picks a folder on the paired computer, anywhere on it (not just under its home). Never the phone's own files.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { CornerLeftUp, Folder, FolderOpen } from 'lucide-react-native'
import { MobileLoadErrorState, MobileStateView } from '../components/feedback/MobileStateView'
import { LIST_LEADING_INSET, ListGroup, ListRow } from '../components/list/ListGroup'
import { SheetHeader } from '../components/nav-bar/SheetHeader'
import { SheetPrimaryButton } from '../components/sheets/SheetPrimaryButton'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, spacing } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import {
  hostDirectoryChildPath,
  hostDirectoryParentPath,
  readHostDirectory,
  type HostDirectory
} from './host-directory-read'

export function HostFolderBrowserPage(props: {
  client: RpcClient | null
  computerName: string
  /** Where to open: `~`, or the folder the form already holds. Falls back to `~` when it can't be read. */
  startPath: string
  onBack: () => void
  onPick: (path: string) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { client, startPath } = props
  const [current, setCurrent] = useState<HostDirectory | null>(null)
  const [failure, setFailure] = useState<{ error: unknown; path: string } | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  // A reply for a folder the person has already left is dropped.
  const navigation = useRef(0)

  const open = useCallback(
    async (path: string, fallback?: string) => {
      if (!client) {
        return
      }
      const at = ++navigation.current
      setOpening(path)
      setFailure(null)
      try {
        const next = await readHostDirectory(client, path).catch((error: unknown) => {
          if (fallback === undefined) {
            throw error
          }
          return readHostDirectory(client, fallback)
        })
        if (at === navigation.current) {
          setCurrent(next)
        }
      } catch (error) {
        if (at === navigation.current) {
          setFailure({ error, path })
        }
      } finally {
        if (at === navigation.current) {
          setOpening(null)
        }
      }
    },
    [client]
  )
  useEffect(() => {
    void open(startPath === '' ? '~' : startPath, '~')
    return () => {
      navigation.current += 1
    }
  }, [open, startPath])

  const parent = current ? hostDirectoryParentPath(current) : null
  const folders = current
    ? current.entries.filter((entry) => entry.isDirectory && !entry.name.startsWith('.'))
    : []
  // Windows lists its drives at `/`; a drive list is not itself a folder to use.
  const listsDrives = current?.pathFlavor === 'win32' && current.resolvedPath === '/'

  return (
    <View style={styles.page}>
      <SheetHeader
        title={t('projectManager.browse.title', 'Choose a folder')}
        subtitle={t('projectManager.browse.onComputer', 'On {{computer}}', {
          computer: props.computerName
        })}
        onBack={{ label: t('common.back', 'Back'), onPress: props.onBack }}
      />
      {failure ? (
        <MobileLoadErrorState
          error={failure.error}
          onRetry={() => void open(failure.path, failure.path === '~' ? undefined : '~')}
        />
      ) : !current ? (
        <MobileStateView loading title={t('projectManager.browse.loading', 'Loading folders…')} />
      ) : (
        <>
          <Text style={styles.path} numberOfLines={2}>
            {listsDrives ? t('projectManager.browse.drives', 'Drives') : current.resolvedPath}
          </Text>
          <ScrollView style={styles.page} showsVerticalScrollIndicator={false}>
            <ListGroup separatorInset={LIST_LEADING_INSET}>
              {parent !== null ? (
                <ListRow
                  key="parent"
                  leading={<CornerLeftUp size={18} color={colors.textSecondary} />}
                  title={t('projectManager.browse.parent', 'Parent folder')}
                  busy={opening === parent}
                  onPress={() => void open(parent)}
                />
              ) : null}
              {folders.map((entry) => (
                <ListRow
                  key={entry.name}
                  leading={<Folder size={18} color={colors.textSecondary} />}
                  title={entry.name}
                  navigates
                  busy={opening === hostDirectoryChildPath(current, entry.name)}
                  onPress={() => void open(hostDirectoryChildPath(current, entry.name))}
                />
              ))}
            </ListGroup>
            {folders.length === 0 ? (
              <MobileStateView
                icon={FolderOpen}
                title={t('projectManager.browse.noFolders', 'No folders here')}
              />
            ) : null}
          </ScrollView>
          <View style={styles.foot}>
            <SheetPrimaryButton
              label={t('projectManager.browse.useFolder', 'Use this folder')}
              disabled={opening !== null || listsDrives}
              onPress={() => props.onPick(current.resolvedPath)}
            />
          </View>
        </>
      )}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  page: { flex: 1 },
  path: { fontSize: 12, color: colors.textMuted, paddingBottom: spacing.sm },
  foot: { paddingTop: spacing.md }
}))
