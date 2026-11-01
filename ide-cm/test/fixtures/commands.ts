// FIXTURE (evidence grade: fixture). The command table over a connection to the fake product
// server and workspace host in ./host.ts. Tests close what it opened with `closeHarnesses()`.

import { WorkspaceConnection } from '../../src/host/connection'
import { buildCommands } from '../../src/host/commands'
import type { EmittedEvent } from '../../src/host/commands/context'
import { fakeServer, hello, memoryStorage, until, type Entry } from './host'

const open: WorkspaceConnection[] = []

export function closeHarnesses(): void {
  for (const connection of open.splice(0)) connection.live.close()
}

export async function harness(initial: Record<string, Entry | null> = {}, files: string[] = []) {
  const server = fakeServer(initial)
  const connection = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'demo', fetch: server.fetchImpl })
  open.push(connection)
  await connection.ready
  await until(() => server.lives.length === 1, 'the live stream')
  server.lives[0]!.push(hello('ep1:0'))
  const events: EmittedEvent[] = []
  const storage = memoryStorage()
  const context = { connection, emit: (event: EmittedEvent) => void events.push(event), storage }
  const commands = buildCommands(context, { files })
  const call = (name: string, args: Record<string, unknown> = {}) => {
    const handler = commands.table.get(name)
    if (!handler) throw new Error(`no command ${name}`)
    return Promise.resolve().then(() => handler(args))
  }
  return { server, connection, events, context, commands, call, storage }
}
