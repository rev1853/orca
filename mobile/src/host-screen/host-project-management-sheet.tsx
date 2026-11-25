// Host ⋯ › Manage projects: the paired computer's own project catalog, edited from the phone. Every
// operation lands on this computer's catalog (never the phone's files, never another host's copy), and
// only after the computer acknowledges is the list re-read and the person returned to it.
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { BottomDrawerModalHost } from '../components/bottom-drawer/bottom-drawer-modal-host'
import { useBottomDrawerModalHostBackClaim } from '../components/bottom-drawer/bottom-drawer-modal-host-scope'
import { useHostProtocolGates } from '../components/host-connection/host-protocol-gates-context'
import { HostFolderBrowserPage } from '../host-folders/HostFolderBrowserPage'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useHostMutation } from '../query/host-mutation'
import { ProjectEditPage } from './project-management/project-edit-page'
import { ProjectListPage, type ProjectListNotice } from './project-management/project-list-page'
import { ProjectMovePage } from './project-management/project-move-page'
import {
  groupCreate,
  PROJECT_MANAGEMENT_CAPABILITY,
  projectCatalogQueryKeys,
  projectCreate,
  projectMove,
  projectOpen,
  projectRemove,
  projectUpdate,
  readDefaultCreateParent,
  readGitAvailable,
  type ProjectRemovalImpact
} from './project-management/project-management-operations'
import { useWriteAttempt } from './project-management/project-management-parts'
import { ProjectRemovePage } from './project-management/project-remove-page'
import {
  NewGroupPage,
  NewProjectPage,
  OpenFolderPage
} from './project-management/project-registration-pages'
import { useProjectCatalog } from './project-management/use-project-catalog'
import type { HostScreenController } from './use-host-screen-controller'

type Page =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'open' }
  | { kind: 'group' }
  | { kind: 'browse'; for: 'new' | 'open' }
  | { kind: 'edit'; repoId: string }
  | { kind: 'move'; repoId: string }
  | { kind: 'remove'; repoId: string }

// What the list says after a write, resolved against the re-read catalog rather than assumed.
type Outcome =
  | { kind: 'added'; repoId: string }
  | { kind: 'saved'; repoId: string }
  | { kind: 'moved'; repoId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'removed'; name: string }

type Draft = {
  name: string
  parentPath: string
  path: string
  kind: 'git' | 'folder'
  groupName: string
}

const EMPTY_DRAFT: Draft = { name: '', parentPath: '', path: '', kind: 'git', groupName: '' }
const LIST: Page = { kind: 'list' }

type SheetProps = { controller: HostScreenController; visible: boolean; onClose: () => void }

// iOS presents the drawer's pages in one Modal; Android's Back reaches them through the host.
export function HostProjectManagementSheet(props: SheetProps) {
  return (
    <BottomDrawerModalHost>
      {/* Keyed by host: a host switch drops every page, draft and in-flight answer of the last one. */}
      <ProjectManagementDrawer key={props.controller.hostId} {...props} />
    </BottomDrawerModalHost>
  )
}

function ProjectManagementDrawer({ controller, visible, onClose }: SheetProps) {
  const t = useMobileTranslation()
  const queryClient = useQueryClient()
  const { client, connState, hostId, state } = controller
  const { hostCapabilities, statusPending } = useHostProtocolGates()
  const computerName = state.hostName
  const host = { hostId, client }

  const [page, setPage] = useState<Page>(LIST)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [recounted, setRecounted] = useState<ProjectRemovalImpact | null>(null)
  const [gitAvailable, setGitAvailable] = useState<boolean | null>(null)
  const attempt = useWriteAttempt(t)
  const prepared = useRef(false)

  const create = useHostMutation(projectCreate, host)
  const open = useHostMutation(projectOpen, host)
  const makeGroup = useHostMutation(groupCreate, host)
  const update = useHostMutation(projectUpdate, host)
  const move = useHostMutation(projectMove, host)
  const remove = useHostMutation(projectRemove, host)

  const supported = hostCapabilities.includes(PROJECT_MANAGEMENT_CAPABILITY)
  const online = connState === 'connected'
  const blockedReason = statusPending
    ? t('projectManager.checking', 'Checking {{computer}}…', { computer: computerName })
    : !supported
      ? t('projectManager.errors.updateComputer', 'Update Orca on this computer to manage projects')
      : !online
        ? t('projectManager.offline', 'Reconnect to {{computer}} to manage projects.', {
            computer: computerName
          })
        : null
  const blocked = blockedReason !== null || create.blockedOffline
  const catalog = useProjectCatalog({
    hostId,
    client,
    enabled: visible && supported && online
  })
  const ready = catalog.status === 'ready' ? catalog : null
  const projectFor = (repoId: string) => ready?.projects.find((project) => project.id === repoId)

  // New project starts at the computer's own default folder, and learns whether Git is there to start with.
  useEffect(() => {
    if (!visible || page.kind !== 'new' || !client || prepared.current) {
      return
    }
    prepared.current = true
    let live = true
    void readDefaultCreateParent(client).then((parentPath) => {
      if (live) {
        setDraft((held) => (held.parentPath === '' ? { ...held, parentPath } : held))
      }
    })
    void readGitAvailable(client).then((available) => live && setGitAvailable(available))
    return () => {
      live = false
      prepared.current = false
    }
  }, [visible, page.kind, client])

  // A project that vanished (removed on the computer meanwhile) takes its page with it.
  const pageProjectId =
    page.kind === 'edit' || page.kind === 'move' || page.kind === 'remove' ? page.repoId : null
  useEffect(() => {
    if (pageProjectId !== null && ready && !projectFor(pageProjectId) && !attempt.busy) {
      setPage(LIST)
    }
  })

  const go = (next: Page) => {
    attempt.clear()
    setPage(next)
  }
  const refresh = async () => {
    await Promise.all(
      projectCatalogQueryKeys(hostId).map((queryKey) =>
        queryClient.refetchQueries({ queryKey, exact: true })
      )
    ).catch(() => undefined)
  }
  // The computer acknowledged: re-read its lists, then return to them showing what it now holds.
  const settle = async (next: Outcome) => {
    await refresh()
    setOutcome(next)
    setDraft(EMPTY_DRAFT)
    setRecounted(null)
    setPage(LIST)
  }
  const fail = () => void refresh()

  const back = (): void => {
    go(page.kind === 'browse' ? { kind: page.for } : LIST)
  }
  useBottomDrawerModalHostBackClaim(page.kind !== 'list' && !attempt.busy ? back : null)

  const listNotice = (): ProjectListNotice | null => {
    if (!outcome) {
      return null
    }
    const check = {
      tone: 'check' as const,
      text: t('projectManager.errors.unconfirmed', 'Check the project list before trying again')
    }
    if (outcome.kind === 'removed') {
      return {
        tone: 'ok',
        text: t(
          'projectManager.notice.removed',
          'Removed {{name}} from Orca. Its files were not touched.',
          { name: outcome.name }
        )
      }
    }
    if (outcome.kind === 'group') {
      const group = ready?.groups.find((entry) => entry.id === outcome.groupId)
      return group
        ? {
            tone: 'ok',
            text: t('projectManager.notice.group', 'Created group {{name}}', { name: group.name })
          }
        : check
    }
    const project = projectFor(outcome.repoId)
    if (!project) {
      return check
    }
    const wording =
      outcome.kind === 'added'
        ? t('projectManager.notice.added', '{{name}} is in your projects', { name: project.name })
        : outcome.kind === 'moved'
          ? t('projectManager.notice.moved', 'Moved {{name}}', { name: project.name })
          : t('projectManager.notice.saved', 'Saved {{name}}', { name: project.name })
    return { tone: 'ok', text: wording }
  }

  const form = { computerName, blocked, busy: attempt.busy, error: attempt.error, onBack: back }
  const editing = pageProjectId === null ? undefined : projectFor(pageProjectId)

  let body: React.JSX.Element
  if (page.kind === 'new') {
    body = (
      <NewProjectPage
        {...form}
        name={draft.name}
        onName={(name) => setDraft({ ...draft, name })}
        parentPath={draft.parentPath}
        onParentPath={(parentPath) => setDraft({ ...draft, parentPath })}
        gitAvailable={gitAvailable}
        onBrowse={() => go({ kind: 'browse', for: 'new' })}
        onUsePlainFolder={() => {
          setDraft({ ...draft, kind: 'folder' })
          go({ kind: 'open' })
        }}
        onSubmit={() =>
          void attempt.run(async () => {
            const repoId = await create.mutate({
              parentPath: draft.parentPath.trim(),
              name: draft.name.trim()
            })
            await settle({ kind: 'added', repoId })
          }, fail)
        }
      />
    )
  } else if (page.kind === 'open') {
    body = (
      <OpenFolderPage
        {...form}
        path={draft.path}
        onPath={(path) => setDraft({ ...draft, path })}
        kind={draft.kind}
        onKind={(kind) => setDraft({ ...draft, kind })}
        onBrowse={() => go({ kind: 'browse', for: 'open' })}
        onSubmit={() =>
          void attempt.run(async () => {
            const repoId = await open.mutate({ path: draft.path.trim(), kind: draft.kind })
            await settle({ kind: 'added', repoId })
          }, fail)
        }
      />
    )
  } else if (page.kind === 'group') {
    body = (
      <NewGroupPage
        {...form}
        name={draft.groupName}
        onName={(groupName) => setDraft({ ...draft, groupName })}
        onSubmit={() =>
          void attempt.run(async () => {
            const groupId = await makeGroup.mutate({ name: draft.groupName.trim() })
            await settle({ kind: 'group', groupId })
          }, fail)
        }
      />
    )
  } else if (page.kind === 'browse') {
    const target = page.for
    body = (
      <HostFolderBrowserPage
        client={client}
        computerName={computerName}
        startPath={target === 'new' ? draft.parentPath : draft.path}
        onBack={back}
        onPick={(path) => {
          setDraft(target === 'new' ? { ...draft, parentPath: path } : { ...draft, path })
          go({ kind: target })
        }}
      />
    )
  } else if (page.kind === 'edit' && editing) {
    body = (
      <ProjectEditPage
        key={editing.id}
        project={editing}
        {...form}
        onSave={(updates) =>
          void attempt.run(async () => {
            const repoId = await update.mutate({ repoId: editing.id, updates })
            await settle({ kind: 'saved', repoId })
          }, fail)
        }
      />
    )
  } else if (page.kind === 'move' && editing && ready) {
    body = (
      <ProjectMovePage
        project={editing}
        groups={ready.groups}
        {...form}
        onMove={(groupId) =>
          void attempt.run(async () => {
            const repoId = await move.mutate({ repoId: editing.id, groupId })
            await settle({ kind: 'moved', repoId })
          }, fail)
        }
      />
    )
  } else if (page.kind === 'remove' && editing) {
    body = (
      <ProjectRemovePage
        key={editing.id}
        client={client}
        project={editing}
        {...form}
        recounted={recounted}
        onConfirm={(impact) =>
          void attempt.run(async () => {
            const reply = await remove.mutate({ repoId: editing.id, confirmedImpact: impact })
            if (reply.kind === 'impact') {
              // More opened since the preview: show the new counts and ask again.
              setRecounted(reply.impact)
              return
            }
            await settle({ kind: 'removed', name: editing.name })
          }, fail)
        }
      />
    )
  } else {
    body = (
      <ProjectListPage
        computerName={computerName}
        blockedReason={blockedReason}
        catalog={catalog}
        notice={listNotice()}
        highlightedId={
          outcome && 'repoId' in outcome && projectFor(outcome.repoId) ? outcome.repoId : null
        }
        onClose={onClose}
        onNewProject={() => go({ kind: 'new' })}
        onOpenFolder={() => go({ kind: 'open' })}
        onNewGroup={() => go({ kind: 'group' })}
        onEdit={(project) => go({ kind: 'edit', repoId: project.id })}
        onMove={(project) => go({ kind: 'move', repoId: project.id })}
        onRemove={(project) => {
          setRecounted(null)
          go({ kind: 'remove', repoId: project.id })
        }}
      />
    )
  }

  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      dismissible={!attempt.busy}
      fillAvailable={page.kind === 'browse'}
      scrollResetKey={page.kind}
      // The pages, drafts and any answer still out belong to this opening only.
      onAfterClose={() => {
        setPage(LIST)
        setDraft(EMPTY_DRAFT)
        setOutcome(null)
        setRecounted(null)
        setGitAvailable(null)
        attempt.clear()
      }}
    >
      <View>{body}</View>
    </BottomDrawer>
  )
}
