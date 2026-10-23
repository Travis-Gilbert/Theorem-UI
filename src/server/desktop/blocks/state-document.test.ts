import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LoroDoc } from 'loro-crdt/base64'
import { closeStateDocument, stateDocument } from './state-document'

const dirs: Array<string> = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function dataDir() {
  const dir = await mkdtemp(path.join(tmpdir(), 'theorem-state-'))
  dirs.push(dir)
  return dir
}

describe('the workspace state document', () => {
  test('merges updates from two views and passes each on', async () => {
    const dir = await dataDir()
    const document = await stateDocument('ws_merge', dir)
    const heard: Array<Uint8Array> = []
    document.subscribe((update) => heard.push(update))

    const first = new LoroDoc()
    first.import(document.snapshot())
    const second = new LoroDoc()
    second.import(document.snapshot())
    first.getMap('habits').set('2026-10-21', { read: true })
    first.commit()
    second.getMap('habits').set('2026-10-22', { read: false })
    second.commit()
    document.apply(first.export({ mode: 'update' }))
    document.apply(second.export({ mode: 'update' }))

    expect(heard).toHaveLength(2)
    expect(document.toJSON()).toEqual({
      habits: { '2026-10-21': { read: true }, '2026-10-22': { read: false } },
    })
    await closeStateDocument('ws_merge')
  })

  test('is saved in the data folder and read back when it opens again', async () => {
    const dir = await dataDir()
    const document = await stateDocument('ws_saved', dir)
    const view = new LoroDoc()
    view.getMap('counter').set('n', 3)
    view.commit()
    document.apply(view.export({ mode: 'update' }))
    await closeStateDocument('ws_saved')

    expect(await Bun.file(path.join(dir, 'state.loro')).exists()).toBe(true)
    const reopened = await stateDocument('ws_saved', dir)
    expect(reopened).not.toBe(document)
    expect(reopened.toJSON()).toEqual({ counter: { n: 3 } })
    await closeStateDocument('ws_saved')
  })
})
