# App cards run the saved App inside the conversation

Clicking an App result previously opened the artifact panel and required a second Run App action. The chat card now expands inline and starts the existing DocumentApp renderer on that explicit click. The card remains inert on arrival and history reload. Stop/Run, source editing, selection references, saved state, errors, and sandbox capabilities stay with their existing owners. The separate larger-view button closes the inline frame and opens the existing artifact panel. Documents and other artifacts retain their panel and Follow behavior.

The message card was moved from the mixed message-parts renderer into its own component so its interaction, presentation, and launch behavior have small independently measured owners. No new sandbox, persistence layer, HTML parser, or state protocol was introduced.

## Action log and validation

1. Reproduced the actual registered message renderer: clicking an App did not create an inline frame; the ordinary document-panel control passed.
2. Reused ArtifactBody and DocumentApp with an initial-running flag supplied only by the clicked inline card. The default remains stopped for other views.
3. Verified19 focused tests covering click/start/stop/larger-view, load failures, missing references, arriving Apps staying inert, ordinary document Follow, canonical source actions, state/selection, and source replacement.
4. Changed owners have CRAP2–8 and100percent measured coverage. Dryer found no duplicates at0.8. The unrelated fenced Markdown parser is outside this change and remains above the threshold under this focused suite.
5. Eight behavioral mutations were killed. The first tool run reached original source through Bun realpath imports and produced false survivors; the repeat materialized source/test/config inside each isolated mutation worker, then killed all eight. No mutation touched the shared checkout. Typecheck run during transient mutation overlays was invalidated by those disappearing files and must be repeated after cleanup.
6. Vite/Nitro Cloudflare build passed. Read-only review confirmed shared AppDocument save ownership, current-source refresh, state-only frame lifetime, sandbox and unmount cleanup. Typecheck and scoped ESLint passed after the mutation overlays were removed. Final combined UI checks with the title repair and production/browser acceptance remain pending.

Evidence: `/Volumes/SSD Samsung/theorem-chat-search-evidence/inline-app/`. Browser rendering in the user's screenshot is confirmed; this component suite does not replace production interaction verification.
