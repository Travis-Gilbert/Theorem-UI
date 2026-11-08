# Theorem iOS — Product and Architecture Specification

> The owner's specification v1.0 (2026-11-08), imported as written; only the headings are marked up. It is a proposal, not a record of what works: status for each phase and acceptance item is in `theorem-ios.checklist.json`, and the app is in `mobile/`.

Version: 1.0
Date: November 8, 2026
Status: Proposed specification for implementation planning
Product direction: Expo / React Native, native assistant-ui, a Remux-derived Swift session feature, and contextual WebKit browsing.

This specification records the product direction discussed with Travis. Requirements below describe the intended application; they are not claims that the integrations already work. The evidence and integration gates distinguish existing source from work still required.

## 1. Product objective

Theorem on iPhone should let a person work with Theorem agents, Claude Code, Codex, and other connected agents through a normal conversation interface. They can review incoming work, answer questions, approve supported actions, read and edit project material, and observe or control their Platinum workspace.

The standard experience requires no terminal commands or manual SSH setup. A user pairs a supported execution host, completes the provider’s supported sign-in flow, chooses an agent, and starts a conversation. Terminal and direct SSH access remain available to people who want them.

The same project can include Theorem agents and external agents. They use an explicitly shared context scope and can exchange attributed messages through the harness. The phone is a client of this system; long-running agent execution lives on an execution host.

#### Required product areas

| Area           | Required outcome                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Chat           | Native conversations with Theorem and connected external agents, including structured activity and supported approvals |
| Inbox          | Durable organization of agent messages, questions, approvals, completions, failures, and handoffs                      |
| Browser        | Capable in-app browsing opened contextually from links                                                                 |
| Artifacts      | A dedicated place to find, inspect, use, version, and export agent outputs                                             |
| Markdown notes | Editable project notes with local recovery, synchronization, and revision history                                      |
| Platinum       | A view into paired Platinum workspaces, with observation and explicit control ownership                                |
| Settings       | Accounts, hosts, memory, plugins, skills, preferences, themes, and notification controls                               |

The iOS application must build and run independently of the old TheoremWeb PWA. Its reported lack of a working foundation is an input to this specification. Existing code can be audited for reusable contracts and components; its presence does not establish readiness.

## 2. Architecture decisions

### 2.1 One application, explicit owners

| Layer                   | Owner                                           | Responsibility                                                                                  |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Application shell       | Expo / React Native                             | Navigation, screens, deep links, account presentation, lifecycle coordination                   |
| Conversation interface  | @assistant-ui/react-native                      | Native conversation primitives, composer, message and tool presentation                         |
| Shared client logic     | Theorem client packages                         | Domain types, event reduction, synchronization, command dispatch, assistant-ui adaptation       |
| Durable product state   | Theorem services / harness                      | Canonical conversations, run projections, inbox, context bindings, artifacts, notes, decisions  |
| Provider execution      | Provider runner on the host                     | Provider thread and turn lifecycle, actual tool execution, provider permission semantics        |
| Remote session feature  | Remux-derived Swift code                        | Herdr/tmux session integration, native terminal surface, transport coordination, input handling |
| Local browser           | WebKit through a native view                    | Web navigation, site data, browser lifecycle, narrowly scoped page actions                      |
| Remote Platinum surface | Native media view plus Theorem control protocol | Host-rendered pixels, semantic actions, observation, and control leases                         |

Theorem owns authoritative product state. Provider runtimes remain authoritative about what their processes actually executed. Theorem records and reconciles their events; the interface must not invent success, cancellation, tool results, or provider capabilities.

assistant-ui owns the conversation interface and transient interaction behavior. Web and iOS share Theorem’s headless conversation session, canonical event/message projections, and command semantics through platform-specific assistant-ui bindings. The official native package supplies the native presentation APIs; ExternalStoreRuntime is another documented binding option. [S1, S2]

Begin by validating the existing headless ChatModelAdapter with the native runtime. Select the exact binding during the integration spike: reuse the adapter-backed approach where it preserves the required semantics, or use ExternalStoreRuntime when it better exposes the headless projection. The architectural commitment is shared state semantics and integration logic. Neither binding may introduce another agent execution loop.

Web and iOS share runtime code, data contracts, event reduction, and adapter logic. Each client has its own runtime instance and local cache. A shared JavaScript object cannot span the phone and web browser.

### 2.2 What “Remux as the base” means

Remux supplies the native remote-session foundation. Expo owns the overall application entry point and navigation. Extract a coherent native feature from Remux rather than maintaining two competing navigation systems, account stores, or connection managers.

Swift owns the parts that benefit from Remux’s existing native implementation. React Native owns the application screens and assistant-ui integration. The native feature exposes typed commands, state, and events. Terminal rendering and high-frequency native input stay inside that feature.

Expo supports custom Swift modules and native views through development builds. This application therefore uses an Expo development client and native builds from the beginning. [S3]

The source is an application to adapt, not an installable Remux SDK. Initial work must establish an embeddable feature boundary, build its native dependencies, and verify attachment and lifecycle behavior in an Expo app. Preserve upstream license notices and record the selected source revisions.

### 2.3 PWA relationship

The new mobile client must not depend on TheoremWeb routes, its rendering shell, or its deployment. Share validated domain packages with the current web client where useful.

The PWA can adopt the same contracts and synchronization behavior independently. Capacitor is unnecessary for the selected iOS architecture. The web client and iOS client should converge on domain behavior without requiring identical screen implementations.

### 2.4 Existing code to reuse and reconcile

Theorem’s SDK already contains createHeadlessTheoremChatAdapter around HeadlessConversation, with revision-aware commands, canonical parts, journal observation, and a boundary between durable session behavior and assistant-ui presentation. Its attachment path requires upload IDs through the headless session. The same source currently references web assistant-ui types and browser-style globals; native compatibility needs verification. [S16]

The inspected Theorem-UI runtime uses createTheoremChatAdapter with useLocalRuntime and a remote thread list. It has not yet adopted the newer headless adapter. Share the headless session, contracts, and pure message conversion; implement native runtime bindings and renderers. Reconcile the web client’s vendored SDK with the selected shared version before claiming both clients use an identical implementation. The entire web runtime file is not a portable mobile component. [S17]

The receiver also contains provider event normalization for Claude, Codex, and ACP. Audit and extend those adapters before adding parallel mobile-specific provider logic. The MCP serving documentation describes a scoped, identity-preserving path to the canonical store. These are concrete reuse seams, with end-to-end mobile behavior still unverified. [S18, S19]

## 3. Navigation and device behavior

Use four primary destinations: Chat, Inbox, Library, and Platinum. Library contains distinct Artifacts and Notes sections, each with its own list, detail route, and search behavior. Settings is reachable through the account/profile control.

| Destination        | Main content                               | Key secondary actions                                           |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------- |
| Chat               | Conversations and current run              | Choose recipient, attach material, inspect tools, open terminal |
| Inbox              | Incoming work grouped by project or source | Reply, review, resolve, snooze, archive                         |
| Library: Artifacts | Outputs and applications                   | Preview, inspect versions, export, return to source             |
| Library: Notes     | Markdown documents                         | Edit, search, link, review revisions                            |
| Platinum           | Paired desktops and workspaces             | Observe, approve, take control, return control                  |
| Settings           | Personal and workspace configuration       | Connect accounts, manage context and capabilities               |

The browser is a retained contextual presentation available from every destination. It can expand to full screen and support its own tabs without becoming a primary application tab. A terminal is another contextual session view.

On iPhone, each destination preserves its navigation stack. Returning from a browser, artifact, approval, or terminal restores the prior selection, draft, and reading position. On iPad, use a sidebar and list/detail arrangement when space permits; narrow windows collapse to the selected detail.

Layout changes, keyboard appearance, rotation, and iPad resizing must preserve the selected thread, note cursor, draft, and browser session. This navigation arrangement is a product decision, not an Apple requirement.

Cold-start links retain a pending destination with canonical workspace and object IDs through sign-in and account selection. Resolve current access and object state before navigating. A deleted item, revoked permission, or different workspace gets a specific recovery screen; it must never open an unrelated currently selected conversation.

## 4. Connection and account model

### 4.1 Onboarding paths

A user with an authorized Theorem/cloud workspace can open Chat and use its hosted agents immediately after sign-in. Pairing a personal computer is required only for agents or Platinum workspaces executing there. The app must remain useful without a user-owned desktop.

For a personal Claude Code, Codex, or Platinum host:

1. Sign in to Theorem or select the supported self-hosted workspace.
2. Install or open the host companion and pair it with the phone using a short-lived pairing flow.
3. Name the host and select the project/workspace it exposes.
4. Detect supported agent installations and their versions.
5. Complete provider authentication through the provider’s own supported flow.
6. Show each connected agent’s account label, execution host, and available operations.
7. Open a conversation and send the first message.

The companion should handle host connectivity. Users should not need to know an SSH address, paste shell commands, expose a raw provider server to the internet, or transfer provider credential files.

The phone holds its Theorem and paired-device authorization. Provider credentials stay with the executing provider installation or its supported credential store. Settings distinguishes Unpair device, Disconnect host, and Sign out of provider because they affect different relationships.

Host availability is explicit: online, connecting, offline, sleeping/unreachable, authentication required, or incompatible. A phone cannot continue a host’s execution if that host is asleep or unavailable. The application must say where work is running.

### 4.2 Provider modes

| Connection                   | Execution and authentication                                       | Intended adapter                                                    |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Theorem agent                | Existing Theorem runner and workspace authorization                | Theorem run/event API                                               |
| Codex on your computer       | Paired host, provider-managed ChatGPT or API-key authentication    | Codex app-server                                                    |
| Claude Code on your computer | Unmodified Claude Code on the paired host; its own supported login | Supported structured CLI/session interface and permission mechanism |
| Hosted Claude agent          | Supported API credentials or cloud-provider authentication         | Claude Agent SDK or established Theorem provider adapter            |
| Existing unmanaged session   | A session discovered through Herdr/tmux                            | Native terminal access until structured attachment is verified      |

Codex app-server provides structured conversation and approval interfaces, including provider-managed login. Prefer a local stdio or Unix-socket connection between the runner and host broker. Its documented TCP WebSocket transport is experimental; exposing it directly is not the standard phone connection. Generate bindings from the selected binary version. [S7, S8]

For Claude Code, current documentation permits running the unmodified binary for users under specified conditions, with users authenticating through supported methods. It separately restricts third-party handling of Claude.ai credentials. Personal-host mode therefore completes sign-in in Claude Code’s own flow; a general Theorem-hosted agent uses the supported product authentication path. Current subscription billing guidance must not be mistaken for permission to intermediate credentials. [S9, S10]

These are separate connection modes with distinct billing descriptions. The interface must not imply that a subscription connection and API-key usage have interchangeable costs or limits.

### 4.3 Structured capability discovery

Each adapter advertises supported operations, including text streaming, attachments, history, resume, interruption, steering, tool approvals, questions, artifact references, terminal attachment, and usage reporting.

Unsupported controls remain unavailable with an understandable explanation. Do not build the normal chat transcript by scraping terminal colors or guessing approval requests from screen text.

An existing terminal session may not support structured adoption. Offer the native session view, or an explicit supported resume/handoff operation. Do not silently start a second agent process against the same work and present it as the original run.

## 5. Chat specification

A conversation header identifies the project, recipient, provider account, and execution host. The composer makes its recipient clear when more than one agent participates.

The transcript supports user and agent messages, attachments, tool activity, questions, approval cards, artifact references, errors, interruptions, and completion summaries. Preserve provider identifiers and original event provenance underneath normalized presentation.

Attachments use system file/photo acquisition where supported, with upload progress, cancellation, failure/retry, and understandable type/size limits. A completed upload produces a durable reference. The selected provider adapter must resolve that reference to content accessible on its execution host before sending the turn. Unsupported content remains visibly unsent. Retrying an upload or send must preserve message and command identity.

Use progressive disclosure for tool details. The primary transcript should make the current task and next required action easy to understand. Technical arguments, receipts, logs, and terminal access belong in details that remain readily available.

The following are distinct operations:

• Closing a view detaches that viewer.
• Stopping generation requests an adapter-supported interruption.
• Cancelling a run requests cancellation of the run and its owned work.
• Disconnecting a host changes connectivity.
• Ending a provider session follows the provider’s supported lifecycle.

The UI waits for acknowledgment and shows pending or failed requests. Dismissal must not masquerade as cancellation.

The native runtime binding must explicitly separate view disposal from run interruption. The existing model adapter maps an abort signal to a session stop; do not let a navigation unmount or background cleanup accidentally trigger that behavior. Verify detach and stop as separate paths. [S16]

Sessions and provider changes

A Theorem conversation can contain multiple attributed participants, but each external provider session retains its own identity. Switching the composer from Claude Code to Codex must mean one of:

• Address another existing participant.
• Start a linked provider session.
• Hand off a task with selected context.

It must not relabel Claude’s stored history as Codex’s native session. Cross-provider history is a Theorem projection; provider continuation remains adapter-specific.

Drafts and attachment selections persist locally. Sending creates an idempotent command and an optimistic pending message. The server receipt reconciles that message with its canonical ID. A retry must not produce an additional run when the first request succeeded but its response was lost.

Persist Theorem command admission and correlation before dispatching to a provider. A provider operation is not automatically idempotent: after an uncertain submission, reconcile provider state before retrying. If the outcome cannot be established, show an unknown-outcome state and require resolution instead of automatically starting another run.

Where the provider exposes reasoning summaries or other displayable content, preserve its supplied type. Do not fabricate hidden reasoning or infer tool execution from ordinary prose.

## 6. Shared context and agent collaboration

Harness MCP access provides common tools and a path to shared knowledge. Theorem must also bind every participant to the correct project, permissions, and context revision.

A ContextBinding records:

• Tenant/workspace and project identity.
• Agent identity and the provider session mapping.
• Authorized memory, document, artifact, and repository scopes.
• Relevant revisions or snapshot references.
• Applicable skills, plugins, and instruction configuration.
• Retrieval policy and provenance for supplied context.

This produces a shared source of context. It does not guarantee identical model context windows, identical retrieval choices, or identical private provider history.

Collaboration contract

Agents exchange messages through an addressable harness service. Each message carries sender, recipient, originating session/run, correlation ID, context references, and delivery state. Incoming messages can appear in the recipient’s conversation and in the user’s inbox according to their significance.

The sender publishes a result or reference; the recipient retrieves it through its authorized context binding. Do not rely on an agent having silently read another provider’s terminal or private memory.

Routing must prevent duplicate delivery and uncontrolled reply loops. Track lineage, cancellation, and orchestration budgets at the harness layer. User-facing messages distinguish agent delegation, an agent asking the user, and completion of delegated work.

When a user adds a note or artifact to shared context, show its scope and revision. A revocation affects future authorized access; it must not claim to erase material already delivered into an external provider’s history.

## 7. Inbox specification

The inbox is durable product data. Remux semantic notifications are one source, alongside Theorem events, structured provider events, and Platinum activity.

The inspected Remux code exposes attention/completion-style semantic notifications with session context. Those notifications do not by themselves provide a durable inbox or a complete provider approval model. [S4]

Item model and organization

An inbox item references its original message/event, project, source agent, provider account, host, session/run, item type, creation time, read state, action state, and destination.

Start with filters for Needs you, Replies, Completed, Errors, and All. Support grouping by project, agent, account, and host. Include search, archive, snooze, and organizational labels.

Read state and action state are independent. Reading an approval does not approve it. Archiving a question does not answer it. A resolved action can remain unread.

Create items for meaningful transitions and incoming messages. Streaming tokens and routine progress updates update existing activity rather than creating inbox noise.

Delivery and action behavior

The host or service ingests and persists events before publishing inbox updates. APNs is a delivery hint; opening a notification retrieves current authoritative state. Notification payloads should use configurable previews and durable identifiers.

Native callbacks received only while the phone is connected cannot satisfy closed-app delivery. If a Remux event is currently phone-only, add host-side collection or expose the equivalent provider/harness event.

Deduplicate using stable source identity and event identity. Include the source process/boot epoch where sequence numbers can restart. A reconnect must not generate a second “completed” item for the same completion.

A reply opens the originating conversation with the recipient preserved. Approvals reference the actual pending provider request. The server validates that it is still pending and that the answer is authorized. The first valid decision wins; all clients receive its acceptance and delivery-state updates.

Separate acceptance of the user’s decision from confirmation by the provider. Track pending, decision accepted, delivery pending, provider acknowledged, expired, and failed states as applicable. Theorem admits one authorized answer; the UI reports successful provider resolution only after acknowledgment or verified reconciliation. A host disconnect during delivery must preserve the decision without falsely reporting success or repeating the underlying action.

A generic “needs attention” signal opens session context. It must not be promoted into an approval card without a real actionable request.

## 8. Contextual browser

Use a real local WebKit browser surface, initially through react-native-webview with a narrow Swift extension where required. Expo documents this component as native-hosted web content. [S5]

Required browser behavior:

• Back, Forward, Reload/Stop, title, and an inspectable address/origin.
• Retained sessions and tab switching within the contextual browser.
• Expand to full screen and return to the originating application screen.
• Share, copy link, open externally, find in page, and standard file/download handling.
• Explicit Theorem actions: Ask about page, Attach page reference, Save to project, and Create note.

Capture actions record URL, title, capture time, selected text or permitted page content, and source context. The user chooses when browser content becomes agent context. Do not silently ingest every visited page.

Keep browser site data separate from provider credentials and artifact execution. A page being signed in locally does not mean the remote Platinum browser or a server-side fetch has that same session.

Authentication uses the provider’s supported browser/system flow. ASWebAuthenticationSession is available for appropriate web-service authentication; it is separate from arbitrary browsing and does not turn a host-side provider callback into a phone callback automatically. [S6]

Browser pages must not receive a general bridge to the harness. Define narrowly scoped, origin-checked messages for specific application features. External links and unsupported schemes route through explicit platform handling.

A minimized browser session may be restored from persisted navigation metadata after process termination; the product must not promise to preserve every website’s unsaved form state.

## 9. Artifacts

Artifacts are versioned outputs associated with projects and originating runs. The same artifact identity should resolve from Chat, Inbox, Library, and Platinum.

Each artifact includes content type, revision, producing agent/run, creation time, storage reference, available viewers, and supported actions. Preserve provenance and distinguish a fixed output from a live application preview.

Provide previews for the initial supported set: Markdown/text, images, PDFs, code/diffs, downloadable files, and explicitly supported web artifacts. Use native viewers where suitable and a separately configured WebKit surface for interactive web content.

A web artifact may expose declared typed actions through a restricted bridge. Arbitrary browsing content receives no artifact privileges. Artifact rendering errors show an explanation and an export/open alternative rather than a blank panel.

The artifact page supports version selection, share/export, project organization, and return to the originating conversation. Access to an older version must remain explicit when the current version changes.

Saving an artifact does not duplicate its identity. Creating a note from it creates a linked editable document with the source artifact revision recorded.

## 10. Markdown notes

Markdown is the canonical note content. Begin with a dependable text-editing mode and a rendered reading mode, plus formatting actions for headings, lists, tasks, links, and attachments. A richer editor can be added after its mobile selection, keyboard, and recovery behavior is proven.

Notes support project organization, search, links to conversations/artifacts, local autosave, server synchronization, revision history, import, and export. Embedded assets use durable references.

Every note edit records its base revision. The client persists unsent edits locally and shows saved locally, syncing, synced, or conflict status. Closing the application or losing connectivity must not discard an acknowledged local save.

Concurrent edits require reconciliation. Preserve both versions when an automatic merge is unsafe; do not use silent last-write-wins to discard a user’s work. A collaborative editor is an additional requirement, not something to assume from plain Markdown storage.

Agent modifications arrive as proposed changes against a specific base revision. The user can inspect the diff and apply it if it still matches. If the user edited the note meanwhile, reconcile the proposal before applying it.

A note can be included in shared context at a selected scope. Editing it creates a new revision; active runs need explicit refresh or retrieval behavior rather than an assumption that their existing prompts changed.

## 11. Platinum workspace view

Platinum is a dedicated destination for paired desktop workspaces. It shows host availability, selected workspace, current task, active surface, and whether the phone is observing or controlling.

Deliver this in two increments:

1. Semantic workspace status, native actions, approval handling, and a supported remote browser surface.
2. An actual view of the Platinum application/workspace, including host capture and supported input control.

The second increment is part of the requested product. Browser-only remote rendering does not satisfy the full Platinum app-view requirement.

The existing Theorem remote-surface contract contains observation and control concepts, while its current mobile path is restricted to browser surfaces. Extending it to a Platinum application surface requires contract and host implementation work. Treat source-level definitions as reusable design work, not proof of a working remote application viewer. [S14]

Observation and control

Map product wording onto the existing canonical states: Observe, Approve, TakeOver, and ReturnToAgent. Reuse the canonical contract where compatible.

A host-side arbiter grants one active input owner per controlled surface. A control lease identifies the surface, holder, expiry, and generation. Commands carry the current lease and are rejected after revocation or expiry. The desktop user can preempt phone or agent input.

The phone visibly shows the host, surface, connection state, and current owner. Entering control requires acknowledgment. TakeOver blocks agent input to that surface and marks the agent as waiting for control; it does not cancel the whole agent run. ReturnToAgent permits agent input only after the host acknowledges the transfer.

Leaving control, backgrounding, or switching surfaces attempts immediate release. Loss of renewal expires the lease at the host. Initial control-mode parameters are a three-second renewal interval and expiry ten seconds after the last accepted renewal, to be verified and tuned on real networks. After reconnect, return to Observe until a new takeover is acknowledged. The host uses its own expiry clock and rejects commands from older lease generations.

Never replay queued pointer or keyboard input after reconnect. Pointer movement may be coalesced; ordered key/button transitions require reliable handling, including release of held inputs on disconnect.

Use WebRTC for the pixel/media path if confirmed by the host implementation. LiveKit is a viable initial choice with an official Expo integration; its SDK availability does not supply desktop capture or ownership arbitration. [S13]

Keep semantic controls and readable activity alongside video. A streamed screen alone is not an accessible interface. The local WebKit browser and a remote Platinum browser remain visibly distinct because they have different execution and authentication state.

## 12. Settings

Settings is a functional management surface, with scope and effect visible for each change.

| Section            | Required behavior                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Accounts and hosts | Pair/unpair, connection health, provider sign-in status, account labels, supported versions and operations               |
| Memory             | Inspect Theorem-managed memory, provenance and scope; edit, exclude, delete, and understand which agents can retrieve it |
| Plugins and MCP    | List capabilities, enabled scope, execution location, required access, connection health, and configuration              |
| Skills             | Inspect source/version, enable by workspace or agent, edit where supported, and show effective runner configuration      |
| Preferences        | Default agent/host, composer behavior, browser behavior, artifact opening, editor behavior                               |
| Appearance         | System/light/dark themes, text settings, shared semantic color tokens, terminal appearance                               |
| Notifications      | Category controls, previews, project/agent preferences, quiet periods, permission status                                 |
| Data and recovery  | Export supported user data, manage local downloads/cache, recover drafts, inspect sync problems                          |

Memory management only claims authority over data Theorem can actually manage. Deleting a Theorem memory item must not claim to delete a provider’s separate memory or previously supplied conversation content.

Plugins and skills need an execution location. A server capability, a host-side agent plugin, an interactive web artifact, and native app code are different deployment mechanisms. Settings must not imply that downloading a plugin adds arbitrary new native Swift code to an installed app.

Configuration changes have a visible effective state: applied, awaiting restart/new session, unsupported, or failed. Do not show a switch as successful before the relevant runner acknowledges it.

## 13. Data contracts and synchronization

Reuse canonical Theorem models where they already cover the requirement. The following names describe logical responsibilities and must not create duplicate competing models.

| Contract            | Essential identity and semantics                                                       |
| ------------------- | -------------------------------------------------------------------------------------- |
| Project / workspace | Tenant, project, access scope, selected context                                        |
| Conversation        | Canonical thread, participants, message references, linked provider sessions           |
| AgentSession        | Provider, account connection, execution host, external session/thread ID, capabilities |
| Run / turn          | Theorem run, provider turn, lifecycle, parent/child lineage, cancellation              |
| Message content     | Stable message ID, sender, typed parts, attachment/artifact references, provenance     |
| ContextBinding      | Authorized scope, context revisions, instructions, retrieval policy                    |
| InboxItem           | Source event/message, grouping, read state, resolution, deep link                      |
| Approval / question | Provider request identity, proposed action, permitted answers, expiry, resolution      |
| Artifact revision   | Durable content identity, type, source run, version, viewer capabilities               |
| Note revision       | Canonical Markdown, base revision, author, assets, edit provenance                     |
| RemoteSurface       | Host, surface kind, current state, capability set, control lease                       |
| DeviceConnection    | Pairing identity, grants, revocation, last known connectivity                          |
| BrowserSession      | Device-local tabs/navigation plus explicit saved page references                       |

Command and event path

The phone sends authenticated commands to Theorem. A host broker dispatches supported provider operations and persists their receipts/events. Clients consume snapshots and incremental updates to construct local projections.

Commands carry idempotency and correlation identifiers. Events carry canonical identity, origin identity, source epoch where applicable, ordering information, and schema version. Use an authoritative durable cursor for resume; timestamp ordering alone is insufficient.

Reconnect begins with cursor validation. Apply a retained event tail when valid; otherwise fetch a fresh snapshot and continue from its cursor. Do not infer missing state from terminal screenshots.

Keep synchronization semantics shared between web and iOS. Native assistant-ui receives the resulting projection through its adapter. Its callbacks dispatch commands rather than mutate an unrelated second conversation store.

The host broker is a responsibility within the Theorem/Herdr integration. Reuse an existing service where it already supplies that responsibility; this specification does not require an additional independent product backend.

## 14. Native feature and transport boundaries

Remux integration

The inspected Remux source has separate Herdr discovery, a remote-client bridge, a native screen model, and semantic notification messages. It also contains a tmux path. Retain these separations when extracting the feature. [S4]

Its Herdr endpoint is a versioned binary bridge; current herdr-core documents a different connection/framing model. Establish a matched version pair or implement an explicit adapter. Do not treat “supports Herdr” as proof that every Herdr release uses the same wire protocol. [S4, S12]

The initial integration spike must record the exact Remux, Herdr, native dependency, Expo, React Native, and assistant-ui versions. Validate:

• Build and native-view hosting.
• Session discovery and attachment.
• Input, resizing, background/resume, and host restart.
• Native notification mapping.
• Disconnect without unintended provider termination.
• A transport abstraction suitable for the default paired-host connection.

The standard phone connection uses authenticated Theorem connectivity to the paired host. A host-side driver can open the selected Herdr bridge and carry its stream through that connection. Supporting this carrier in Remux is adaptation work to prove. Direct SSH can retain its existing native transport as an advanced option.

Bridge policy

Expose high-level attach/detach, focus, view lifecycle, and session-state operations to React Native. Keep native rendering, frame/terminal parsing, bounded buffers, and high-frequency input within the native feature.

Bridge semantic notifications and state changes with stable IDs. Avoid shuttling every terminal byte through React state. Ensure only one owner controls the underlying session connection, renderer, and input path.

Product commands, terminal transport, and remote video may use different network channels. They must resolve to the same authorized host/session identity. One universal transport is not a goal.

## 15. Offline, suspension, and recovery

iOS background execution is constrained; a foreground socket is not a guarantee of continuous execution after suspension. Design around durable host execution, persisted events, push notifications, and state recovery. [S11]

| Situation                       | Required behavior                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Phone loses connectivity        | Keep readable cached state and drafts; show stale/offline status; do not claim a run stopped     |
| Application is suspended        | Host-owned runs continue where the host supports them; preserve state for reconnect              |
| Application is terminated       | Restore locally saved drafts/notes and reconcile server state after launch                       |
| Host goes offline               | Show last confirmed state and host availability; distinguish unknown from completed              |
| Provider login expires          | Preserve history; block only affected operations; expose supported sign-in recovery              |
| Duplicate event delivery        | Apply once by identity; do not duplicate transcript or inbox entries                             |
| Cursor is no longer retained    | Resnapshot and resume without reissuing already accepted commands                                |
| Approval resolved elsewhere     | Update its status and disable stale responses                                                    |
| Note edited on two clients      | Merge safely or preserve both revisions for reconciliation                                       |
| Remote-control connection drops | Expire/revoke control and discard stale input                                                    |
| Provider protocol mismatch      | Show compatibility failure and supported recovery; do not parse arbitrary output as valid events |

Safe local edits may queue for synchronization. Agent messages can remain drafts or explicit pending sends. Approvals, destructive actions, and remote input must not be blindly replayed from an offline queue.

Notifications are not the sole record of incoming work. When push permission is declined or a notification is missed, the inbox still reconciles when the app opens.

## 16. Accessibility, performance, and quality

Support Dynamic Type, VoiceOver semantics, reduced motion, contrast, keyboard navigation, and readable state labels. Native controls do not automatically make custom transcripts, terminals, or streamed surfaces accessible. Apple’s guidance supports evaluating each of these interaction paths. [S15]

Required behavior includes:

• Composer and approval controls stay reachable above the keyboard.
• Large text does not hide the recipient, action meaning, or resolution state.
• Streaming messages do not repeatedly steal VoiceOver focus.
• Connection and run status use text or symbols as well as color.
• Browser and artifact boundaries remain understandable to assistive technology.
• Remote pixels have semantic alternatives for supported operations.
• Hardware keyboard users can navigate, compose, and leave remote-control mode.

Measure on physical iPhones using release-like builds. Verify the universal application on an actual iPad as well, including narrow-window navigation, keyboard appearance, native terminal/media resizing, and preserved selection. Exercise a long conversation, frequent streamed tool events, attachment previews, concurrent inbox updates, keyboard transitions, and the native terminal/media surface.

Set numeric performance budgets after the first measured slice. Instrument rendering stalls, event backlog, reconnect duration, local-save latency, memory growth, and crash recovery. Do not infer app quality from a framework label or an unloaded demo.

## 17. Proposed module boundaries

These are logical package responsibilities, not claims that these exact folders already exist.

| Module                    | Scope                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| Mobile app                | Expo shell, routes, native screen composition, lifecycle                          |
| Theorem client contracts  | Generated/shared domain and API types                                             |
| Theorem client state      | Event reduction, snapshots, cache, synchronization, commands                      |
| Assistant runtime adapter | Shared conversion and callback semantics; platform-specific imports               |
| Remux native feature      | Swift integration, session views, transport coordination                          |
| Browser feature           | Local WebKit sessions, navigation and explicit capture                            |
| Library feature           | Artifact viewers, Markdown notes, local edit recovery                             |
| Platinum feature          | Workspace selection, semantic actions, native media, lease presentation           |
| Host integration          | Pairing, provider adapters, Herdr carrier, event persistence, control arbitration |
| Notification delivery     | Inbox projection, APNs delivery, preference application                           |

A shared runtime package must not import DOM-only web primitives into the native bundle. Choose the platform distribution at the app boundary. Existing web-specific rich editors, browser assumptions, and loaders need separate evaluation.

The implementation plan should map these responsibilities to the actual repositories after a focused audit. Do not create duplicate SDKs or rename existing canonical contracts solely to match this table.

## 18. Build sequence and exit criteria

### Phase 0 — Prove the integration boundaries

Build a minimal Expo development client with native assistant-ui and one embedded Remux-derived view. Pin versions. Verify a real Herdr session. Separately prove structured Codex and Claude Code communication, official authentication paths, and a tool permission round trip.

Audit the existing headless SDK and receiver adapters first. Validate platform globals, attachment uploads, native package imports, and view-detach versus explicit-stop behavior. Record the current web SDK version and the shared version selected for mobile. Select the adapter-backed or external-store binding against the same recovery and command semantics. Configure universal-device targeting and verify native-view resizing on iPad; Remux’s existing iPhone target alone does not establish iPad support.

Exit: evidence for each provider’s supported operations, a matched Remux/Herdr pair, and a native view that survives attach/detach and background/resume. Document unsupported features rather than filling them with terminal guesses.

### Phase 1 — Complete the first conversation

Implement pairing, one project, connected-agent selection, canonical session mapping, streaming chat, supported approvals, stop behavior, local drafts, and snapshot/event recovery. Codex is a sensible first adapter because its app-server directly targets rich clients; complete Claude Code before claiming the two-account product.

Exit: pair host, sign in, send a message and a file from a physical device, approve a tool, background the phone, and return to the same recorded run without using terminal or SSH controls. Exercise a lost acknowledgment and host interruption around turn submission; recovery must reconcile the outcome without duplicate execution. A hosted Theorem conversation also works without pairing a desktop.

### Phase 2 — Shared context and inbox

Add context bindings, harness MCP configuration, attributed agent messaging, durable inbox projections, notification delivery, deduplication, and cross-device action resolution.

Exit: Claude Code and Codex use the authorized project material, exchange an attributed handoff, and deliver actionable incoming work while the phone is closed.

### Phase 3 — Browser, artifacts, and notes

Add contextual browsing, explicit page capture, artifact identities/viewers, Markdown editing, local recovery, revision sync, search, and conflict handling.

Exit: open a chat link, create a linked note, attach it to a run, inspect the resulting artifact, and recover offline edits after termination.

### Phase 4 — Complete the Remux session feature

Finish native session discovery, terminal attachment, session actions, keyboard handling, notification mapping, and the optional direct SSH flow. Ensure the default chat experience retains its simpler onboarding.

Exit: a supported remote session can be inspected and controlled natively without duplicate process ownership or loss of chat state.

### Phase 5 — Platinum workspace access

Deliver semantic controls and the supported browser surface, then extend the host and contract for the actual Platinum application view. Implement capture, media transport, control arbitration, acknowledgement, and reconnect behavior.

Exit: observe the real paired workspace, take control, let the desktop user preempt it, and reconnect without stale input. A browser-only demonstration is insufficient for the full app-view milestone.

### Phase 6 — Settings and release quality

Complete management actions, effective configuration status, accessibility verification, physical-device performance checks, recovery behavior, and distribution requirements for the actual delivered capabilities.

Exit: settings change real underlying configuration, native feature dependencies reproduce in a clean build, and the full acceptance matrix passes on supported devices.

No calendar estimate is assigned before Phase 0. Its findings determine whether the native extraction, account adapters, and host carrier are small integrations or substantial refactors.

## 19. Acceptance matrix

| ID  | Scenario                                 | Pass condition                                                                                                          |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A01 | New user connects Codex                  | Pairing and supported sign-in reach native chat without terminal/SSH configuration                                      |
| A02 | New user connects Claude Code            | Official host-side authentication reaches structured chat; personal and hosted billing modes are distinguishable        |
| A03 | Two providers in one project             | Both remain independently identified; selected shared context has visible scope and provenance                          |
| A04 | Agent-to-agent handoff                   | Sender, recipient, lineage, and context references persist; retries do not duplicate delivery                           |
| A05 | Phone background/termination             | Host run state and local drafts reconcile without a duplicate run                                                       |
| A06 | Inbox delivery                           | Meaningful incoming work persists while the phone is closed and appears after missed push                               |
| A07 | Approval race                            | A decision from one client resolves the request; a stale second response cannot re-execute it                           |
| A08 | Remux attention event                    | It opens the correct session and only shows approval controls when an actual request exists                             |
| A09 | Browser round trip                       | Link navigation and return preserve the chat draft and browser session                                                  |
| A10 | Page capture                             | Agent context is added explicitly with origin and capture metadata                                                      |
| A11 | Artifact navigation                      | Chat, Inbox, and Library resolve the same artifact and selected revision                                                |
| A12 | Offline note recovery                    | Saved local edits survive termination and sync without silent data loss                                                 |
| A13 | Agent note change                        | A stale proposal cannot overwrite a newer human revision                                                                |
| A14 | Native session integration               | Attach/input/resize/reconnect work with the pinned Herdr version and one connection owner                               |
| A15 | Platinum observation/control             | Actual host surface is shown; takeover is acknowledged; local preemption and expiry work                                |
| A16 | Lost remote connection                   | Stale input is discarded and held input state is released                                                               |
| A17 | Accessibility                            | Key tasks work with large text, VoiceOver, reduced motion, and hardware keyboard                                        |
| A18 | Independent client                       | The app runs without TheoremWeb/PWA routes or deployment                                                                |
| A19 | Settings correctness                     | Changes show actual scope and effective runner state; failed changes remain visible                                     |
| A20 | Account/host failure                     | Revoked auth, sleeping host, and incompatible versions yield accurate recovery paths                                    |
| A21 | Uncertain provider submission            | Lost acknowledgment or broker restart triggers reconciliation; unresolved outcome cannot silently launch duplicate work |
| A22 | Hosted agent without desktop             | An authorized user opens a cloud/Theorem conversation without installing a personal host companion                      |
| A23 | Notification during signed-out launch    | Sign-in and workspace selection preserve the destination and open the correct current source item                       |
| A24 | Approval accepted while host disconnects | Decision and delivery states remain distinct; reconnect reconciles acknowledgment without repeating the action          |
| A25 | File attachment from phone               | Upload and provider access succeed, failures are visible, and retries preserve message/run identity                     |
| A26 | Adaptive iPad build                      | Universal target and native views handle narrow windows, keyboard changes, and resizing without losing selection        |

## 20. Evidence, limits, and remaining decisions

#### What is established

The native assistant-ui distribution, external-store integration, Expo native module workflow, WebKit embedding, and LiveKit Expo integration are documented capabilities. Remux contains actual native Herdr/session work, including discovery and semantic notifications. Codex and Claude expose structured integration surfaces. These facts support the selected direction.

#### What remains to prove

The full combination has not been built or tested in this work. Remux extraction into Expo, exact Herdr protocol compatibility, provider permission/session recovery, closed-app inbox ingestion, and the Platinum application capture/control path require implementation evidence.

The provisional deployment floor is iOS 18, matching the inspected Remux project; confirm it against the selected native dependencies during Phase 0. iPad uses the same application with adaptive layouts. Android is a future portability consideration, not an implied promise that the Remux Swift feature is cross-platform.

Existing Theorem mobile and remote-surface code is candidate reuse. The old TheoremWeb client is not a release dependency. Any existing draft architecture that limited mobile to approvals or browser-only access is superseded by the broader product goals here, while its validated contracts may remain useful.

Before implementation, record exact repository ownership, dependency revisions, supported host platforms, and which provider authentication modes pass the real vertical slice. These are technical resolution tasks; they do not require re-deciding the overall product direction.

#### Source register

Sources were reviewed for this specification on November 8, 2026. Repository links use moving branches and should be pinned to commits in the implementation plan. References support the capability/evidence statements; the product requirements above are proposed design decisions.

• S1 — assistant-ui native: Installation and native scaffold.
• S2 — assistant-ui state integration: ExternalStoreRuntime.
• S3 — Expo native integration: Add custom native code.
• S4 — Remux source: Repository, architecture, HerdrBridge.swift, HerdrWire.swift, HerdrSessionDiscovery.swift, HerdrScreenModel.swift, HerdrServerMessage.swift, project.yml.
• S5 — Expo WebView: react-native-webview.
• S6 — Apple authentication: ASWebAuthenticationSession.
• S7 — Codex structured client: Codex app-server. Read-only local app-server help was also checked.
• S8 — Codex authentication: Authentication.
• S9 — Claude Code product/authentication conditions: Legal and compliance.
• S10 — Claude programmatic use: Programmatic CLI, current plan billing guidance.
• S11 — iOS background execution: Extending background execution, finite background-task API.
• S12 — Herdr core: Repository and connection model, schema documentation.
• S13 — Native media option: LiveKit Expo quickstart.
• S14 — Existing Theorem contracts: Mobile API projections, remote-surface contract, earlier mobile architecture draft.
• S15 — Apple accessibility guidance: Accessibility.
• S16 — Theorem headless adapter: SDK assistant-ui integration.
• S17 — Current web binding: Theorem-UI runtime at inspected commit.
• S18 — Provider event normalization: Receiver product event bridge.
• S19 — Harness MCP scope: MCP serving architecture.
