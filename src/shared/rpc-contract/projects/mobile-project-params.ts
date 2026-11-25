import { z } from 'zod'
import { normalizeRepoBadgeColor } from '../../repository/appearance/repo-badge-color'
import { sanitizeRepoIcon } from '../../repository/appearance/repo-icon'

const id = z.string().min(1)
const name = z.string().trim().min(1)
const updates = z
  .strictObject({
    displayName: name.optional(),
    badgeColor: z
      .string()
      .transform((value, ctx) => {
        const color = normalizeRepoBadgeColor(value)
        if (color) {
          return color
        }
        ctx.addIssue({ code: 'custom', message: 'Invalid project badge color' })
        return z.NEVER
      })
      .optional(),
    repoIcon: z
      .unknown()
      .transform((value, ctx) => {
        const icon = sanitizeRepoIcon(value)
        if (icon !== undefined) {
          return icon
        }
        ctx.addIssue({ code: 'custom', message: 'Invalid project icon' })
        return z.NEVER
      })
      .optional()
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    'Empty project update'
  )

export const MobileProjectUpdate = z.strictObject({ repoId: id, updates })
export const MobileProjectCreateGroup = z.strictObject({ name })
export const MobileProjectMove = z.strictObject({ repoId: id, groupId: id.nullable() })
export const MobileProjectRemove = z.strictObject({
  repoId: id,
  confirmedImpact: z
    .strictObject({
      liveTerminals: z.number().int().nonnegative(),
      workspacesWithMetadata: z.number().int().nonnegative()
    })
    .optional()
})
