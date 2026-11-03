// SOURCING: zustand (the host's store), OpenIDEA's status bar contribution point and its
// notification service. Shows the authority state of the active document next to what the editor
// holds locally, so a user, and an evidence capture, can tell an unaccepted edit from an accepted
// one; and what this tab has refused as unavailable, listed with the reason on click.

import { useEditorRegistry } from '@/editor/api'
import { notifications } from '@/workbench/contributions'
import type { Refusal } from '../host'
import { useHostState } from '../store'
import styles from './SessionStatus.module.css'

export function SessionStatus() {
  const path = useEditorRegistry((s) => s.active?.ctx.path)
  const live = useHostState((s) => s.live)
  const cursor = useHostState((s) => s.cursor)
  const resyncs = useHostState((s) => s.resyncs)
  const doc = useHostState((s) => (path ? s.docs[path] : undefined))
  const unavailable = useHostState((s) => s.unavailable)
  const refused = Object.entries(unavailable)
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
      {refused.length > 0 ? (
        <button
          type="button"
          className={styles.unavailable}
          data-testid="session-unavailable"
          data-count={refused.length}
          title={refused.map(([, r]) => r.message).join('\n')}
          onClick={() => showUnavailable(refused)}
        >
          {refused.length} unavailable
        </button>
      ) : null}
    </span>
  )
}

function showUnavailable(refused: [string, Refusal][]): void {
  notifications().notify({
    level: 'info',
    key: 'theorem.unavailable',
    group: 'system',
    title: 'Not available in this browser tab',
    body: (
      <ul data-testid="unavailable-list">
        {refused.map(([feature, r]) => (
          <li key={feature} data-feature={feature}>
            {r.message} ({r.count}×)
          </li>
        ))}
      </ul>
    ),
  })
}
