// Folders on a paired computer, read through its own filesystem: `~` is its home, and every path is its own.
import * as z from 'zod'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../transport/rpc/rpc-operation-result-reader'

const hostDirectorySchema = z.looseObject({
  resolvedPath: z.string(),
  entries: z.array(z.looseObject({ name: z.string(), isDirectory: z.boolean() })),
  pathFlavor: z.enum(['posix', 'win32'])
})

export type HostDirectory = z.output<typeof hostDirectorySchema>

const hostDirectoryRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'files.browse-server-dir',
    method: 'files.browseServerDir',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('host-directory', hostDirectorySchema)
  })
)

/** A folder on the computer: `~` is its home there; `/` lists the drives of a Windows one. */
export async function readHostDirectory(client: RpcClient, path: string): Promise<HostDirectory> {
  return hostDirectoryRead.interpret(await hostDirectoryRead.request(client, { path }))
}

const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:[\\/]?$/

/** The drive list names each drive by its root, which is already the whole path. */
export function hostDirectoryChildPath(directory: HostDirectory, name: string): string {
  if (directory.pathFlavor === 'win32' && directory.resolvedPath === '/') {
    return name
  }
  const separator = directory.pathFlavor === 'win32' ? '\\' : '/'
  return directory.resolvedPath.endsWith(separator)
    ? `${directory.resolvedPath}${name}`
    : `${directory.resolvedPath}${separator}${name}`
}

/** Where "up" goes: null at the top, which is `/` on posix and the drive list on Windows. */
export function hostDirectoryParentPath(directory: HostDirectory): string | null {
  const path = directory.resolvedPath
  if (directory.pathFlavor === 'win32') {
    if (path === '/') {
      return null
    }
    if (WINDOWS_DRIVE_ROOT.test(path)) {
      return '/'
    }
    const parent = path.replace(/[\\/]+[^\\/]+[\\/]*$/, '')
    return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent || '/'
  }
  if (path === '/') {
    return null
  }
  const cut = path.replace(/\/+$/, '').lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}

/** "/Users/k/Downloads/sage-export" as "~/Downloads/sage-export". */
export function homeRelativePath(path: string, home: string | null): string {
  return home && path.startsWith(home) && path !== home ? `~${path.slice(home.length)}` : path
}
