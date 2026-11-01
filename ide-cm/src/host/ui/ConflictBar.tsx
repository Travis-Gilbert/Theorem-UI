// SOURCING: OpenIDEA's Button and design tokens. The conflict itself is the SDK session's
// (`DocumentSession.onConflict` / `resolveConflict`); this only asks which side wins.

import { Button } from '@/ui'
import { useHostState } from '../store'
import styles from './ConflictBar.module.css'

/**
 * The checkout changed under edits that were not saved. The user's edits are never dropped
 * silently: the bar stays until one side is chosen. Keeping the shared text means a later save
 * writes it over the checkout; using the checkout's text replaces the shared text with it.
 */
export function ConflictBar() {
  const conflicts = useHostState((s) => s.conflicts)
  const entries = Object.entries(conflicts)
  if (entries.length === 0) return null
  return (
    <div className={styles.stack} role="alert" data-testid="conflict-bar">
      {entries.map(([path, conflict]) => (
        <div key={path} className={styles.bar} data-testid="conflict" data-path={path}>
          <span className={styles.message}>
            <strong>{path.slice(path.lastIndexOf('/') + 1)}</strong>{' '}
            {conflict.diskDeleted
              ? 'was deleted in the workspace checkout while you have unsaved edits.'
              : 'changed in the workspace checkout while you have unsaved edits.'}{' '}
            <span className={styles.revision}>(revision {conflict.revision})</span>
          </span>
          <Button size="small" variant="primary" onClick={() => void conflict.resolve('authority')}>
            Keep my edits
          </Button>
          <Button size="small" onClick={() => void conflict.resolve('disk')}>
            {conflict.diskDeleted ? 'Discard my edits' : 'Use the checkout'}
          </Button>
        </div>
      ))}
    </div>
  )
}
