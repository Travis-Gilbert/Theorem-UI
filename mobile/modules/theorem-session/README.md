# theorem-session

A local Expo module that brings the Remux session feature (Herdr and tmux
sessions over SSH, rendered by Ghostty) into the Theorem iOS app.

- `ios/vendor/remux/`: Remux sources, MIT, unmodified. See `VENDORED.md` for
  the revision and every pin.
- `ios/TheoremSessionModule.swift`: the module React Native sees: provenance
  constants and one native view.
- `ios/TheoremSessionView.swift`: hosts Remux's `RootView` in a
  `UIHostingController` parented to the React view controller, and passes the
  window scene's activation state in as SwiftUI `scenePhase`, which Remux uses
  to pause and resume terminal surfaces.
- `index.tsx`: `sessionSupport()` and `TheoremSessionView`. The module is
  optional: without it (Expo Go, a build without GhosttyKit) the app shows why.

Before `pod install` (local builds and EAS), run `scripts/fetch-ghosttykit.sh`.
The podspec refuses to install without it.

## Lifecycle

Closing the session screen removes the view and its hosting controller. That
detaches this device's client; tmux and Herdr sessions keep running on their
host. Nothing in the module stops a remote session.

## Limits of this first slice

This hosts Remux's own interface, so it keeps Remux's saved-server library,
its connection setup and its device-local stores (JSON under Application
Support, SSH credentials in the Keychain). Theorem pairing, a Theorem-carried
Herdr transport, typed attach/detach/focus commands from React Native and
session-state events are later work (spec Phase 4). None of this has been
compiled or run yet: it needs Xcode with the iOS 18 SDK.
