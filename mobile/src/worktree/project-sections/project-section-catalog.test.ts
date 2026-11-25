import { expect, it } from 'vitest'
import { getProjectGroupHeaderKey } from '../../../../src/shared/sidebar-list/sections/group-keys'
import { INITIAL_MOBILE_VIEW } from '../workspace-list/workspace-view-settings'
import { buildSections } from '../workspace-list/workspace-list-sections'
import { buildProjectSectionCatalog } from './project-section-catalog'

it('nests a newly registered project using the host lists before a sidebar snapshot arrives', () => {
  const group = {
    id: 'group-1',
    name: 'Mobile projects',
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual' as const,
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0
  }
  const catalog = buildProjectSectionCatalog(
    null,
    [
      { id: 'moved', displayName: 'Moved project', path: '/moved', projectGroupId: group.id },
      { id: 'root', displayName: 'Root project', path: '/root' }
    ],
    [group],
    null,
    null
  )
  const sections = (collapsed = new Set<string>()) =>
    buildSections(
      [],
      'recent',
      INITIAL_MOBILE_VIEW.filters,
      '',
      'repo',
      new Set(),
      catalog,
      undefined,
      collapsed
    )

  const open = sections()
  const index = open.findIndex((section) => section.isProjectGroup)
  expect(open[index]).toMatchObject({ title: 'Mobile projects', count: 1 })
  expect(open[index + 1]).toMatchObject({ title: 'Moved project', projectGroupDepth: 1 })
  const collapsedTitles = sections(new Set([getProjectGroupHeaderKey(group.id)])).map(
    (section) => section.title
  )
  expect(collapsedTitles).not.toContain('Moved project')
  expect(collapsedTitles).toContain('Root project')
})
