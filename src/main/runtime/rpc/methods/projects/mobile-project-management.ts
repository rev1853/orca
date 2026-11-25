import { isRepoOnCatalogHost } from '../../../../../shared/execution-host/execution-host'
import { isRepoHidden } from '../../../../../shared/project/catalog/hidden-projects'
import type { Repo } from '../../../../../shared/repository/repo-types'
import {
  MobileProjectCreateGroup,
  MobileProjectMove,
  MobileProjectRemove,
  MobileProjectUpdate
} from '../../../../../shared/rpc-contract/projects/mobile-project-params'
import { defineMethod, type RpcContext } from '../../core'

function requireLocalProject(runtime: RpcContext['runtime'], repoId: string): Repo {
  let found: Repo | undefined
  for (const repo of runtime.listVisibleRepos()) {
    if (repo.id !== repoId || !isRepoOnCatalogHost(repo)) {
      continue
    }
    if (found || !repo.path || isRepoHidden(repo)) {
      throw new Error('repo_not_found')
    }
    found = repo
  }
  if (!found) {
    throw new Error('repo_not_found')
  }
  return found
}

export const MOBILE_PROJECT_METHODS = [
  defineMethod({
    name: 'mobileProject.update',
    permission: 'workspace',
    params: MobileProjectUpdate,
    handler: async ({ repoId, updates }, { runtime }) => {
      requireLocalProject(runtime, repoId)
      await runtime.updateRepo({ selector: `id:${repoId}`, hostId: 'local' }, updates)
      return { repoId }
    }
  }),
  defineMethod({
    name: 'mobileProject.createGroup',
    permission: 'workspace',
    params: MobileProjectCreateGroup,
    handler: async ({ name }, { runtime }) => {
      const group = await runtime.createProjectGroup({ name })
      return { groupId: group.id }
    }
  }),
  defineMethod({
    name: 'mobileProject.move',
    permission: 'workspace',
    params: MobileProjectMove,
    handler: async ({ repoId, groupId }, { runtime }) => {
      await runtime.moveProjectToGroup(requireLocalProject(runtime, repoId), groupId)
      return { repoId, groupId }
    }
  }),
  defineMethod({
    name: 'mobileProject.remove',
    permission: 'workspace',
    params: MobileProjectRemove,
    handler: async ({ repoId, confirmedImpact }, { runtime }) => {
      const row = requireLocalProject(runtime, repoId)
      const impact = runtime.projectRemovalImpact(row)
      if (
        !confirmedImpact ||
        impact.liveTerminals > confirmedImpact.liveTerminals ||
        impact.workspacesWithMetadata > confirmedImpact.workspacesWithMetadata
      ) {
        return { impact }
      }
      return runtime.removeProject(row, 'mobile')
    }
  })
]
