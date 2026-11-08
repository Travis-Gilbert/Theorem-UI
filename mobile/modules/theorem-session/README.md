# theorem-session

A local Expo module that puts the Remux session feature (SSH, tmux, Ghostty)
behind the Theorem iOS app. People never see Remux itself. Chat reads Claude
Code and Codex conversations through it and types replies into them. The
terminal shows only for someone who turns on **Show terminal** in Settings.

- `ios/vendor/remux/`: Remux sources, MIT. See `VENDORED.md` for the
  revision, every pin and the one recorded patch (`patches/`).
- `ios/TheoremComputers.swift`: computers saved on this device, built from
  Remux's own stores. Saving a computer signs in once to check it, then puts
  the credential in Remux's Keychain store; the credential is never returned
  to JavaScript. `run` executes a `/bin/sh` script over Remux's SSH root pool,
  with the script on stdin. A host key Remux does not trust comes back as a
  challenge carrying its fingerprint, and is trusted only through
  `trustHostKey` with that fingerprint.
- `ios/TheoremSessionModule.swift`: what React Native sees: provenance
  constants, `listComputers`, `saveComputer`, `removeComputer`, `run`,
  `trustHostKey`, and one view.
- `ios/TheoremTerminalView.swift`: the terminal for one tmux session. It
  hosts Remux's `RootView` with the patched `opening` argument, so Remux opens
  that session directly, and passes the window scene's activation state in as
  SwiftUI `scenePhase`, which Remux uses to pause and resume surfaces.
- `index.tsx`: `computers()`, `sessionSupport()` and `TheoremTerminalView`.
  The module is optional: without it (Expo Go, a build without GhosttyKit)
  the app says why.

Before `pod install` (local builds and EAS), run `scripts/fetch-ghosttykit.sh`.
The podspec refuses to install without it.

## How chat uses it

The scripts live in `src/features/agents/shell.ts` and are tested against
dash, bash and a real tmux server in `agents.test.ts`.

- **Finding conversations.** One script lists tmux panes with their process
  trees and the recent Claude Code (`~/.claude/projects`) and Codex
  (`~/.codex/sessions`) logs. A log is live when exactly one pane runs that
  agent in that log's folder. When two do, the conversation is read only,
  because Theorem cannot tell which pane would get the message.
- **Reading.** The agent's own JSONL log is the conversation. Theorem reads
  its end in chunks and never keeps a second copy. These log formats are not
  documented by their makers and can change.
- **Sending.** The text goes into a tmux buffer, is pasted into the pane and
  followed by Enter. A send that cannot be confirmed goes back into the
  composer with a note. It is never typed again automatically.
- **Stop** presses Escape in the pane. Nothing else interrupts the agent.
- **Starting** a conversation runs the agent in a new detached tmux session
  in the chosen folder, with the first message as its prompt.

## Lifecycle

Leaving a conversation stops reading; it never stops the agent. Closing the
terminal removes the view and its hosting controller, which detaches this
device's client; the tmux session keeps running on its host. Removing a
computer forgets its sign-in and host key on this device and touches nothing
on the computer.

## Limits

- Remux's stores stay device-local (JSON under Application Support,
  credentials in the Keychain under Remux's service name).
- Theorem pairing, a Theorem-carried transport and Herdr are later work
  (spec Phase 4).
- None of the Swift has been compiled or run yet: it needs Xcode with the
  iOS 18 SDK.
