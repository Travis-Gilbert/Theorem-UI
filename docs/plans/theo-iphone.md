# Theo on iPhone: plan

The owner's concept is `theo-iphone-concept.md`, kept as written. This file
maps each of its sections to what this repository contains, says which of its
platform claims were checked against Apple's and Expo's current documentation,
names what is missing, and lists the decisions that are the owner's.
`theo-iphone.checklist.json` tracks each item with its evidence.

Written 2026-11-12 on Linux, with no Xcode, simulator or phone. Built the
same day on EAS; "Native build" says what that showed and changed.

## How to read the evidence

Every claim in this plan and its checklist carries one of these, and no more
than it earned:

| Word                   | What it means here                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| **source-implemented** | The code is written. Nothing has run it.                                                                   |
| **test-verified**      | `bun test` exercises it. For native features this covers only the logic that has no native part.           |
| **bundled**            | `expo export --platform ios` put it in a Hermes bundle. JavaScript resolves; it has not run.               |
| **prebuild-verified**  | `expo prebuild` generated the Xcode project, and the target, identifier, entitlement or key is in it       |
| **built**              | Xcode or EAS compiled and linked it. Say for which SDK: the simulator and the device are separate          |
| **observed on device** | A person saw it happen on an iPhone. A simulator observation is not this, and is called simulator-observed |

The app and both extensions are built for the iOS Simulator, and compiled and
linked unsigned for the device SDK. The ScreenCaptureKit route is only in the
device build: the simulator SDK has no ScreenCaptureKit. Nothing is signed,
and nothing has run on a simulator or a phone.

## Where this sits

The Expo app is not on `main`. It is the open pull request #42
(`claude/theorem-ios-app-knkszc`), which was 296 commits behind `main` and did
not contain `src/lib/face`. This work is the branch `claude/theo-iphone`:
#42's branch, with `main` merged in for Theo's core (one conflict, in
`.prettierignore`), and then the commits below. Its pull request targets
`main`, so until #42 merges it also shows #42's files.

The app is Expo SDK 58 (React Native 0.88, Expo Router, Continuous Native
Generation, iOS 18 deployment target), in `mobile/`. It talks to Theorem
through `@theoremharness/sdk` 0.6.0-alpha.1: `HeadlessConversation` behind a
binding that leases one session per thread, with a SQLite journal. It reaches
Claude Code and Codex on a person's computers over SSH through a Remux-derived
Swift module. Before this work it had no uploads, no extensions and no
capabilities beyond associated domains.

## What the documentation says

Each platform claim in the concept was read against the live page on
2026-11-12. All ten hold. Four carry something that changes the plan.

| Claim (concept section)                                         | Verdict | Minimum iOS      | What changes the plan                                                                                                                                                          |
| --------------------------------------------------------------- | ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ScreenCaptureKit shares the whole display across apps (§1)      | Holds   | 27.0             | Needs the `screen-capture` background mode, and `audio` plus an active play-and-record audio session for the microphone. Wants `NSScreenCaptureUsageDescription`.              |
| ReplayKit broadcast extension for older iOS (§1)                | Holds   | 10.0             | **Deprecated in iOS 27** ("No longer supported"), with `RPSystemBroadcastPickerView` and `RPScreenRecorder`. It is only a route for iOS 18 to 26. No memory limit documented.  |
| `RunSystemShortcutIntent` (§5)                                  | Holds   | 27.0             | Works only as a `Button(intent:)` inside a widget.                                                                                                                             |
| Continued-processing tasks (§5)                                 | Holds   | 26.0             | The identifier is `<bundle id>.<context>.*` and goes in `BGTaskSchedulerPermittedIdentifiers`.                                                                                 |
| Controls in Control Center, Lock Screen, Action button (§2)     | Holds   | 18.0             | `openAppWhenRun` is deprecated from iOS 26 in favour of `supportedModes`. The intent must be a member of both the app and the widget extension.                                |
| Live Activities: app or push updates, no networking (§2)        | Holds   | 16.1             | 4 KB for all of an activity's data. Active at most eight hours.                                                                                                                |
| Animation limit of two seconds, none in Always On (§2)          | Holds   | —                | —                                                                                                                                                                              |
| Event editor without calendar access (§3)                       | Holds   | 17 for this flow | —                                                                                                                                                                              |
| Share extension hands items to its app (§4)                     | Partly  | —                | The App Group container holds. **A share extension may not open its app**: Apple lists only Today and iMessage extensions for that. `expo-sharing` does it anyway (see below). |
| Visual Intelligence (§3)                                        | Holds   | 26.0             | One `IntentValueQuery` per app.                                                                                                                                                |
| Picture in picture for video calls takes no custom touches (§6) | Holds   | 15               | —                                                                                                                                                                              |

Expo SDK 58, read the same day:

- `expo-sharing` has a first-party share extension that receives items. It is
  marked **experimental**, and its extension opens the app, which Apple's
  documentation does not support for share extensions.
- `expo-widgets` builds Live Activities and widgets from `@expo/ui`. It has
  no control widgets and no path shape.
- `expo-app-intents` is **alpha**. It compiles Swift from `app-intents/` into
  the app target, which is where Apple reads App Intents from. A pod is not.
- `expo-calendar`'s permission-free editor is `expo-calendar/legacy`
  `createEventInCalendarAsync`. The root import of that name throws.
- Metro does not read `../src/lib/face` unless `watchFolders` names it. The
  documentation suggested it would; the bundle failed until it did.

## Section by section

### §1 Accompany the person in other apps

| Concept                                                       | Here                                                                                                                                                                            | Evidence                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| User-started sharing of the whole screen, with microphone     | `mobile/modules/theo-capture`: `CaptureRoute` is the one interface; `ScreenCaptureKitRoute` is the iOS 27 route (system picker, `SCStream`, microphone output, audio session)   | built (device SDK, unsigned); not observed                   |
| Clear capture state and recovery                              | `mobile/src/features/screen-share/session.ts` and the screen at Settings → Prototypes → Screen sharing: state with the system's reason, counts, the newest still, device checks | test-verified (the model); bundled; prebuild-verified (keys) |
| An annotation stays attached to the frame it describes        | A still has a sequence number and a capture time, is called live only for three seconds while sharing, and an older frame never replaces a newer one                            | test-verified                                                |
| Switching from a screenshot to the screen in one conversation | A still goes to a conversation through intake ("Give this still to a conversation")                                                                                             | source-implemented                                           |
| ReplayKit route for iOS 18 to 26                              | **Not built.** It needs a broadcast upload extension target, which no first-party Expo package generates                                                                        | owner decision 3                                             |
| The frames reach an agent continuously, and Theo speaks       | **Not built.** The prototype answers only whether capture survives other apps. `speak` is a test line through the system voice                                                  | —                                                            |

### §2 Native places to appear

| Concept                              | Here                                                                                                                                                                                                                                                                      | Evidence                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Action button, Shortcuts, Siri       | `mobile/app-intents/`: three App Intents with App Shortcuts (capture, share, continue). `features/invocation` opens the same screens a person reaches by hand                                                                                                             | built (simulator and device SDK); test-verified (routing)              |
| Control Center control               | **Not built.** A `ControlWidget` is Swift in a widget extension; `expo-widgets` offers none                                                                                                                                                                               | owner decision 8                                                       |
| Share sheet                          | `expo-sharing` share extension `rs.theorem.app.ShareExtension`; `+native-intent.ts` sends it to intake                                                                                                                                                                    | built (simulator and device SDK, unsigned); bundled                    |
| Dynamic Island and Lock Screen       | `features/presence/task-activity.tsx` (`TheoTask`) through `expo-widgets`, target `rs.theorem.app.ExpoWidgetsTarget`. It shows a pose, the task, its status and where it runs. It follows a running conversation, refuses stale updates, and says "Last known" when stale | built (simulator and device SDK, unsigned); test-verified (the record) |
| Recognisable poses, not particles    | `features/theo/poses.ts`: the core's engine settles into the mood of a liveness and is read off as outlines, then as boxes, because `@expo/ui` has rounded rectangles and no paths                                                                                        | test-verified                                                          |
| Home Screen widget                   | **Not built**                                                                                                                                                                                                                                                             | —                                                                      |
| The full character in a working view | **Not built.** The phone has the core and no renderer for it                                                                                                                                                                                                              | owner decision 2                                                       |

The Live Activity updates only while the app runs. Theorem has no route that
sends ActivityKit pushes, so `enablePushNotifications` is off. When the app is
suspended the activity goes stale after 90 seconds and says so; when the app
returns it asks Theorem whether each run is still going and ends what is over.

### §3 The physical world into the agent's work

| Concept                                  | Here                                                                                                                                                                                                                         | Evidence                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Capture, select, discuss                 | Intake's Camera button: the system camera, one photograph, kept in the app's storage, sent to a chosen conversation                                                                                                          | source-implemented; bundled               |
| A viewfinder, a selected region          | **Not built.** The system camera is used as it is                                                                                                                                                                            | —                                         |
| Poster to calendar event                 | `features/phone-actions`: sends from the phone declare the client operation `phone.calendar.propose_event`. A call becomes a card; Add to Calendar opens the system editor; the card reports what the editor answered        | test-verified (parsing, receipt); bundled |
| Reports the actual outcome               | The receipt to the run says the card was **shown**, never saved: a run waits about twenty seconds for a receipt and a person takes longer. The outcome is offered to the composer as a line for the person to send or change | test-verified                             |
| Keeps the poster with the project        | The photograph is an upload in the conversation's project, attached to the message                                                                                                                                           | source-implemented                        |
| VisionKit live text, Visual Intelligence | **Not built**                                                                                                                                                                                                                | —                                         |

### §4 Sharing into the current agent

This is the first dependable interaction, built against the real session API.

| The concept's four things       | Here                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What item is being supplied     | Each item with its name, type and size, and a preview for an image                                                                                                 |
| Which agent or task receives it | A picker of existing Theorem conversations by project; the last choice is remembered; a conversation's own Add button names that conversation                      |
| What you want done with it      | The instruction, which is the message text. Shared links and passages are appended to it                                                                           |
| Queued, uploaded, or accepted   | `queued`, `uploading`, `uploaded`, `sending`, `admitted`, `recorded`, `refused`, `failed`. Each names something confirmed, by the phone or by Theorem (`model.ts`) |

How it works (`mobile/src/features/intake`):

- A picked, captured or shared file is copied into the app's storage at once,
  so a delivery outlives the picker's temporary file and the app's process.
- The delivery is saved to SQLite before anything is sent. Each file goes to
  `POST /api/chat/v1/projects/:id/uploads`, the route the web client uses,
  under the idempotency key `<delivery>:<item>`.
- The message is `HeadlessConversation.send(<delivery id>, { text, uploadIds })`:
  a journaled command, so a lost answer is reconciled, not sent twice.
- A delivery found in `sending` after a stop looks for its message in the
  thread before it sends. A run already in progress is waited out, never
  stopped.
- `recorded` is claimed only when the message Theorem stored carries every
  file as an attachment part. If it does not, the delivery stays `admitted`
  and the card says so.

Evidence: test-verified for the order of steps, the stages and the store;
bundled; **not run against Theorem.**

**"Accepted by the agent" has no signal.** Theorem confirms that it stored the
bytes and that the stored message carries them. Nothing in its API says the
model was given an image as an image. The last stage is therefore "In the
conversation", and its text says "Theorem does not report whether the model
read it." See owner decision 5.

Claude Code and Codex on a computer are not receivers. The app can type into
their terminal; it has no way to put a file on the computer and confirm the
agent was given it. The picker says this. See owner decision 4.

### §5 A programmable participant

| Concept's action                   | Here                                                    |
| ---------------------------------- | ------------------------------------------------------- |
| Continue this agent session        | `ContinueConversationIntent`                            |
| Capture something for this project | `CaptureForConversationIntent`                          |
| Save this supplied item            | `ShareIntoConversationIntent`, with an optional note    |
| Start a task on my Mac             | Not built: needs the desktop pairing of §6              |
| Open the current desktop surface   | Not built: §6                                           |
| Pause a particular run             | Not built: a stop without seeing the run needs a design |
| Read or show the latest result     | Not built                                               |

Each intent opens the app and hands its name to JavaScript, which opens the
screen that does the work with the app's own services. None reports an
outcome from Swift. `RunSystemShortcutIntent` and continued-processing tasks
are not used yet.

### §6 Remote desktop

Not started, as the build order says. What exists from #42 is SSH to saved
computers and a hidden terminal. Nothing here carries desktop media or
control.

### §7 Reuse the core, with a native host

| Concept                                                | Here                                                                                                                                                                                                                                                                         | Evidence                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Reuse form definitions, programs, particles, reactions | `mobile/src/features/theo/core.ts` re-exports `src/lib/face`'s engine, features, identity and programs. Nothing is copied. `metro.config.js` lets Metro read those files                                                                                                     | test-verified; bundled         |
| What made that possible                                | One line: `src/lib/face/engine.ts` imported a type through the web's `@/` alias. It now imports it by relative path. The rest of the pure core had no imports outside itself                                                                                                 | web: 206 face tests still pass |
| Not reused                                             | The luma renderer, the Rapier body, the zustand store and the client operations are the web's host. The phone needs its own                                                                                                                                                  | —                              |
| The cross-device contract                              | `mobile/src/features/presence/activity.ts`: activity id, generation, revision, environment, phase, standing, preferred form, signals with a time, actions. A stale update is refused. Hiding changes only what the phone shows. Stop is a listed action, never a side effect | test-verified                  |

The record was written from the description of Platinum's `crates/presence`
that came with the request, not from its source. See owner decision 6.

How the six contract points stand:

| Point                                            | Status                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Both devices know the same task and activity ids | The phone's id is `theorem-thread:<threadId>`. Not compared with the desktop's                                    |
| Every operation names its environment            | `Environment` is `theorem`, `iphone` or `computer`. Only `theorem` is produced today                              |
| The phone rebuilds state after suspension        | Deliveries and the Live Activity map are in SQLite; conversations rebuild from the SDK journal                    |
| Audio forms respond to audio on that device      | Not built. Nothing on the phone measures audio                                                                    |
| A pending task stays steerable                   | The record lists `steer`; the conversation composer is the only steering surface                                  |
| Closing a surface never ends the work            | Held throughout: leaving a screen, hiding an activity, or ending the Live Activity calls nothing that stops a run |

## What the owner sees change

Made through config plugins in `mobile/app.config.ts`. `ios/` is generated and
not committed.

| Kind             | Value                                                                                                                                          | From                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| App Group        | `group.rs.theorem.app` (override: `THEOREM_IOS_APP_GROUP`), on the app and both extensions                                                     | expo-sharing, expo-widgets                                                     |
| Extension        | `rs.theorem.app.ShareExtension`, a share extension, iOS 16.4 target                                                                            | expo-sharing                                                                   |
| Extension        | `rs.theorem.app.ExpoWidgetsTarget`, a widget extension for the Live Activity                                                                   | expo-widgets                                                                   |
| Entitlement      | `com.apple.security.application-groups` on all three                                                                                           | both                                                                           |
| Info.plist       | `NSSupportsLiveActivities` = true                                                                                                              | expo-widgets                                                                   |
| Info.plist       | `UIBackgroundModes` = `screen-capture`, `audio`                                                                                                | the capture prototype                                                          |
| Info.plist       | `NSScreenCaptureUsageDescription`                                                                                                              | the capture prototype                                                          |
| Info.plist       | `NSCameraUsageDescription`                                                                                                                     | expo-image-picker                                                              |
| Info.plist       | `NSCalendarsUsageDescription`, `NSCalendarsFullAccessUsageDescription`, `NSRemindersUsageDescription`, `NSRemindersFullAccessUsageDescription` | expo-calendar adds these whether or not it is configured; the text is now ours |
| App target Swift | `mobile/app-intents/*.swift` through inline modules (`experiments.inlineModules`)                                                              | expo-app-intents                                                               |
| Local module     | `mobile/modules/theo-capture` (pod `TheoCapture`, weak-links ScreenCaptureKit for the device SDK only)                                         | this work                                                                      |
| Share activation | text, one web URL, up to ten images, up to ten files                                                                                           | expo-sharing                                                                   |

Not added: push (`aps-environment`), photo library permission, any calendar
permission request, any new URL scheme.

New packages, each at the newest version the repository's three-day release
gate allowed: `expo-file-system` 58.0.13, `expo-image-picker` 58.0.10,
`expo-document-picker` 58.0.4, `expo-sharing` 58.0.22, `expo-image` 58.0.18,
`expo-widgets` 58.0.27, `@expo/ui` 58.0.27, `expo-app-intents` 0.5.16,
`expo-calendar` 58.0.6.

## Owner decisions

Each has a recommendation and the reversible default this work took.

1. **Merge order.** This branch contains #42. Recommendation: merge #42
   first, then this. Default taken: a separate draft pull request against
   `main` that says it is stacked.
2. **Expo and React Native, or more SwiftUI.** Recommendation: stay on Expo.
   SDK 58 has first-party packages for the share extension, Live Activities
   and App Intents, and the pure core imports directly. The cost is that two
   of them are experimental or alpha, and Theo's full renderer on the phone
   is still to choose: SwiftUI Canvas in a local module fed by the core's
   shapes, or a GPU view. Default taken: Expo, with poses only.
3. **Minimum iOS, and whether to build the ReplayKit route.** The app stays at
   iOS 18. Whole-screen sharing needs iOS 27. The route for 18 to 26 is a
   ReplayKit broadcast extension, deprecated in 27, which needs a third-party
   target plugin (`@bacons/apple-targets`) beside the two first-party
   extension targets. Recommendation: do not build it; offer screen sharing
   on iOS 27 only and say so on earlier versions, which the prototype does.
   Default taken: the interface has room for the route and it is not built.
4. **Which sessions receive attachments.** Default taken: Theorem
   conversations, through the project uploads route. For Claude Code and
   Codex over SSH, the recommendation is to transfer the file with Remux's
   existing attachment transfer and type its path, with the delivery ending
   at "on the computer" and never "accepted" until the agent's log shows it.
5. **A signal that the model received an item.** Decided by the owner on
   2026-11-12: Theorem should be able to report which uploads the model was
   actually given, and whether it does is a setting the person turns on or
   off. Still to build: the report on Theorem's side (for example a run event
   naming the upload ids given to the model and in what form), the setting,
   and a stage after "In the conversation" that appears only when the setting
   is on and the report has arrived. Until then that is the phone's last stage.
6. **The presence contract.** The phone's `Activity` needs comparing with
   Platinum `crates/presence` on `claude/theo-desktop-host`: field names, the
   values of phase, standing and form, and what a generation counts. The
   phone uses the thread revision at which it first saw a run. Attach that
   repository to a session, or paste the record's definition.
7. **Live Activity updates when the app is not running.** Needs a Theorem
   route that sends ActivityKit pushes, and the `aps-environment` entitlement.
   Default taken: off; the activity says when it is stale.
8. **A Control Center control.** Needs Swift in a widget extension. The
   recommendation is to wait for `expo-widgets` to offer controls, or add
   `@bacons/apple-targets` if the decision in 3 brings it in anyway. The
   Action button already works through the App Shortcuts.
9. **Background modes at App Review.** `audio` and `screen-capture` are
   declared for a prototype behind Settings. Recommendation: keep them in
   development and preview builds, and decide before a store build.
10. **The release gate against Expo's patch cadence.** `expo-doctor` fails one
    check: seventeen packages are one patch behind releases made on
    2026-11-11, which the three-day gate holds back. Recommendation: leave
    it; they pass on their own in three days.
11. **Reporting a saved event.** Default taken: the phone writes a line into
    the composer and the person sends it. The alternative is a Theorem
    operation that lets the phone report a later outcome to a finished run.
12. **A share made while signed out** is not kept. It should be.

## Native build

Done on 2026-11-12 on EAS Build, because the Mac this ran on had only the
Command Line Tools (no Xcode, no simulator). EAS used Xcode 27.1 (27A9275),
the iPhoneSimulator 27.1 and iPhoneOS 27.1 SDKs, and Swift 6 language mode for
the local modules.

| Build                                  | Profile             | Result                                                                                                                                     |
| -------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `dccbb349-e608-456f-8e51-46917519ed03` | `simulator`         | Debug dev client for the simulator, arm64 and x86_64. Built and linked: the app, `ExpoWidgetsTarget.appex`, `expo-sharing-extension.appex` |
| `321364ec-7f1e-4033-b6b7-e951c3d2f298` | `preview-simulator` | Release for the simulator, arm64, with the Hermes bundle (`main.jsbundle`, bytecode v99) embedded. Same three targets                      |
| `ed461e9f-7eda-45dc-8fca-6edf40fb307a` | `device-compile`    | Debug for `generic/platform=iOS` with signing off. All targets compiled and linked; nothing installable, nothing signed                    |

What the compiler found, and what changed:

1. `TheoCaptureModule.swift`: Expo 58's `AsyncFunction` closures are
   `@Sendable`, and the module captured a non-Sendable `self`. The module is
   now `@unchecked Sendable`, as `expo-app-intents`' own module is, with its
   route and synthesizer on the main actor and its counts under a lock.
2. Linking for the simulator failed on `-weak_framework ScreenCaptureKit`:
   **the iPhoneSimulator 27.1 SDK has no ScreenCaptureKit.** The pod now adds
   the flag for `iphoneos` only. On the simulator `canImport(ScreenCaptureKit)`
   is false, the route compiles out, and the screen says why.
3. `SCStreamConfiguration.minimumFrameInterval` is `API_UNAVAILABLE(ios)` in
   the iPhoneOS 27.1 SDK; this plan's reading of Apple's sample had assumed it.
   The route now passes on at most one frame a second of presentation time
   itself, so a frame and a still stay one-to-one.
4. Swift 6 region isolation rejected the hop from the picker observer to the
   main actor (sending `self` and the `SCContentFilter`). The route is now
   `@unchecked Sendable` with its isolation written on the class.
5. A test assumed `codex` was missing from the runner's `PATH`; it now runs
   with a fixed `PATH`. Six others need `tmux` installed, and failed until
   it was.

The App Intents compiled with no diagnostics, `ExtractAppIntentsMetadata`
wrote `Metadata.appintents`, and the build trained the three phrase sets. No
warning in the build came from `app-intents/` or `modules/theo-capture/`.

What the simulator bundle contains: `UIBackgroundModes` `screen-capture` and
`audio`, `NSScreenCaptureUsageDescription`, `NSSupportsLiveActivities`,
`NSCameraUsageDescription`, minimum iOS 18.0 (16.4 for both extensions), and
links to AppIntents and ActivityKit. Simulator builds carry no entitlements,
so the App Group is not yet signed or provisioned anywhere.

Not done: no simulator ran it (EAS's hosted simulator is not available on
this account, and there is no local Xcode), no signed build, no device.

## What to try on a real phone

Nothing below has been observed on a device or in a simulator. Items 1 and 2
are now built (see "Native build"); everything else needs a signed
development build on an iPhone
(`bunx eas-cli build --profile development --platform ios`, after the device
is registered). The screen-sharing checks also need iOS 27.

First, does it build:

1. `pod install` and the Xcode build succeed with three targets.
2. The Swift in `app-intents/` and `modules/theo-capture/ios/` compiles.
3. EAS signs the two extension targets and provisions the App Group.

Intake:

4. Chat → Share. Camera, Photos and Files each add an item with a preview.
5. Choose a conversation, write an instruction, send. The card moves through
   Uploading, Uploaded, Sending to In the conversation.
6. Open the conversation. The message shows the instruction and "Attached:".
   The agent's reply shows whether it saw the image.
7. Turn on Airplane Mode midway. The card says Not sent, with where it
   stopped. Turn it off and Try again: it finishes, and the conversation has
   one message, not two.
8. Force-quit during an upload and reopen. The delivery carries on.
9. Send into a conversation that is mid-run. The card says it is waiting, and
   sends when the run ends.
10. From Photos or Safari, Share → Theorem. Intake opens holding the item.

System surfaces:

11. Shortcuts shows three Theorem actions. Each opens the right screen. Assign
    one to the Action button.
12. Start a run and leave the app. The Dynamic Island shows the eyes and a
    status; the Lock Screen shows the banner. Tapping it opens the
    conversation.
13. Wait two minutes away from the app. The activity reads "Last known".
14. Return after the run has ended. The activity ends.
15. Whether the poses read as Theo at Dynamic Island size.

Calendar:

16. Photograph a poster and ask for the event to be added. A Proposed event
    card appears.
17. Add to Calendar opens the system editor, filled in, with no permission
    prompt. Save: the card says Saved, the composer holds a line, and the
    event is in Calendar. Cancel: the card says Not added.

Screen sharing, at Settings → Prototypes:

18. Share my screen shows the system picker. Choosing the whole screen starts
    the frame count.
19. Ten seconds in another app: "Frames while this app was not in front" is
    above zero.
20. With the microphone on, the buffer count rises in another app.
21. Speak a test line is heard while sharing continues.
22. A phone call or Siri: what state and reason appear.
23. Stopping from the system control shows Stopped with a reason.
24. Sharing starts again after a stop.

## Next, in the concept's order

1. Build it, and work through the list above. Fix what the compiler and the
   phone find.
2. The decisions that unblock the most: 5 (model receipt), 6 (presence
   contract), 7 (push updates).
3. Screen-and-voice assistance proper: frames to an agent, spoken replies.
   Only after checks 18 to 24 pass.
4. Theo's renderer in the working view.
5. Desktop viewing and control, then routines. Not before the above stands.
