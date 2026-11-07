# Document-backed App source actions

The artifact header and conversation card treated every artifact as inline content. A `theorem-app` part holds a durable document reference instead, so copying read an empty placeholder and downloading produced an empty file even while the App view had loaded its canonical HTML.

The view and actions now share the existing `AppDocument` owner and save queue. Each copy/download performs a fresh authorized document load, validates canonical content through that owner, and reads saved HTML. A failed read never falls back to cached or inline content. The actions say “Copy App source” and “Download App source”; the download is HTML source, not a standalone export of saved state. Inline artifact formats remain unchanged.

The panel and card use one action component. It disables actions while the read/write is pending, clears stale copy success, and displays the actual document or clipboard error. The clipboard hook retains its existing callers while exposing optional failure reporting and copy-state reset. No new client, parser, or source cache was introduced.

## Verification and action log

1. Reproduced the bug through the real artifact panel with mocked Documents HTTP returning canonical Loro bytes: copy never reached the clipboard; shared download returned an empty placeholder rather than rejecting a failed source read. The existing editor-revision test stayed green.
2. Moved the existing document-owner registry into the SDK module and reused it for source actions. Replaced both panel/card action paths with shared controls.
3. Focused component/owner/clipboard verification: 24 tests pass, including current canonical source, fresh 401/403 refusal after an earlier successful load, clipboard denial, shared card failure, pending actions, missing reference, empty source, and inline MIME/filename preservation.
4. Typecheck and scoped ESLint pass. CRAP scores for changed action/clipboard owners are 3–8 with 100% reported coverage. Dryer at 0.8 reports no duplication. Actual mutation checks killed all 12 artifact-action sites and all 10 selected clipboard change-path sites.
5. The Cloudflare Vite/Nitro production build passes. It reuses unchanged, previously built terminal and Theia assets; no Rust compiler or fresh terminal/IDE build ran.

Private logs and metric receipts are under `/Volumes/SSD Samsung/theorem-chat-search-evidence/app-source-actions-*`. The parent task owns deployment and signed-in clipboard/download acceptance; local tests and compilation do not replace that check.
