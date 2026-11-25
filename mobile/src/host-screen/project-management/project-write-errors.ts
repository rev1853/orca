// What a refused or unproven project write is called, and the sentence a person gets for it.
import {
  REPO_CREATE_FAILURE_COPY as EN,
  type RepoCreateFailureCode
} from '../../../../src/shared/repository/creation/repo-create-failure-copy'
import type { Translate } from '../../i18n/mobile-i18n'
import { isLogicalClientCutoverError } from '../../transport/connection/logical-client-cutover-error'
import { isMobileMethodUnavailableError } from '../../transport/rpc/mobile-method-unavailable'
import { isRpcDeliveryUnknown } from '../../transport/rpc/rpc-delivery-ambiguity'
import { RpcRefusedError } from '../../transport/rpc/rpc-refused-error'

/** The write's outcome could not be proven: the screen sends the person to the refreshed list. */
export class ProjectWriteUnconfirmed extends Error {
  constructor() {
    super('The project list must be checked before trying again')
  }
}

export type CreateRefusalFailure = {
  error: string
  errorCode?: unknown
  errorParams?: unknown
  errorDetail?: unknown
}

/** A refusal the computer put inside a successful reply (create does this). */
export class ProjectCreateRefusal extends Error {
  constructor(readonly failure: CreateRefusalFailure) {
    super(failure.error)
  }
}

function isCreateFailureCode(code: string): code is RepoCreateFailureCode {
  return Object.hasOwn(EN, code)
}

function createRefusalText(failure: CreateRefusalFailure, t: Translate): string {
  const code = failure.errorCode
  if (typeof code !== 'string' || !isCreateFailureCode(code)) {
    return failure.error
  }
  const params = failure.errorParams
  const name =
    typeof params === 'object' && params !== null && 'name' in params ? String(params.name) : null
  const detail = typeof failure.errorDetail === 'string' ? failure.errorDetail : null
  const english = EN[code]
  // A slot the computer left unfilled would print blank: its own English line is better.
  if (
    (english.includes('{{name}}') && name === null) ||
    (english.includes('{{detail}}') && detail === null)
  ) {
    return failure.error
  }
  const v = { name: name ?? '', detail: detail ?? '' }
  const copy: Record<RepoCreateFailureCode, string> = {
    nameEmpty: t('projectManager.createErrors.nameEmpty', 'Name cannot be empty'),
    nameInvalid: t(
      'projectManager.createErrors.nameInvalid',
      'Name cannot contain slashes or be "." / ".."'
    ),
    parentRequired: t('projectManager.createErrors.parentRequired', 'Parent directory is required'),
    parentNotAbsolute: t(
      'projectManager.createErrors.parentNotAbsolute',
      'Parent directory must be an absolute path'
    ),
    targetInaccessible: t(
      'projectManager.createErrors.targetInaccessible',
      'Cannot access target path: {{detail}}',
      v
    ),
    targetNotEmpty: t(
      'projectManager.createErrors.targetNotEmpty',
      '"{{name}}" already exists at this location and is not empty.',
      v
    ),
    targetNotFolder: t(
      'projectManager.createErrors.targetNotFolder',
      '"{{name}}" already exists at this location and is not a folder.',
      v
    ),
    readDirectoryFailed: t(
      'projectManager.createErrors.readDirectoryFailed',
      'Failed to read directory: {{detail}}',
      v
    ),
    createDirectoryFailed: t(
      'projectManager.createErrors.createDirectoryFailed',
      'Failed to create directory: {{detail}}',
      v
    ),
    prepareDirectoryFailed: t(
      'projectManager.createErrors.prepareDirectoryFailed',
      'Failed to prepare directory: {{detail}}',
      v
    ),
    gitIdentityMissing: t(
      'projectManager.createErrors.gitIdentityMissing',
      'Git author identity is not configured. Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then try again.'
    ),
    gitInitFailed: t(
      'projectManager.createErrors.gitInitFailed',
      'Failed to initialize git repository: {{detail}}',
      v
    ),
    initialCommitFailed: t(
      'projectManager.createErrors.initialCommitFailed',
      'Failed to create initial commit: {{detail}}',
      v
    )
  }
  return copy[code]
}

/** One sentence a person can act on, from whatever a project write threw. */
export function describeProjectWriteError(error: unknown, t: Translate): string {
  if (error instanceof ProjectCreateRefusal) {
    return createRefusalText(error.failure, t)
  }
  if (
    error instanceof ProjectWriteUnconfirmed ||
    isRpcDeliveryUnknown(error) ||
    isLogicalClientCutoverError(error)
  ) {
    return t('projectManager.errors.unconfirmed', 'Check the project list before trying again')
  }
  const code = error instanceof RpcRefusedError ? error.code : undefined
  const message = error instanceof Error ? error.message : ''
  if (isMobileMethodUnavailableError(code, message)) {
    return t(
      'projectManager.errors.updateComputer',
      'Update Orca on this computer to manage projects'
    )
  }
  if (message.includes('repo_not_found') || message.includes('project_group_not_found')) {
    return t(
      'projectManager.errors.gone',
      'That project or group is no longer on this computer. The list has been refreshed.'
    )
  }
  if (message.includes('Not a valid git repository')) {
    return t(
      'projectManager.errors.notGit',
      'This folder is not a Git repository. Choose Plain folder to open it as it is.'
    )
  }
  return message || t('projectManager.errors.generic', 'Something went wrong. Try again.')
}
