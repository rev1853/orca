// Project writes on the paired computer's own catalog. Each is a typed operation with a checked reply;
// a write whose reply was lost is never sent twice: it is re-read once the computer is back.
import * as z from 'zod'
import { normalizeRepoBadgeColor } from '../../../../src/shared/repository/appearance/repo-badge-color'
import { defineHostMutation } from '../../query/host-mutation'
import { defineHostQuery } from '../../query/host-query'
import { hostQueryKey } from '../../query/host-query-key'
import { bindDeferredRpcOperation, defineRpcOperation } from '../../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../../transport/rpc/rpc-operation-result-reader'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import { hostProjectGroupsRead } from '../../worktree/project-sections/project-sections-operations'
import {
  HOST_LIST_TARGET,
  hostRepoCatalogQuery,
  NO_HOST_LIST_INPUT
} from '../catalog/host-list-queries'
import { hostRepoCatalogSnapshotRead } from '../host-screen-operations'
import { hostProjectSectionsQuery } from '../catalog/use-host-project-sections'
import {
  manageableGroups,
  manageableProjects,
  type ManagedGroup,
  type ManagedProject
} from './project-management-model'
import { ProjectCreateRefusal, ProjectWriteUnconfirmed } from './project-write-errors'

export const PROJECT_MANAGEMENT_CAPABILITY = 'mobile.project-management.v1'

// ---- reads -------------------------------------------------------------------------------------

/** This computer's group list, read apart from the repo list so a failed read is never an empty one. */
export const hostProjectGroupsQuery = defineHostQuery<typeof NO_HOST_LIST_INPUT, ManagedGroup[]>({
  family: 'projectManagement.groups',
  fetch: async (client) => {
    const verdict = hostProjectGroupsRead.interpret(await hostProjectGroupsRead.request(client))
    if (!verdict.accepted) {
      throw new Error('projectGroup.list unavailable')
    }
    return manageableGroups(verdict.value)
  },
  staleTime: 60_000,
  gcTime: 30 * 60_000,
  signal: { events: ['reposChanged'] }
})

const catalogKeys = (hostId: string) => [
  hostQueryKey(hostId, hostRepoCatalogQuery.family, HOST_LIST_TARGET, NO_HOST_LIST_INPUT),
  hostQueryKey(hostId, hostProjectSectionsQuery.family, HOST_LIST_TARGET, NO_HOST_LIST_INPUT),
  hostQueryKey(hostId, hostProjectGroupsQuery.family, HOST_LIST_TARGET, NO_HOST_LIST_INPUT)
]
export { catalogKeys as projectCatalogQueryKeys }

/** The catalog straight from the computer, for settling a write whose reply was lost. */
async function readProjectsNow(client: RpcClient): Promise<ManagedProject[]> {
  const verdict = hostRepoCatalogSnapshotRead.interpret(
    await hostRepoCatalogSnapshotRead.request(client, { afterSnapshotId: null })
  )
  if (!verdict.accepted || verdict.value.kind !== 'catalog') {
    throw new ProjectWriteUnconfirmed()
  }
  return manageableProjects(verdict.value.repos)
}

const defaultParentRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'repo.mobile-default-create-parent',
    method: 'repo.defaultCreateParent',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant(
      'default-create-parent',
      z.looseObject({ parentPath: z.string() }).transform(({ parentPath }) => parentPath)
    )
  })
)

const gitAvailableRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'repo.mobile-git-available',
    method: 'repo.gitAvailable',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant(
      'git-available',
      z.looseObject({ available: z.boolean() }).transform(({ available }) => available)
    )
  })
)

/** Where New project starts: the computer's own default folder; empty when it names none. */
export async function readDefaultCreateParent(client: RpcClient): Promise<string> {
  try {
    return defaultParentRead.interpret(await defaultParentRead.request(client))
  } catch {
    return ''
  }
}

/** False only when the computer says Git is missing; an unanswered probe leaves New project open. */
export async function readGitAvailable(client: RpcClient): Promise<boolean> {
  try {
    return gitAvailableRead.interpret(await gitAvailableRead.request(client))
  } catch {
    return true
  }
}

// ---- writes ------------------------------------------------------------------------------------

const registeredProject = z
  .looseObject({ repo: z.looseObject({ id: z.string().min(1) }) })
  .transform(({ repo }) => ({ kind: 'created' as const, repoId: repo.id }))

const refusedCreate = z
  .looseObject({
    error: z.string(),
    errorCode: z.unknown().optional(),
    errorParams: z.unknown().optional(),
    errorDetail: z.unknown().optional()
  })
  .transform((failure) => ({ kind: 'refused' as const, failure }))

const repoCreateWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'repo.mobile-create',
    method: 'repo.create',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('project-created', z.union([registeredProject, refusedCreate]))
  })
)

const repoAddWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'repo.mobile-add',
    method: 'repo.add',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('project-registered', registeredProject)
  })
)

const projectUpdateWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'mobileProject.update',
    method: 'mobileProject.update',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('project-updated', z.looseObject({ repoId: z.string() }))
  })
)

const groupCreateWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'mobileProject.create-group',
    method: 'mobileProject.createGroup',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant(
      'project-group-created',
      z.looseObject({ groupId: z.string().min(1) }).transform(({ groupId }) => groupId)
    )
  })
)

const projectMoveWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'mobileProject.move',
    method: 'mobileProject.move',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('project-moved', z.looseObject({ repoId: z.string() }))
  })
)

const impactSchema = z.object({
  liveTerminals: z.number().int().nonnegative(),
  workspacesWithMetadata: z.number().int().nonnegative()
})
export type ProjectRemovalImpact = z.output<typeof impactSchema>

export type ProjectRemovalReply =
  | { kind: 'impact'; impact: ProjectRemovalImpact }
  | { kind: 'removed' }

const projectRemoveWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'mobileProject.remove',
    method: 'mobileProject.remove',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant(
      'project-removal',
      z.union([
        z
          .looseObject({ impact: impactSchema })
          .transform(({ impact }): ProjectRemovalReply => ({ kind: 'impact', impact })),
        z
          .looseObject({ removed: z.literal(true) })
          .transform((): ProjectRemovalReply => ({ kind: 'removed' }))
      ])
    )
  })
)

/** Counts what removing would stop and forget. Changes nothing. */
export async function previewProjectRemoval(
  client: RpcClient,
  repoId: string
): Promise<ProjectRemovalImpact> {
  const reply = projectRemoveWrite.interpret(await projectRemoveWrite.request(client, { repoId }))
  if (reply.kind !== 'impact') {
    throw new ProjectWriteUnconfirmed()
  }
  return reply.impact
}

export type ProjectIcon = { type: 'emoji'; emoji: string } | { type: 'letters'; text: string }

export type ProjectUpdateVars = {
  repoId: string
  updates: { displayName?: string; badgeColor?: string; repoIcon?: ProjectIcon | null }
}

function iconMatches(
  wanted: ProjectIcon | null | undefined,
  held: ManagedProject['icon']
): boolean {
  if (wanted === undefined) {
    return true
  }
  if (wanted === null || held === null) {
    return wanted === held
  }
  return wanted.type === 'emoji'
    ? held.type === 'emoji' && held.emoji === wanted.emoji
    : held.type === 'letters' && held.text === wanted.text
}

// Create and open can't be told apart from a stranger's write by what they leave, so they are never re-sent.
const neverReplay = async (): Promise<never> => {
  throw new ProjectWriteUnconfirmed()
}

export const projectCreate = defineHostMutation({
  offline: 'block',
  send: async (client, vars: { parentPath: string; name: string }) => {
    // Git, as desktop's New project sends: it initializes the repository and makes the first commit.
    const reply = repoCreateWrite.interpret(
      await repoCreateWrite.request(client, { ...vars, kind: 'git' })
    )
    if (reply.kind === 'refused') {
      throw new ProjectCreateRefusal(reply.failure)
    }
    return reply.repoId
  },
  confirm: neverReplay,
  invalidates: catalogKeys
})

export const projectOpen = defineHostMutation({
  offline: 'block',
  send: async (client, vars: { path: string; kind: 'git' | 'folder' }) =>
    repoAddWrite.interpret(await repoAddWrite.request(client, vars)).repoId,
  confirm: neverReplay,
  invalidates: catalogKeys
})

export const groupCreate = defineHostMutation({
  offline: 'block',
  send: async (client, vars: { name: string }) =>
    groupCreateWrite.interpret(await groupCreateWrite.request(client, vars)),
  confirm: neverReplay,
  invalidates: catalogKeys
})

export const projectUpdate = defineHostMutation({
  offline: 'block',
  send: async (client, vars: ProjectUpdateVars) => {
    projectUpdateWrite.interpret(await projectUpdateWrite.request(client, vars))
    return vars.repoId
  },
  // Settled by what the computer holds now, never by sending the edit again.
  confirm: async (client, vars) => {
    const held = (await readProjectsNow(client)).find((project) => project.id === vars.repoId)
    const { displayName, badgeColor, repoIcon } = vars.updates
    if (
      !held ||
      (displayName !== undefined && held.name !== displayName.trim()) ||
      (badgeColor !== undefined &&
        normalizeRepoBadgeColor(held.badgeColor) !== normalizeRepoBadgeColor(badgeColor)) ||
      !iconMatches(repoIcon, held.icon)
    ) {
      throw new ProjectWriteUnconfirmed()
    }
    return vars.repoId
  },
  invalidates: catalogKeys
})

export const projectMove = defineHostMutation({
  offline: 'block',
  send: async (client, vars: { repoId: string; groupId: string | null }) => {
    projectMoveWrite.interpret(await projectMoveWrite.request(client, vars))
    return vars.repoId
  },
  confirm: async (client, vars) => {
    const held = (await readProjectsNow(client)).find((project) => project.id === vars.repoId)
    const there =
      held?.membership.kind === 'group'
        ? held.membership.groupId
        : held?.membership.kind === 'none'
          ? null
          : undefined
    if (there !== vars.groupId) {
      throw new ProjectWriteUnconfirmed()
    }
    return vars.repoId
  },
  invalidates: catalogKeys
})

export type ProjectRemoveVars = { repoId: string; confirmedImpact: ProjectRemovalImpact }

export const projectRemove = defineHostMutation({
  offline: 'block',
  send: async (client, vars: ProjectRemoveVars): Promise<ProjectRemovalReply> =>
    projectRemoveWrite.interpret(await projectRemoveWrite.request(client, vars)),
  // Gone is the only proof of removal: a row still listed was not removed.
  confirm: async (client, vars): Promise<ProjectRemovalReply> => {
    if ((await readProjectsNow(client)).some((project) => project.id === vars.repoId)) {
      throw new ProjectWriteUnconfirmed()
    }
    return { kind: 'removed' }
  },
  invalidates: catalogKeys
})
