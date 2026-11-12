// SOURCING: bun:test; bun:sqlite runs the app's own DDL (local-schema.ts) behind the expo-sqlite subset the store uses
import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { SCHEMA } from '@/lib/local-schema'
import { deliver, type DeliverDeps, type SendAnswer } from './deliver'
import {
  describeStage,
  isPending,
  messageText,
  missingFromRecord,
  newDelivery,
  type Delivery,
  type IntakeItem,
  type Receiver,
} from './model'
import { createDeliveryStore, type DeliveryDatabase } from './store'

const receiver: Receiver = {
  kind: 'theorem-thread',
  projectId: 'p1',
  threadId: 't1',
  title: 'Fix the composer',
  projectTitle: 'Chats',
}
const photo = (id: string): IntakeItem => ({
  kind: 'file',
  id,
  source: 'camera',
  uri: `file:///intake/${id}.jpg`,
  name: `${id}.jpg`,
  mimeType: 'image/jpeg',
})
const fresh = (items: IntakeItem[], instruction = 'This is what happens when the keyboard opens.') =>
  newDelivery({ id: 'd1', nowMs: 1, receiver, instruction, items })

const stored = (uploadIds: string[]): SendAnswer => ({
  record: {
    messageId: 'm1',
    parts: [
      { type: 'text', payload: { text: 'x' } },
      ...uploadIds.map((uploadId) => ({ type: 'attachment', payload: { uploadId } })),
    ],
  },
  run: { runId: 'r1' },
})

class Refusal extends Error {}

function deps(overrides: Partial<DeliverDeps> = {}) {
  const log: string[] = []
  const stages: string[] = []
  let clock = 10
  const value: DeliverDeps = {
    now: () => clock++,
    save: async (delivery) => {
      stages.push(delivery.stage)
    },
    upload: async (_delivery, file, key) => {
      log.push(`upload:${key}`)
      return { uploadId: `up-${file.id}` }
    },
    send: async (delivery, text, uploadIds) => {
      log.push(`send:${delivery.id}:${uploadIds.join(',')}:${text}`)
      return stored(uploadIds)
    },
    findStored: async () => {
      log.push('find')
      return undefined
    },
    isRefusal: (error) => error instanceof Refusal,
    describe: (error) => (error as Error).message,
    ...overrides,
  }
  return { value, log, stages }
}

describe('a delivery', () => {
  test('uploads each file under a stable key, then sends once as its own command', async () => {
    const { value, log, stages } = deps()
    const done = await deliver(fresh([photo('a'), photo('b')]), value)
    expect(log).toEqual([
      'upload:d1:a',
      'upload:d1:b',
      'send:d1:up-a,up-b:This is what happens when the keyboard opens.',
    ])
    expect(stages).toEqual(['uploading', 'uploading', 'uploading', 'uploaded', 'sending', 'recorded'])
    expect(done.stage).toBe('recorded')
    expect(done.messageId).toBe('m1')
    expect(done.runId).toBe('r1')
  })

  test('is only called recorded when the stored message carries every file', async () => {
    const { value } = deps({ send: async () => stored(['up-a']) })
    const done = await deliver(fresh([photo('a'), photo('b')]), value)
    expect(done.stage).toBe('admitted')
    expect(missingFromRecord(done, stored(['up-a']).record).map((file) => file.id)).toEqual(['b'])
    expect(describeStage(done).tone).toBe('attention')
    // Nothing more the queue can do on its own, and it is never sent again.
    expect(isPending(done)).toBe(false)
    const again = deps()
    expect(await deliver(done, again.value)).toBe(done)
    expect(again.log).toEqual([])
  })

  test('a failed upload keeps what was stored and resumes with the same keys', async () => {
    let fail = true
    const { value, log } = deps({
      upload: async (_delivery, file, key) => {
        log.push(`upload:${key}`)
        if (file.id === 'b' && fail) throw new Error('The network connection was lost.')
        return { uploadId: `up-${file.id}` }
      },
    })
    const stopped = await deliver(fresh([photo('a'), photo('b')]), value)
    expect(stopped.stage).toBe('failed')
    expect(stopped.stoppedAt).toBe('uploading')
    expect(describeStage(stopped).detail).toContain('The network connection was lost.')
    expect(log.some((entry) => entry.startsWith('send'))).toBe(false)
    fail = false
    const done = await deliver(stopped, value)
    expect(done.stage).toBe('recorded')
    // File a is not uploaded twice; file b repeats under its first key.
    expect(log.filter((entry) => entry === 'upload:d1:a')).toHaveLength(1)
    expect(log.filter((entry) => entry === 'upload:d1:b')).toHaveLength(2)
  })

  test('a refusal settles the delivery and is not retried', async () => {
    const { value, log } = deps({
      upload: async () => {
        throw new Refusal('Theorem does not take this kind of file.')
      },
    })
    const refused = await deliver(fresh([photo('a')]), value)
    expect(refused.stage).toBe('refused')
    expect(isPending(refused)).toBe(false)
    expect(await deliver(refused, value)).toBe(refused)
    expect(log).toEqual([])
  })

  test('found in sending after a stop, it looks for its message before sending again', async () => {
    const interrupted: Delivery = {
      ...fresh([{ ...photo('a'), uploadId: 'up-a' } as IntakeItem]),
      stage: 'sending',
    }
    const there = deps({ findStored: async () => stored(['up-a']) })
    const found = await deliver(interrupted, there.value)
    expect(found.stage).toBe('recorded')
    expect(there.log).toEqual([])

    const absent = deps()
    const sent = await deliver(interrupted, absent.value)
    expect(sent.stage).toBe('recorded')
    expect(absent.log).toEqual(['find', 'send:d1:up-a:This is what happens when the keyboard opens.'])
  })

  test('a send nothing confirms is not called accepted', async () => {
    const { value } = deps({ send: async () => undefined })
    const done = await deliver(fresh([photo('a')]), value)
    expect(done.stage).toBe('failed')
    expect(done.stoppedAt).toBe('sending')
  })

  test('the message carries the instruction, links and quoted text; files are not described', () => {
    const delivery = fresh(
      [
        photo('a'),
        { kind: 'link', id: 'l', source: 'share', url: 'https://example.com/a', title: 'An article' },
        { kind: 'text', id: 't', source: 'share', text: 'first line\nsecond line' },
      ],
      'Compare this with yesterday.',
    )
    expect(messageText(delivery)).toBe(
      'Compare this with yesterday.\n\nAn article\nhttps://example.com/a\n\n> first line\n> second line',
    )
    expect(messageText(fresh([photo('a')], ''))).toBe('Shared from my phone.')
    expect(() => newDelivery({ id: 'x', nowMs: 1, receiver, instruction: ' ', items: [] })).toThrow()
  })

  test('a recorded delivery says what Theorem does not report', () => {
    const line = describeStage({ ...fresh([{ ...photo('a'), uploadId: 'u' } as IntakeItem]), stage: 'recorded' })
    expect(line.label).toBe('In the conversation')
    expect(line.detail).toContain('does not report whether the model read it')
  })
})

describe('delivery store', () => {
  function database(): DeliveryDatabase {
    const sqlite = new Database(':memory:')
    sqlite.exec(SCHEMA.replace('PRAGMA journal_mode = WAL;', ''))
    return {
      async getAllAsync<T>(sql: string, params: (string | number)[]) {
        return sqlite.query(sql).all(...params) as T[]
      },
      async runAsync(sql: string, params: (string | number)[]) {
        return sqlite.query(sql).run(...params)
      },
    }
  }

  test('keeps deliveries across a restart, newest first, and removes them', async () => {
    const db = database()
    const store = createDeliveryStore(db)
    await store.save({ ...fresh([photo('a')]), id: 'old', updatedAtMs: 1 })
    await store.save({ ...fresh([photo('b')]), id: 'new', updatedAtMs: 2 })
    await store.save({ ...fresh([photo('b')]), id: 'new', updatedAtMs: 3, stage: 'uploaded' })
    const reopened = await createDeliveryStore(db).all()
    expect(reopened.map((delivery) => [delivery.id, delivery.stage])).toEqual([
      ['new', 'uploaded'],
      ['old', 'queued'],
    ])
    await store.remove('new')
    expect((await store.all()).map((delivery) => delivery.id)).toEqual(['old'])
  })
})
