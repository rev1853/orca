// Renderer-side teardown of a removed project: shared by desktop removal and removals the paired phone made.
import { isRemoteRuntimePtyId } from '../../../../shared/remote-runtime/remote-runtime-pty-id'
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import {
  getWorktreeIdFromVisitKey,
  getWorktreeVisitKey
} from '@/lib/workspace/activation/worktree-visit-recency'
import { omitSparsePresetsForRepos } from '../slices/worktrees/create/sparse-presets'
import { repoMatchesHostIdentity, worktreeBelongsToHost } from './repo-host-identity'
// oxfmt-ignore
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { mergeProjectCompatibilityForHostRepoChange } from './repo-catalog-identity'
import {
  closeRemovedHostTwinState,
  collectRemovedHostTwins,
  type RemovedHostTwins
} from './repo-removal-host-twin-teardown'
import { twinSelectionPatch } from './repo-removal-host-twin-attribution'
import * as chatDrafts from '../slices/worktrees/teardown/removed-worktree-chat-drafts'
import {
  flushPurgedWorkspaceEdits,
  noticeRemovedUnsavedFiles,
  type ConfirmedUnsavedDiscards
} from '../slices/worktrees/teardown/removed-workspace-unsaved-files'
import { worktreePurgeClosedFileIds } from '../slices/worktrees/teardown/worktree-purge-closed-files'

export type HostScopedWorktreeRef = { id: string; hostId?: string }

export type RepoWorktreeCatalog = {
  worktreesByRepo: Readonly<Record<string, readonly HostScopedWorktreeRef[] | undefined>>
  detectedWorktreesByRepo: Readonly<
    Record<string, { worktrees: readonly HostScopedWorktreeRef[] } | undefined>
  >
}

export function getKnownRepoWorktreeIds(
  state: RepoWorktreeCatalog,
  projectId: string,
  hostId?: string
): string[] {
  const ids = new Set<string>()
  for (const worktree of state.worktreesByRepo[projectId] ?? []) {
    if (!hostId || worktreeBelongsToHost(worktree, hostId)) {
      ids.add(worktree.id)
    }
  }
  for (const worktree of state.detectedWorktreesByRepo[projectId]?.worktrees ?? []) {
    if (!hostId || worktreeBelongsToHost(worktree, hostId)) {
      ids.add(worktree.id)
    }
  }
  return [...ids]
}

// Why before the host call: its announcement can start a listing refresh that drops these tabs.
export function captureRemovalSnapshot(
  get: Parameters<StateCreator<AppState>>[1],
  projectId: string,
  ownerHostId: ExecutionHostId
): RemovedProjectSnapshot {
  const knownWorktreeIds = getKnownRepoWorktreeIds(get(), projectId, ownerHostId)
  // Why before the host call: its announcement can start a listing refresh that drops these tabs.
  const preCallTwins = collectRemovedHostTwins(get(), knownWorktreeIds, ownerHostId)
  const removedTwinEntityIds = new Set(
    preCallTwins.byHost.flatMap(({ removed }) => [
      ...removed.terminalTabIds,
      ...removed.conversationIds
    ])
  )
  const chatDraftKeys = chatDrafts.captureWorkspaceChatDraftKeys(
    get(),
    knownWorktreeIds.map((workspaceId) => ({
      workspaceId,
      executionHostId: ownerHostId,
      ...(preCallTwins.twinHostIds.has(workspaceId) ? { onlyEntityIds: removedTwinEntityIds } : {})
    }))
  )
  return { knownWorktreeIds, preCallTwins, chatDraftKeys }
}

type RemovedProjectSnapshot = {
  knownWorktreeIds: string[]
  preCallTwins: RemovedHostTwins
  chatDraftKeys: chatDrafts.WorkspaceChatDraftKeys
}

// Renderer-only teardown shared by desktop removal and removals the paired phone made on this host.
export async function retireRemovedProjectState(
  get: Parameters<StateCreator<AppState>>[1],
  set: Parameters<StateCreator<AppState>>[0],
  args: RemovedProjectSnapshot & {
    projectId: string
    ownerHostId: ExecutionHostId
    confirmedDiscards?: ConfirmedUnsavedDiscards
  }
): Promise<void> {
  const { projectId, ownerHostId, knownWorktreeIds, preCallTwins, chatDraftKeys } = args
  chatDrafts.deleteProjectChatDrafts(projectId, ownerHostId)
  get().clearOrcaHookTrustForRepo(projectId)
  const repoPath = get().repos.find((repo) =>
    repoMatchesHostIdentity(repo, projectId, ownerHostId)
  )?.path
  get().evictGitHubRepoCaches(projectId, repoPath, ownerHostId)
  const { clearRepoSlugCacheEntry } = await import('../../lib/workspace/catalog/repo-slug-index')
  clearRepoSlugCacheEntry(projectId)

  const worktreeIds = [
    ...new Set([...knownWorktreeIds, ...getKnownRepoWorktreeIds(get(), projectId, ownerHostId)])
  ]
  // Why rechecked: a concurrent removal of the other copy leaves no survivor to share with.
  const twins = collectRemovedHostTwins(get(), worktreeIds, ownerHostId)
  const exclusiveWorktreeIds = worktreeIds.filter((id) => !twins.twinHostIds.has(id))
  const localAgentContextProjectIds =
    ownerHostId === LOCAL_EXECUTION_HOST_ID
      ? [
          projectId,
          ...(get().worktreesByRepo[projectId] ?? [])
            .filter((worktree) => worktreeBelongsToHost(worktree, ownerHostId))
            .flatMap((worktree) => (worktree.projectId ? [worktree.projectId] : []))
        ]
      : []
  // Backstop for the host's sweep, which a spent budget or reloading graph can cut short.
  for (const wId of exclusiveWorktreeIds) {
    const tabs = get().tabsByWorktree[wId] ?? []
    for (const tab of tabs) {
      for (const ptyId of get().ptyIdsByTabId[tab.id] ?? []) {
        if (!isRemoteRuntimePtyId(ptyId)) {
          window.api.pty.kill(ptyId)
        }
      }
    }
  }

  // Canonical purge clears all worktree maps before set while tabs remain readable; manual deletion leaked state.
  const purgeTargets = worktreeIds.map((id) => ({ id, hostId: ownerHostId }))
  flushPurgedWorkspaceEdits(get(), purgeTargets)
  // Why before the twin close: it closes tabs one by one; the purge below shares this batch.
  const keepEditorBuffer = noticeRemovedUnsavedFiles(
    get(),
    worktreePurgeClosedFileIds(get(), purgeTargets),
    args.confirmedDiscards
  )
  closeRemovedHostTwinState(get, set, twins, preCallTwins, keepEditorBuffer)
  get().purgeWorktreeTerminalState(exclusiveWorktreeIds)
  chatDrafts.deleteWorkspaceChatDrafts(chatDraftKeys)
  get().clearLocalDetectedAgentContextsForProjects(localAgentContextProjectIds)

  set((s) => {
    const nextWorktrees = { ...s.worktreesByRepo }
    const remainingWorktrees = (nextWorktrees[projectId] ?? []).filter(
      (worktree) => !worktreeBelongsToHost(worktree, ownerHostId)
    )
    if (remainingWorktrees.length > 0) {
      nextWorktrees[projectId] = remainingWorktrees
    } else {
      delete nextWorktrees[projectId]
    }
    const nextDetectedWorktrees = { ...s.detectedWorktreesByRepo }
    const detected = nextDetectedWorktrees[projectId]
    if (detected) {
      const remainingDetected = detected.worktrees.filter(
        (worktree) => !worktreeBelongsToHost(worktree, ownerHostId)
      )
      if (remainingDetected.length > 0) {
        nextDetectedWorktrees[projectId] = { ...detected, worktrees: remainingDetected }
      } else {
        delete nextDetectedWorktrees[projectId]
      }
    }
    // Why no tab/layout/editor writes here: purgeWorktreeTerminalState above already dropped them.
    const worktreeIdSet = new Set(worktreeIds)
    const removedVisitKeys = new Set(
      worktreeIds.map((worktreeId) => getWorktreeVisitKey(worktreeId, ownerHostId))
    )
    const nextRepos = s.repos.filter((r) => !repoMatchesHostIdentity(r, projectId, ownerHostId))
    // Without sibling ownership, remove all timestamps including unhydrated SSH entries; otherwise keep cleanup host-scoped.
    const repoIdFullyRemoved = !nextRepos.some((r) => r.id === projectId)
    let nextLastVisitedAtByWorktreeId = s.lastVisitedAtByWorktreeId
    for (const id of Object.keys(s.lastVisitedAtByWorktreeId)) {
      const rawId = getWorktreeIdFromVisitKey(id)
      if (
        (ownerHostId && removedVisitKeys.has(id)) ||
        (!ownerHostId && worktreeIdSet.has(rawId)) ||
        (repoIdFullyRemoved && getRepoIdFromWorktreeId(rawId) === projectId)
      ) {
        if (nextLastVisitedAtByWorktreeId === s.lastVisitedAtByWorktreeId) {
          nextLastVisitedAtByWorktreeId = { ...s.lastVisitedAtByWorktreeId }
        }
        delete nextLastVisitedAtByWorktreeId[id]
      }
    }
    const survivingRepoIds = new Set(nextRepos.map((r) => r.id))
    const removedRepoIds = s.repos.filter((r) => !survivingRepoIds.has(r.id)).map((r) => r.id)
    return {
      repos: nextRepos,
      // Why: drop removed repos' sparse-preset maps so they don't outlive the repo for the whole session.
      ...omitSparsePresetsForRepos(s, removedRepoIds),
      ...mergeProjectCompatibilityForHostRepoChange({
        previous: { projects: s.projects, projectHostSetups: s.projectHostSetups },
        nextRepos,
        hostId: ownerHostId
      }),
      activeRepoId: s.activeRepoId === projectId ? null : s.activeRepoId,
      ...twinSelectionPatch(s, twins.twinHostIds, ownerHostId),
      filterRepoIds: s.filterRepoIds.filter((id) => id !== projectId),
      worktreesByRepo: nextWorktrees,
      detectedWorktreesByRepo: nextDetectedWorktrees,
      lastVisitedAtByWorktreeId: nextLastVisitedAtByWorktreeId,
      folderWorkspacePathStatuses: {},
      sortEpoch: s.sortEpoch + 1,
      // Why: removing the last repo must reset activeView + clear activeWorktreeId so App renders Landing, not an empty settings/terminal pane.
      ...(nextRepos.length === 0
        ? {
            activeView: 'terminal' as const,
            activeWorktreeId: null,
            activeWorkspaceKey: null,
            activeWorkspaceExecutionHostId: null,
            activeRepoId: null
          }
        : {})
    }
  })
}
