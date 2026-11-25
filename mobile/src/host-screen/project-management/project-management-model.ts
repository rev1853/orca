// What the manager shows of the paired computer's catalog: only this computer's own checkouts, never a
// projection built for display, and never a guess where the computer sent something this build can't read.
import { isRepoOnCatalogHost } from '../../../../src/shared/execution-host/execution-host'
import type { ProjectGroup } from '../../../../src/shared/project/groups/project-group-types'
import type { HostRepoCatalogRow, MobileHostRepoIcon } from '../host-screen-reply-schema'

export type ProjectMembership =
  | { kind: 'none' }
  | { kind: 'group'; groupId: string }
  // The row's group field is not a string or null: it is neither grouped nor ungrouped.
  | { kind: 'unknown' }

export type ManagedProject = {
  id: string
  name: string
  path: string
  badgeColor: string | null
  icon: MobileHostRepoIcon | null
  isFolder: boolean
  membership: ProjectMembership
}

export type ManagedGroup = {
  id: string
  name: string
  /** "Parent › Child", so two groups of one name stay apart. */
  ancestry: string
}

function readMembership(row: HostRepoCatalogRow): ProjectMembership {
  const raw = row.projectGroupId
  if (raw === undefined || raw === null) {
    return { kind: 'none' }
  }
  return typeof raw === 'string' && raw !== ''
    ? { kind: 'group', groupId: raw }
    : { kind: 'unknown' }
}

/** The rows this computer owns and shows: SSH, remote-server and hidden rows are someone else's to edit. */
export function manageableProjects(rows: readonly HostRepoCatalogRow[]): ManagedProject[] {
  return rows.flatMap((row) => {
    if (
      !isRepoOnCatalogHost(row) ||
      typeof row.hiddenAt === 'number' ||
      typeof row.path !== 'string' ||
      row.path === ''
    ) {
      return []
    }
    return [
      {
        id: row.id,
        name: row.displayName,
        path: row.path,
        badgeColor: row.badgeColor ?? null,
        icon: row.repoIcon ?? null,
        isFolder: row.kind === 'folder',
        membership: readMembership(row)
      }
    ]
  })
}

export function manageableGroups(
  groups: readonly Pick<
    ProjectGroup,
    'id' | 'name' | 'parentGroupId' | 'connectionId' | 'executionHostId'
  >[]
): ManagedGroup[] {
  const local = groups.filter((group) => isRepoOnCatalogHost(group))
  const byId = new Map(local.map((group) => [group.id, group]))
  return local.map((group) => {
    const names = [group.name]
    const seen = new Set([group.id])
    for (
      let parent = group.parentGroupId ? byId.get(group.parentGroupId) : undefined;
      parent && !seen.has(parent.id);
      parent = parent.parentGroupId ? byId.get(parent.parentGroupId) : undefined
    ) {
      seen.add(parent.id)
      names.unshift(parent.name)
    }
    return { id: group.id, name: group.name, ancestry: names.join(' › ') }
  })
}
