// SOURCING: zustand (the host's store) and OpenIDEA's status bar contribution point. Shows the
// authority state of the active document next to what the editor holds locally, so a user, and
// an evidence capture, can tell an unaccepted edit from an accepted one.

import { useEditorRegistry } from '@/editor/api'
import { useHostState } from '../store'
import styles from './SessionStatus.module.css'

export function SessionStatus() {
  const path = useEditorRegistry((s) => s.active?.ctx.path)
  const live = useHostState((s) => s.live)
  const cursor = useHostState((s) => s.cursor)
  const resyncs = useHostState((s) => s.resyncs)
  const doc = useHostState((s) => (path ? s.docs[path] : undefined))
  return (
    <span className={styles.status} data-testid="session-status" data-live={live}>
      {doc ? (
        <>
          <span data-testid="session-revision">r{doc.revision}</span>
          <span data-testid="session-sync" data-pending={doc.pending}>{doc.pending ? 'sending' : 'in sync'}</span>
          <span data-testid="session-dirty" data-dirty={doc.dirty}>{doc.dirty ? 'unsaved' : 'saved'}</span>
        </>
      ) : null}
      <span data-testid="session-live">live {live}</span>
      {cursor ? <span data-testid="session-cursor">{cursor}</span> : null}
      {resyncs.length > 0 ? <span data-testid="session-resyncs">{resyncs.length} resync</span> : null}
    </span>
  )
}
