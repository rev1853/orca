import { runEnclosingWorktreeRemoval } from '@/store/workspaces/selection/active-worktree-deselection-intent'
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { repoMatchesHostIdentity } from './repo-host-identity'
import { removeRepoOnOwner } from './repo-owner-removal'
import { hasRuntimeRpcErrorCode } from '../../../../shared/remote-runtime/rpc/runtime-rpc-error-code'
import { ipcOrRuntimeTargetForHostId } from '../../runtime/rpc/targets/runtime-client-target'
// oxfmt-ignore
import { getRepoExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { destroyRecipeVmBeforeProjectRemoval } from './recipe-vm-project-removal'
import { stopRuntimeProjectTerminalsBeforeRemoval } from './runtime-project-terminal-stop'
import type { RepoSlice } from './repo-state'
import {
  isRuntimeHostUnreachableError,
  recordPendingRuntimeRepoRemoval
} from './pending-runtime-repo-removals'
import { toastProjectRemovalFailure } from './repo-removal-failure-toast'
import { replayPendingRuntimeRepoRemovalsIfReady } from './pending-runtime-repo-removal-replay'
import { isRuntimeEnvironmentRegistered } from './runtime-environment-registration'
import {
  captureRemovalSnapshot,
  getKnownRepoWorktreeIds,
  retireRemovedProjectState,
  type RepoWorktreeCatalog
} from './repo-removal-worktree-teardown'

/** Terminal tabs that removing this project's host row will close. */
export function countOpenRepoTerminalTabs(
  state: RepoWorktreeCatalog & {
    tabsByWorktree: Readonly<Record<string, readonly { id: string }[] | undefined>>
    ptyIdsByTabId: Readonly<Record<string, readonly string[] | undefined>>
  },
  projectId: string,
  hostId: string
): number {
  let count = 0
  for (const worktreeId of getKnownRepoWorktreeIds(state, projectId, hostId)) {
    for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
      if ((state.ptyIdsByTabId[tab.id]?.length ?? 0) > 0) {
        count += 1
      }
    }
  }
  return count
}

export function createRepoRemovalActions(
  set: Parameters<StateCreator<AppState>>[0],
  get: Parameters<StateCreator<AppState>>[1]
): Pick<RepoSlice, 'removeProject' | 'retireExternallyRemovedProject'> {
  const actions: Pick<RepoSlice, 'removeProject' | 'retireExternallyRemovedProject'> = {
    retireExternallyRemovedProject: async ({ repoId, hostId }) => {
      // Why: the owner already removed the row; no confirmedDiscards, so dirty editor buffers stay recoverable.
      await retireRemovedProjectState(get, set, {
        projectId: repoId,
        ownerHostId: hostId,
        ...captureRemovalSnapshot(get, repoId, hostId)
      })
    },
    removeProject: async (projectId, options) => {
      let hostUnreachable = false
      try {
        // Why: exact host match only; the unique-candidate/focused fallbacks could pick another host's row (#13071).
        const ownerRepo = get().repos.find((repo) =>
          repoMatchesHostIdentity(repo, projectId, options.hostId)
        )
        if (!ownerRepo) {
          return
        }
        const ownerHostId = getRepoExecutionHostId(ownerRepo)
        // Why only awaited for a VM: concurrent removals of one row must reach the host together.
        const vmDestroy = destroyRecipeVmBeforeProjectRemoval(
          get(),
          ownerRepo,
          ownerHostId,
          getKnownRepoWorktreeIds(get(), projectId, ownerHostId)
        )
        const vmServerDestroyed = vmDestroy !== false && (await vmDestroy)
        // Why: derive the target from the owner row's host so an SSH host removal never routes repo.rm to the focused runtime.
        const target = ipcOrRuntimeTargetForHostId(ownerHostId)
        if (!target) {
          throw new Error('The project host is unresolved. Refresh and retry.')
        }
        const { knownWorktreeIds, preCallTwins, chatDraftKeys } = captureRemovalSnapshot(
          get,
          projectId,
          ownerHostId
        )
        // Why: a stopped or forgotten server leaves rows nothing can reach; only this desktop's copy goes.
        // A local-only removal treats the unreachable server like a gone one; repo.rm replays on reconnect.
        const removeLocallyOnly = target.kind === 'environment' && options.localOnly === true
        const hostGone =
          target.kind === 'environment' &&
          !vmServerDestroyed &&
          (removeLocallyOnly || !(await isRuntimeEnvironmentRegistered(target.environmentId)))
        if (target.kind === 'environment' && !vmServerDestroyed && !hostGone) {
          await stopRuntimeProjectTerminalsBeforeRemoval(
            target.environmentId,
            projectId,
            // Why re-read: the registration await can let a listing refresh add worktrees.
            getKnownRepoWorktreeIds(get(), projectId, ownerHostId)
          )
        }
        try {
          // Why: destroying the VM took its server, and the catalog holding this row, with it.
          if (!vmServerDestroyed && !hostGone) {
            // Why: always host-scoped; this catalog may be stale and miss a same-id row on another host (#13071).
            await removeRepoOnOwner(target, projectId, ownerHostId)
          }
        } catch (err) {
          // Why: the owner already dropped this project, so purge the local ghost row instead of aborting (#11994).
          if (!hasRuntimeRpcErrorCode(err, 'repo_not_found')) {
            hostUnreachable = target.kind === 'environment' && isRuntimeHostUnreachableError(err)
            throw err
          }
        }
        if (removeLocallyOnly && !vmServerDestroyed) {
          // Before the purge: a catalog refresh it triggers must already be fenced.
          recordPendingRuntimeRepoRemoval(target.environmentId, projectId)
          replayPendingRuntimeRepoRemovalsIfReady(target.environmentId)
        }
        if (target.kind === 'environment') {
          // Explicit removal sweeps this desktop’s persisted host rows; startup never does (#17776). Paired web stores none and its bridge throws synchronously.
          try {
            await window.api.repos.removeForHost({ repoId: projectId, hostId: ownerHostId })
          } catch (error) {
            console.warn('[repos] failed to drop paired-host project residue', error)
          }
        }

        await retireRemovedProjectState(get, set, {
          projectId,
          ownerHostId,
          knownWorktreeIds,
          preCallTwins,
          chatDraftKeys,
          confirmedDiscards: options.confirmedDiscards
        })
      } catch (err) {
        console.error('Failed to remove repo:', err)
        // Why: bulk and background callers aggregate their own failures, so only opted-in single-project entry points toast (#11994).
        if (options.errorFeedback === 'toast') {
          toastProjectRemovalFailure(err, {
            hostUnreachable,
            removeLocally: () =>
              void get().removeProject(projectId, { ...options, localOnly: true })
          })
        }
      }
    }
  }
  return {
    removeProject: (projectId, options) =>
      runEnclosingWorktreeRemoval(
        options.automaticCleanup ? null : { hostId: options.hostId, repoId: projectId },
        () => actions.removeProject(projectId, options)
      ),
    retireExternallyRemovedProject: actions.retireExternallyRemovedProject
  }
}
