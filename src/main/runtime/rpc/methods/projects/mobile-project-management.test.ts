import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isRepoOnCatalogHost,
  toRuntimeExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import type { Repo } from '../../../../../shared/repository/repo-types'
import { Store } from '../../../../persistence/loading-store/store'
import {
  closeTestStores,
  createSqliteTestStore
} from '../../../../persistence/persistence-test-harness'
import { OrcaRuntimeService } from '../../../orca-runtime'
import { RpcDispatcher } from '../../dispatcher'
import { REPO_METHODS } from './repo'
import { z } from 'zod'
import { hostWorktreeTarget } from '../../../../../shared/worktree/host-qualified-identity'

// The id a create reply carries: a project's, or a new group's.
const createdReply = z.object({
  ok: z.literal(true),
  result: z.union([
    z.object({ repo: z.object({ id: z.string() }) }).transform(({ repo }) => repo.id),
    z.object({ groupId: z.string() }).transform(({ groupId }) => groupId)
  ])
})
const createdId = (response: unknown): string => createdReply.parse(response).result

let root: string
vi.mock('../../../../orca-profiles/profile-storage-paths', () => ({
  getProfileUserDataPath: () => root
}))

const FOREIGN_HOST = toRuntimeExecutionHostId('env-other')
let store: Store
let runtime: OrcaRuntimeService
let sentinelDir: string
let localPath: string
let foreignPath: string

const row = (overrides: Partial<Repo>): Repo => ({
  id: 'shared-id',
  path: localPath,
  displayName: 'Local',
  badgeColor: '#737373',
  addedAt: 1,
  kind: 'folder',
  ...overrides
})
const localRows = () => store.getRepos().filter((repo) => isRepoOnCatalogHost(repo))
const foreignRows = () => store.getRepos().filter((repo) => repo.executionHostId === FOREIGN_HOST)

// The phone's own scope: the caller the host stamps for a paired device, not the owner.
async function call(method: string, params?: unknown) {
  const callerScope = { kind: 'mobile' } as const
  return new RpcDispatcher({ runtime, methods: REPO_METHODS, callerScope }).dispatch(
    { id: 'req', authToken: 'tok', method, params },
    { clientKind: 'mobile', callerScope }
  )
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-mobile-projects-'))
  sentinelDir = join(root, 'plain-sentinel')
  localPath = join(root, 'local-checkout')
  foreignPath = join(root, 'foreign-checkout')
  await Promise.all([mkdir(sentinelDir), mkdir(localPath), mkdir(foreignPath)])
  await writeFile(join(sentinelDir, 'keep.txt'), 'keep')
  store = createSqliteTestStore(Store, { dataFile: join(root, 'db', 'data.json') })
  runtime = new OrcaRuntimeService(store)
})

afterEach(async () => {
  await closeTestStores()
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
})

describe('mobile project management is scoped to this computer', () => {
  it('opening a folder never adopts another host’s row at the same path', async () => {
    store.addRepo(row({ id: 'foreign-path-id', path: sentinelDir, executionHostId: FOREIGN_HOST }))

    const first = await call('repo.add', { path: sentinelDir, kind: 'folder' })
    const second = await call('repo.add', { path: sentinelDir, kind: 'folder' })

    expect(first).toMatchObject({ ok: true })
    const added = createdId(first)
    expect(added).not.toBe('foreign-path-id')
    expect(createdId(second)).toBe(added)
    expect(localRows().filter((repo) => repo.path === sentinelDir)).toHaveLength(1)
    expect(foreignRows().map((repo) => repo.id)).toEqual(['foreign-path-id'])
    // Plain folder import adds no Git and leaves the files where they were.
    expect(await readdir(sentinelDir)).toEqual(['keep.txt'])
  })

  it('creating a project never adopts a foreign row at the target and never overwrites files', async () => {
    store.addRepo(
      row({
        id: 'foreign-target',
        path: join(root, 'parent', 'taken'),
        executionHostId: FOREIGN_HOST
      })
    )
    await mkdir(join(root, 'parent', 'full'), { recursive: true })
    await writeFile(join(root, 'parent', 'full', 'keep.txt'), 'keep')

    const created = await call('repo.create', {
      parentPath: join(root, 'parent'),
      name: 'taken',
      kind: 'folder'
    })
    const refused = await call('repo.create', {
      parentPath: join(root, 'parent'),
      name: 'full',
      kind: 'folder'
    })

    const id = createdId(created)
    expect(id).not.toBe('foreign-target')
    expect(localRows().map((repo) => repo.id)).toEqual([id])
    // A refusal arrives as data inside a successful reply, with a code a phone can word.
    expect(refused).toMatchObject({ ok: true, result: { errorCode: 'targetNotEmpty' } })
    expect(await readdir(join(root, 'parent', 'full'))).toEqual(['keep.txt'])
  })

  it('edits only this computer’s row and rejects patches that change nothing or break rules', async () => {
    store.addRepo(row({}))
    store.addRepo(row({ path: foreignPath, displayName: 'Foreign', executionHostId: FOREIGN_HOST }))

    expect(
      await call('mobileProject.update', {
        repoId: 'shared-id',
        updates: { displayName: ' Alpha ' }
      })
    ).toMatchObject({ ok: true, result: { repoId: 'shared-id' } })

    expect(localRows()[0]?.displayName).toBe('Alpha')
    expect(foreignRows()[0]?.displayName).toBe('Foreign')
    for (const updates of [{}, { displayName: '  ' }, { badgeColor: 'red' }, { path: '/x' }]) {
      expect(await call('mobileProject.update', { repoId: 'shared-id', updates })).toMatchObject({
        ok: false
      })
    }
    expect(localRows()[0]?.displayName).toBe('Alpha')
  })

  it('refuses to edit or remove a row only another host holds', async () => {
    store.addRepo(row({ id: 'foreign-only', path: foreignPath, executionHostId: FOREIGN_HOST }))

    for (const [method, params] of [
      ['mobileProject.update', { repoId: 'foreign-only', updates: { displayName: 'Hijacked' } }],
      ['mobileProject.move', { repoId: 'foreign-only', groupId: null }],
      [
        'mobileProject.remove',
        { repoId: 'foreign-only', confirmedImpact: { liveTerminals: 0, workspacesWithMetadata: 0 } }
      ]
    ] as const) {
      expect(await call(method, params)).toMatchObject({ ok: false })
    }
    expect(foreignRows()).toMatchObject([{ id: 'foreign-only', displayName: 'Local' }])
  })

  it('moves only this computer’s row, and a vanished or foreign group changes nothing', async () => {
    store.addRepo(row({}))
    store.addRepo(row({ path: foreignPath, executionHostId: FOREIGN_HOST }))
    const created = await call('mobileProject.createGroup', { name: ' Mobile team ' })
    const groupId = createdId(created)
    const foreignGroup = store.createProjectGroup({
      name: 'Elsewhere',
      parentPath: null,
      connectionId: 'ssh-target',
      parentGroupId: null,
      createdFrom: 'manual'
    })

    expect(await call('mobileProject.move', { repoId: 'shared-id', groupId })).toMatchObject({
      ok: true
    })
    expect(localRows()[0]?.projectGroupId).toBe(groupId)
    expect(foreignRows()[0]?.projectGroupId ?? null).toBeNull()

    for (const target of ['deleted-group', foreignGroup.id]) {
      expect(
        await call('mobileProject.move', { repoId: 'shared-id', groupId: target })
      ).toMatchObject({ ok: false })
      expect(localRows()[0]?.projectGroupId).toBe(groupId)
    }
    expect(await call('mobileProject.createGroup', { name: '   ' })).toMatchObject({ ok: false })

    await call('mobileProject.move', { repoId: 'shared-id', groupId: null })
    expect(localRows()[0]?.projectGroupId ?? null).toBeNull()
  })

  it('removal previews first, needs fresh consent for new work, and leaves files and other hosts alone', async () => {
    store.addRepo(row({ path: sentinelDir }))
    store.addRepo(row({ path: foreignPath, executionHostId: FOREIGN_HOST }))
    store.setWorktreeMeta(
      hostWorktreeTarget({ id: `shared-id::${sentinelDir}`, hostId: 'local' }),
      {
        comment: 'mine'
      }
    )
    store.setWorktreeMeta(
      hostWorktreeTarget({ id: `shared-id::${foreignPath}`, hostId: FOREIGN_HOST }),
      { comment: 'theirs' }
    )

    const preview = await call('mobileProject.remove', { repoId: 'shared-id' })
    expect(preview).toMatchObject({
      ok: true,
      result: { impact: { liveTerminals: 0, workspacesWithMetadata: 1 } }
    })
    // A confirmation that saw less than what is there now is a new preview, not a removal.
    const stale = await call('mobileProject.remove', {
      repoId: 'shared-id',
      confirmedImpact: { liveTerminals: 0, workspacesWithMetadata: 0 }
    })
    expect(stale).toMatchObject({ ok: true, result: { impact: { workspacesWithMetadata: 1 } } })
    expect(localRows()).toHaveLength(1)

    const removed = await call('mobileProject.remove', {
      repoId: 'shared-id',
      confirmedImpact: { liveTerminals: 0, workspacesWithMetadata: 1 }
    })

    expect(removed).toMatchObject({ ok: true, result: { removed: true } })
    expect(localRows()).toHaveLength(0)
    expect(foreignRows()).toHaveLength(1)
    expect(
      store.getAllWorktreeMetaForHost(FOREIGN_HOST)[`shared-id::${foreignPath}`]
    ).toMatchObject({
      comment: 'theirs'
    })
    await expect(access(join(sentinelDir, 'keep.txt'))).resolves.toBeUndefined()
  })
})
