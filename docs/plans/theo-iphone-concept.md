# Theo on iPhone: the owner's concept

This is the owner's concept document of 2026-11-12, kept as written. It is a
product direction, not a specification. The plan that maps it to this
repository, says which of its platform claims were checked, and tracks what is
built is `theo-iphone.md`, with `theo-iphone.checklist.json` beside it.

---

**Yes—there is a much stronger iPhone version of this idea than putting Theo’s eyes in a chat screen.** I would build it around being present during an activity: looking at something with you, receiving what you share, carrying out supported phone actions, and keeping you connected to work happening on your desktop.

The most consequential thing I found is that **a user-started “see my phone screen and talk with me” mode is technically plausible through Apple’s documented APIs.** That gives us a way for Theo to participate while you use other apps, even though operating those apps is a separate capability.

Your desktop-control idea fits naturally into that experience. The phone can provide the context, the agent can work on the Mac, and you can watch, steer, or take over from the phone. But I would also give the phone useful capabilities of its own, so Theo remains valuable when the Mac is asleep.

## 1. Theo could accompany you while you use other iPhone apps

Imagine this interaction:

You invoke Theo and say, “Stay with me while I work through this.” You start screen sharing, return to the application you were using, and continue talking. Theo can answer questions about what is visible, notice that the page changed, explain an unfamiliar interface, or take relevant information into the current task.

That is a substantially different experience from repeatedly taking screenshots and opening a chat.

### The screen-sharing path is better than I expected

Apple’s current documentation describes **ScreenCaptureKit on iOS 27 and later**, including a system picker for sharing the entire display. Its sample explicitly supports continuing full-display capture after the app moves into the background, with microphone audio when the user enables it. Apple also states that this route no longer requires a broadcast extension. [developer.apple.com](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios.md)

For an older iOS deployment target, the corresponding implementation is a **ReplayKit broadcast upload extension**, which receives video and audio buffers and broadcast lifecycle events. We should keep the capture implementation behind a common interface rather than make the whole feature depend on one OS version. [developer.apple.com](https://developer.apple.com/documentation/replaykit/rpbroadcastsamplehandler.md)

So I would distinguish three context modes:

| Mode | What Theo receives | Good use |
|---|---|---|
| **Share this item** | A supplied link, image, file, or text selection | “Use this in the research we’re doing.” |
| **Look at my screen** | A user-started screen-sharing session | “Help me understand this while I use it.” |
| **Look through my camera** | A photograph or an active camera view | “Help me with this thing in front of me.” |

They can all belong to the same agent conversation. Switching from a screenshot to a camera should change the evidence available to the agent, without making you start over.

### Seeing and operating remain different

I would not promise Mac-style arbitrary input control on the iPhone. Apple’s sandbox model gives third-party apps access outside their own container through explicitly provided system services. The capture APIs supply screen media; they do not grant a general permission to inspect every other app’s accessibility tree, inject taps, or draw an unrestricted interactive overlay. [Apple Support (UK)](https://support.apple.com/en-gb/guide/security/sec15bfe098e/web)

That does leave a useful division:

- **Theo sees and explains:** you operate the current app while Theo follows the shared screen and speaks.
- **Theo performs a supported action:** it creates an event, handles a selected file, calls an API, or participates in a configured Shortcut.
- **Theo operates another computer:** it uses the desktop computer-use service while you watch from the phone.

The first mode can still be quite capable. For example, you could ask Theo to compare two things you are looking at, keep track of the requirements while you fill out a form, or explain why an interface is behaving unexpectedly.

The important limitation for the visual design is that Theo cannot assume it can put its own highlight directly over a button in another app. It could explain verbally, or show an annotated captured frame when you open its view. An annotation must stay attached to the frame it describes.

Apple’s own FaceTime supports remote control of an iPhone, so this is not something the hardware or operating system is fundamentally incapable of doing. It is a question of which capabilities Apple exposes to third-party applications. I found no general public control interface that would let Theo inherit FaceTime’s powers. [Apple Support](https://support.apple.com/guide/iphone/request-give-remote-control-a-facetime-call-iph5d70f34a3/ios)

## 2. Give Theo several native places to appear

I would preserve the feeling that this is one character, while adapting its presentation to the system surface it occupies.

The phone version does not need to stay visually large to remain present. It needs to be **easy to summon, clear about what it is doing, and immediately useful when opened**.

| Place | Theo’s role | Presentation I would use |
|---|---|---|
| **Action button or Control Center** | Start a specific interaction | A recognizable Theo control that opens voice, camera, the current task, or the desktop |
| **Share sheet** | Bring something into the current work | A compact Theo view with the supplied item, selected agent, and a short instruction |
| **Dynamic Island / Lock Screen** | Follow a real ongoing task | A small device form, meaningful status, and a route to relevant controls |
| **Home Screen widget** | Resume work or run a chosen routine | Current task, recent result, and configurable actions |
| **Theo’s working view** | Converse, inspect, capture, browse, or control | The full expressive character and its device transformations |

Apple provides controls that can execute actions or open a particular app view from Control Center, the Lock Screen, and the Action button. Users configure where those controls appear. That gives us a native equivalent of “summon Theo,” without relying on a permanently floating window. [developer.apple.com](https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system.md)

Back Tap can also be part of the experience through Shortcuts. There is even a **Receive What’s On Screen** option for supported apps such as Safari, Maps, and Photos. However, invoking Theo and supplying context are separate operations: that option passes content made available by a supported app, rather than automatically providing pixels from any application. [Apple Support](https://support.apple.com/en-asia/guide/shortcuts/apd350ce757a/ios)

### The Dynamic Island is a good home for a restrained Theo

I can imagine the compact eyes there during an active session, or a small camera, speaker, or task form when that better describes the work. Expanding it could reveal something like:

> Comparing the three documents  
> Working on your Mac  
> Needs your choice

That should lead directly to the relevant task, result, or controls.

Live Activities already support current task information and quick interactions in prominent system locations. They receive updates from the app or push notifications; the Live Activity itself is not a process that can maintain the agent’s network connection. [developer.apple.com](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities.md)

There is also an animation constraint: widget and Live Activity animations are tied to updates, have a maximum duration of two seconds, and do not animate in Always On. So I would give this version of Theo **recognizable poses and short meaningful transitions**, while keeping the full particle behavior in the foreground interface. [developer.apple.com](https://developer.apple.com/documentation/widgetkit/animating-data-updates-in-widgets-and-live-activities.md)

For idle availability, use a widget or system control. For ongoing work, use a Live Activity. That makes the visible presence correspond to something real.

The full eye-to-screen morph still belongs in Theo’s working view. You tap into the current task, Theo opens into the browser, camera, document, or desktop surface, and the same task is already there. iOS owns the transition between system surfaces; we can make the identity and state continuous even where we cannot control every animation.

## 3. The most interesting phone-specific capability is bringing the physical world into the agent’s work

This is where I think the phone can add something the desktop cannot supply as conveniently.

You already want Theo to become a camera. On the iPhone, that transformation can expose an actual working camera interface: a viewfinder, a selected region, a capture button, a frozen frame to discuss, and the result of whatever the agent does with it.

### A camera connected to your existing knowledge

For you, a compelling example would be walking through a neighborhood and pointing Theo at a building detail, a posted notice, or a property condition.

You could say:

> “Add this to the project we were looking at yesterday. Does it change anything we thought about the site?”

Theo captures the image and your observation, associates them with the selected project, and lets the existing research agent connect them with its documents and prior work. Later, when you open Theorem on the desktop, that observation is already part of the same investigation.

That would fit Theseus especially well: the phone supplies new evidence from the world, and the research system relates it to a corpus you already have.

I would begin with **capture, select, discuss**. A definite photograph gives both you and the agent a stable reference. Live viewing can follow once frame identity, latency, and annotation behavior work reliably.

Apple’s VisionKit supplies useful native pieces here: live text and code recognition, item geometry, highlighting, and interaction with recognized content. General interpretation of a building, diagram, or object remains the model’s job. [Apple Developer Documentation](https://developer.apple.com/documentation/visionkit/scanning-data-with-the-camera)

### Turn observation into a completed phone action

The strongest demonstration would end with something accomplished.

For example:

1. You point Theo at an event poster.
2. It identifies the event, date, time, and location.
3. You ask it to add the event and keep the poster with the relevant project.
4. Theo presents a native event editor, saves the supplied source into the task, and reports the actual outcome.

iOS provides real calendar and reminder access through EventKit. It also provides a native event editor that can let the person create and save an event without granting the app access to the whole calendar database. Reading availability is a separate access requirement. [Apple Developer Documentation](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)

Other useful phone-native interactions could include:

- Capture several pages while Theo keeps track of the document packet and identifies what is missing.
- Read a model number, retrieve the appropriate manual, and discuss the relevant section.
- Record an observation, select the useful segment, and attach it to the current task.
- Select a document from Files, mark a passage, and ask the agent to compare it with previous material.
- Photograph a whiteboard and turn the decisions into project notes and follow-up tasks.

The device motif helps organize these interfaces. Camera, recorder, document reader, and task display each reveal the controls that make sense for the activity.

### There is also a route through Apple’s Visual Intelligence

Apple lets an app participate in visual search by receiving information about an object in a camera image or screenshot and returning matching app content.

For Theorem, that could mean matching what you are looking at to a saved reference, project, manual, note, or prior observation. The user could then open that item in Theo. This is a search integration, not a continuous screen feed, but it is a useful way for your knowledge system to appear where the question arises. [developer.apple.com](https://developer.apple.com/documentation/visualintelligence/integrating-your-app-with-visual-intelligence.md)

I would treat this as an additional discovery route after the direct camera and share interactions work.

## 4. Sharing into the current agent could be one of the most useful features

A native share interface deserves first-class treatment.

Suppose you are using the mobile version of something you are building and notice a layout problem. You take a screenshot, choose Theo in the share sheet, and say:

> “Give this to the Codex session fixing the composer. This is what happens when the keyboard opens.”

The important behavior is that Theo sends it to **that existing session**, with the image and instruction intact. You should not have to open a new chat, explain the project again, or manually transfer the screenshot to the Mac.

The share interface should make four things clear:

- What item is being supplied.
- Which agent or task will receive it.
- What you want done with it.
- Whether it is queued, uploaded, or accepted by the selected agent.

That last distinction carries over from the desktop design. A file reaching the agent’s computer is not yet proof that the model has received it as an image.

The same interaction works for research:

> “Compare this article with the material we collected yesterday.”

Or for a practical task:

> “Use this address for the plan we’re making.”

This is a way for Theo to participate across applications that does not require control over their interfaces.

It also gives the life agent a better context boundary. You can add a particular piece of evidence to an ongoing task, then choose whether a result or observation should become durable memory. We do not need to turn every screen you pass through into a permanent record.

## 5. Make the phone a programmable participant

I would expose a catalog of specific Theo actions through App Intents and Shortcuts:

- Continue this agent session.
- Capture something for this project.
- Save this supplied item.
- Start a task on my Mac.
- Open the current desktop surface.
- Pause a particular run.
- Read or show the latest result.

These actions should call the same task and capability services as the foreground app. That keeps a Shortcut from becoming a separate, less reliable version of Theo.

There is a newer capability worth accounting for in the design: **iOS 27’s `RunSystemShortcutIntent` lets a widget button run a user-selected App Shortcut, custom Shortcut, system action, or another app.** It is specifically a widget-button mechanism. The selected action is opaque to Theo; it does not expose the other action’s implementation or parameters to the model. [developer.apple.com](https://developer.apple.com/documentation/appintents/runsystemshortcutintent.md)

That could produce a useful Theo widget where the user combines agent state with routines they have chosen. A person might have a research routine, a morning preparation routine, or a capture-and-organize workflow.

I would distinguish two forms of programmability:

**Theorem workflows** can compose the capabilities the agent actually has: retrieve information, transform supplied content, create an artifact, call an API, or dispatch work to a connected computer.

**System workflows** can connect those Theo actions with capabilities exposed by iOS and participating apps, under the user’s Shortcut configuration.

That is meaningful extensibility even without arbitrary taps across the phone.

There is also more background processing available than “the app stops doing everything when you leave.” Apple documents continued-processing tasks for work explicitly started in the foreground, such as image processing, model work, and network operations. The system exposes progress and cancellation and manages resource limits. [developer.apple.com](https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados.md)

I would use those facilities for bounded phone work—processing scans, preparing an attachment, or synchronizing a project. A durable agent job running for hours should remain owned by the existing agent host and update the phone through supported channels.

Closing the phone interface should not cancel that job.

## 6. Your remote-desktop idea makes the whole system more capable

Yes: **wire computer use through the phone connection.**

The phone should be able to:

- Watch the agent operate the desktop.
- Ask questions about the desktop’s current state.
- Send steering while a task is running.
- Pause the agent and take over.
- Perform an action itself through remote input.
- Hand control back.
- Supply camera images, files, or observations from the phone to the same task.

The combination is more interesting than remote desktop alone. You could photograph something in front of you, ask the agent on your Mac to research or model it, and then open the resulting application or artifact on the phone.

### Preserve the shared connection, but distinguish its channels

I would reuse the same device pairing, agent identity, and Herdr-backed session relationship. I would keep these responsibilities distinct:

| Channel | Carries |
|---|---|
| **Agent/session** | Conversation, task state, steering, tool events, attachments |
| **Computer control** | Observe, resolve a target, act, cancel, verify |
| **Desktop media** | Live display and audio |
| **Phone context** | Shared items, camera captures, an active screen-sharing session |

Herdr is part of the continuity story. It should not be assumed to provide the desktop’s video/audio stream.

### Design the remote view for a phone

A complete desktop shrunk into portrait would be useful occasionally, but I would make a focused application or window the normal starting view.

Theo’s eyes could expand into that window, with:

- Native phone controls around the remote content.
- Pan and zoom.
- A deliberate pointer or trackpad mode for precision.
- An optional full-desktop landscape view.
- A clear indication of which computer is being controlled.

Semantic actions should be available where the desktop service supports them. If the agent has identified a specific field or button, a phone-sized action can be easier than aiming at a tiny remote target.

The phone, the desktop agent, and the person at the Mac must share one foreground-control owner. A stale frame must not remain actionable as if it were live, and rotating the phone must not silently change the coordinate meaning of an already queued action.

### Picture-in-picture is worth prototyping for watching

An actual desktop-session video could be useful in picture-in-picture while you do something else on the phone.

However, Apple’s video-call PiP surface does not receive touch events for arbitrary custom buttons. It is a viewing surface with system-managed interaction, rather than a general floating mini-application. I would test it for watching a real desktop session and return to Theo for precise control. [developer.apple.com](https://developer.apple.com/documentation/avkit/adopting-picture-in-picture-for-video-calls.md)

That still gives you a compelling experience: the agent works on the Mac, the desktop remains visible in a small window, and you can speak or return to the task when needed.

## 7. Reuse Theo’s core, with an iOS-native host

The pure visual-core boundary established for desktop is useful here. I would reuse the form definitions, programs, particles, and reaction logic, while giving the phone a native host for its camera, media, system controls, and lifecycle.

I would not make an iPhone release depend on porting the GPUI application itself.

If the mobile app remains based on Expo/React Native, the native Theo renderer and system extensions can be components within that architecture. If you choose SwiftUI for more of the application, the same shared core can sit behind a narrow native bridge. That choice should follow the mobile app’s broader needs.

For the foreground character, SwiftUI Canvas is a reasonable renderer to evaluate before committing to a more elaborate graphics path. The meaningful controls should remain actual native controls: Canvas does not automatically provide individual interaction or accessibility for each drawn element. [developer.apple.com](https://developer.apple.com/documentation/swiftui/canvas.md)

The cross-device contract matters more than identical frame-by-frame animation:

- Both devices know the same task and activity identities.
- Every operation identifies whether it targets the iPhone, the Mac, or another environment.
- The phone can reconstruct current state after suspension.
- Audio forms respond to audio played on that device.
- A pending task remains steerable.
- Closing a surface does not silently terminate the underlying work.

That lets Theo express the same work appropriately on each device.

## What I would prototype first

I would run a small feasibility prototype for **cross-app screen sharing plus voice immediately**, because it resolves the largest uncertainty in the phone concept. The device checks should cover switching apps, microphone input plus spoken output, incoming interruptions, and stopping/reconnecting the session. Apple documents the building blocks; I have not tested Theo’s composition of them on a phone.

In parallel, I would build the first dependable product interaction around **camera/share intake into an existing agent session**. It is useful on its own and exercises the continuity the whole concept depends on.

Then I would add:

1. **Native invocation and task presence:** Action button/Control Center routes, a useful share interface, and a Live Activity for ongoing work.
2. **Phone-side completion:** one real workflow that turns captured context into a saved artifact, calendar item, or other supported result.
3. **Screen-and-voice assistance:** the user-started cross-app session, with clear capture state and recovery.
4. **Desktop viewing and control:** focused live surfaces, the existing action broker, and explicit takeover.
5. **Programmable forms and routines:** integrations that contribute their own meaningful actions and device arrangements.

The experience I would aim to demonstrate is this:

You are away from your desk. You summon Theo, capture something that matters, and talk about it. Theo relates it to the project already underway, performs the phone action it can perform, and gives the larger task to your existing agent. You return to another app while the work continues. When you need to inspect it, Theo becomes a screen into the Mac. You make a correction, hand control back, and keep moving.

That gives the phone version its own purpose: **Theo can accompany the activity you are actually in, while keeping the rest of your agent’s environment within reach.**
