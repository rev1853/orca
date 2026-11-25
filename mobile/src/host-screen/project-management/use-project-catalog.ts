import { useCallback, useMemo } from 'react'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import { useHostQuery } from '../../query/host-query'
import {
  HOST_LIST_TARGET,
  hostRepoCatalogQuery,
  NO_HOST_LIST_INPUT
} from '../catalog/host-list-queries'
import {
  manageableProjects,
  type ManagedGroup,
  type ManagedProject
} from './project-management-model'
import { hostProjectGroupsQuery } from './project-management-operations'

export type ProjectCatalogRead =
  | { status: 'loading' }
  // A group list that failed to load is not an empty one: nothing is shown as ungrouped until it answers.
  | { status: 'failed'; error: unknown; retry: () => void }
  | { status: 'ready'; projects: ManagedProject[]; groups: ManagedGroup[] }

/** One paired computer's own projects and groups, read from that computer only. */
export function useProjectCatalog(args: {
  hostId: string
  client: RpcClient | null
  enabled: boolean
}): ProjectCatalogRead {
  const host = { hostId: args.hostId, client: args.client }
  const options = { enabled: args.enabled }
  const repos = useHostQuery(
    hostRepoCatalogQuery,
    host,
    HOST_LIST_TARGET,
    NO_HOST_LIST_INPUT,
    options
  )
  const groups = useHostQuery(
    hostProjectGroupsQuery,
    host,
    HOST_LIST_TARGET,
    NO_HOST_LIST_INPUT,
    options
  )
  const { refetch: refetchRepos } = repos
  const { refetch: refetchGroups } = groups
  const retry = useCallback(() => {
    void refetchRepos()
    void refetchGroups()
  }, [refetchRepos, refetchGroups])
  const projects = useMemo(
    () => (repos.data ? manageableProjects(repos.data.catalog) : null),
    [repos.data]
  )
  if (repos.isError || groups.isError) {
    return { status: 'failed', error: repos.error ?? groups.error, retry }
  }
  if (!projects || !groups.data) {
    return { status: 'loading' }
  }
  return { status: 'ready', projects, groups: groups.data }
}
