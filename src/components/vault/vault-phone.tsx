// SOURCING: the shell's FoldersSection (WorkspaceTree); a file opens over it in
// WorkspaceFileOverlay, as every workspace file does on a phone.
import { FoldersSection } from '@/components/workspace/folders'

/** The Vault on a phone: the folders, filling the screen. */
export function VaultPhone() {
  return (
    <div className="on-sheet h-full">
      <FoldersSection className="h-full max-h-none border-t-0" />
    </div>
  )
}
