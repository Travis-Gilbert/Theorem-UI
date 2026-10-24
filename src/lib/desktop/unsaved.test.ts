// SOURCING: bun:test over reportUnsaved, with a stand-in host that records
// the edited mark and delivers host events.
import { afterEach, describe, expect, test } from 'bun:test'
import { useUnsavedFiles } from '@/lib/handlers/file-sync'
import { onLeavePage, useNoteStatus } from '@/lib/theorem/notes'
import type { HostEvent } from './bindings/HostEvent'
import type { DesktopHost } from './host'
import { reportUnsaved } from './unsaved'

function standInHost() {
  const marks: boolean[] = []
  let deliver: (event: HostEvent) => void = () => undefined
  const host = {
    setDocumentEdited: async (edited: boolean) => void marks.push(edited),
    onEvent: (listener: (event: HostEvent) => void) => {
      deliver = listener
      return () => undefined
    },
  } as Partial<DesktopHost> as DesktopHost
  return { host, marks, deliver: (event: HostEvent) => deliver(event) }
}

describe('reportUnsaved', () => {
  let stop = () => {}
  afterEach(() => {
    stop()
    useNoteStatus.setState({ status: {} })
    useUnsavedFiles.setState({ unsaved: false })
  })

  test('marks the window while a note is not saved', () => {
    const { host, marks } = standInHost()
    stop = reportUnsaved(host)
    const { set } = useNoteStatus.getState()
    set('a', 'pending')
    set('a', 'saving')
    set('a', 'saved')
    set('b', 'conflict')
    expect(marks).toEqual([false, true, false, true])
  })

  test('marks the window while a file has a draft', () => {
    const { host, marks } = standInHost()
    stop = reportUnsaved(host)
    useUnsavedFiles.setState({ unsaved: true })
    useUnsavedFiles.setState({ unsaved: false })
    expect(marks).toEqual([false, true, false])
  })

  test('answers a quit with nothing to save at once', () => {
    const { host, marks, deliver } = standInHost()
    stop = reportUnsaved(host)
    deliver({ type: 'leaving' })
    expect(marks).toEqual([false, false])
  })

  test('a quit collects text an open editor has not reported', () => {
    const { host, marks, deliver } = standInHost()
    stop = reportUnsaved(host)
    const remove = onLeavePage(() => useNoteStatus.getState().set('a', 'pending'))
    deliver({ type: 'leaving' })
    remove()
    expect(marks).toEqual([false, true])
  })

  test('keeps the mark on through a quit until the note is saved', () => {
    const { host, marks, deliver } = standInHost()
    stop = reportUnsaved(host)
    useNoteStatus.getState().set('a', 'pending')
    deliver({ type: 'leaving' })
    expect(marks).toEqual([false, true])
    useNoteStatus.getState().set('a', 'saved')
    expect(marks).toEqual([false, true, false])
  })
})
