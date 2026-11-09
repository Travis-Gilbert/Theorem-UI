// SOURCING: React context (whether a frame is on the IDE page), zustand (what the docked IDE frame reports to the page around it, as follow.ts keeps the frame itself); the shapes are the frame contract in ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts
//
// Docked on the IDE page, Theia shows its editors alone: the page draws its
// status bar and its file tree. The frame reports both here.
import { createContext } from 'react'
import { create } from 'zustand'
import type { StatusBarItems } from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'

/** True inside the IDE mode's page, whose sidebar and status bar take over from Theia's. */
export const OnIdePage = createContext(false)

type IdePageState = {
  /** The docked frame's status bar entries, while one is linked. */
  statusBar: StatusBarItems | undefined
  /** The folders whose files changed last ('' the top), a new array each time. */
  changedFolders: ReadonlyArray<string>
}

export const useIdePage = create<IdePageState>()(() => ({
  statusBar: undefined,
  changedFolders: [],
}))
