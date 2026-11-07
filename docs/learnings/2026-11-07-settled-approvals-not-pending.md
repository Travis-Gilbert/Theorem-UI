# A settled approval is not a pending action

## Behavior and cause

The SDK's assistant-ui adapter put a human `interrupt` on every
`tool_approval` part. assistant-ui counts any part with an interrupt as a
pending action, so an approval that was declined, expired or replaced kept its
message in `requires-action`. Allow and Deny stayed on offer, and the chat kept
asking for approvals nobody could still give.

## Change

The adapter sets the interrupt only while the approval awaits a decision: status
`requires_action`, `pending`, `open`, or no status yet. That is the set
`ApprovalPart::outcome` reads as awaiting. Every `tool_approval` snapshot, settled
or not, is kept on the tool call's `artifact.theoremApproval`.

`readApproval` reads the approval from that artifact. Its callers are the chat
card, the running indicator, the terminal transcript, the IDE mirror and Kit's
facts. The running indicator now waits only on an awaiting approval, not on any
approval without a decision.

## Packaging ownership

The source change is in Theorem's `packages/theorem-sdk/src/assistant-ui.ts`, on
Theorem PR #952. The UI runs the combined `0.6.0-alpha.3` release, which that
checkout cannot rebuild (see `2026-11-06-send-background-completion-race.md`).
So the same change is carried in the existing Bun patch, in both
`dist/assistant-ui.js` and `dist/assistant-ui.cjs`, until an SDK release
includes it. No package version or dependency changed.

## Validation

- Applied to a pristine extraction of the tarball, the patch gives the
  installed `assistant-ui.js`, `assistant-ui.cjs` and `background-send-retry.cjs`
  byte for byte.
- The UI fixtures for approvals are built with the installed SDK's
  `toAssistantMessages`, not written by hand. With the previous interrupt line
  restored in the installed package,
  `a settled approval is not a pending action the frame or assistant-ui waits on`
  fails. With the patch, it passes.
- `bun test src/lib/kit src/components/ide src/components/chat src/components/terminal`:
  125 pass, 0 fail.
