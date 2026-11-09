# IDE agent workspace on Devin's structure

Job: someone working with the agent on a project opens the IDE to start or pick up a session, talks to the agent, and reads what it wrote; done when the file the agent wrote (a test report, a skill) is open as a tab beside the conversation.

The user's request, in their words: "the overall design of Devin is pretty decent starting place for an IDE screen", "the SkillMD (Or whatever file the user or agent has open) should just be the top-level tab", "I really like that the test report shows up on the right-hand side, and the actual depiction of the application shows up in the chat window, in line and interactively", and for the sidebar "the session automation review wiki, followed by what looks to be a bolded section for a list of active sessions ... a search and add more toolbar on the right side ... a to-do list section that looks like a user custom made it, and what looks like an auto-generated recent section below that ... no need for us to make an ask section. Also the toolbar in the bottom of the sidebar is a nice touch."

## Before

`evidence/renders/ide-workspace-before@2026-11-08.png`: the rail, then Theia across the sheet, then the agent terminal on the right. The IDE page covers the whole sheet, so the shell's sidebar is gone, and the rail's IDE button toggles Theia's explorer.

## Preserve

1. The domain: Theorem's threads, projects, programs and index, in Theorem's words. Sessions are threads.
2. Stone and every palette, the sheet's gradient, the Life field behind the conversation, Kit.
3. No accent-rail highlights; the existing glide pill marks the selected row.
4. Theia, its own file tabs and its explorer. No wrapper tab or container around an open file.
5. Inline Apps in the conversation, with their explicit Run control.
6. Everything outside the IDE screen: chat, index, spaces, canvas, pages and the Vault keep their panels.

## Problems

| # | Problem | Job step it breaks |
| --- | --- | --- |
| 1 | In IDE mode there is no way to reach another session: the IDE covers the sheet and its sidebar | picking up a session |
| 2 | The conversation is not on the IDE screen; the agent terminal is | talking to the agent |
| 3 | A file the agent names in the conversation cannot be opened from there | reading what it wrote |

## Direction

Session sidebar, conversation in the middle, the work on the right: the user's Devin screens (`refs/devin-workspace-1..5@2026-11-08.webp`), with Mobbin anchors below. The other side, code on the left and chat on the right (Snowflake, Graphite), is not taken because the user asked for Devin's arrangement.

## Moves

| Move | Problem | Roll call | Adds | Removes |
| --- | --- | --- | --- | --- |
| Sessions sidebar: workspace row with search and collapse; Sessions, Automations, Review, Wiki rows; a bold Sessions heading with search, add and more; the user's own sections, then Recent; a toolbar at the foot | 1 | Devin [c05b1f2c](https://mobbin.com/screens/c05b1f2c-f227-41f0-94d1-4c7070049611), Devin [92e0222c](https://mobbin.com/screens/92e0222c-8ba8-4abe-bc18-3ddef5b2e357), Cursor [e6d8892b](https://mobbin.com/screens/e6d8892b-3827-4f6f-a5e3-29df4c382f61), Claude [c66b5013](https://mobbin.com/screens/c66b5013-2e69-4210-995a-77c6dadbea95); foot toolbar Adaline [316d7ed7](https://mobbin.com/screens/316d7ed7-fd9c-42dd-8088-8ab6ca3581ab) | the IDE mode's own panel in the shell sidebar | the IDE page covering the sheet |
| Conversation in the middle, Theia on the right, each open file Theia's own top-level tab | 2 | v0 [3b277566](https://mobbin.com/screens/3b277566-69d7-4d63-9ae3-df982e896119), Google Gemini [7245c1f5](https://mobbin.com/screens/7245c1f5-8c31-4c14-979e-3ec03bc53af2), Google AI Studio [7b4e8430](https://mobbin.com/screens/7b4e8430-808c-4720-a543-2a5a528b940c); file as top-level tab Snowflake [84a91712](https://mobbin.com/screens/84a91712-3c2d-4eec-a1ab-ed4570b8135a) | the coding page's conversation module, with inline Apps running in it | the agent terminal from the page (still behind the rail's terminal toggle and the sidebar foot) |
| A file path in a tool call opens that file in Theia | 3 | Emergent [17d5580f](https://mobbin.com/screens/17d5580f-8268-4fec-a024-64e87a056e65) ("Created /app/auth_testing.md" row); the user's Devin screen 5 (test-report.md card in the chat, open as a tab on the right) | a chip on a tool card naming the file and its lines (`lesson-runner.ts:1-12`); a click opens the file in Theia with those lines selected | nothing |

Data (`sessionLists` in `src/lib/theorem/organization.ts`): the user's sections are projects the user made, in the organization's order; Recent is every other thread, newest first by its last message or, without one, when it began. Review lists threads waiting on a review or an approval. Automations opens programs (`/canvas`), Wiki opens the index (`/index`). Clicking a session keeps the IDE open and switches the conversation to it.

## After

`evidence/renders/ide-workspace-after@2026-11-08.png`: the rail, the sessions sidebar, the conversation with an inline App (Lesson progress bar, at Step 2 of 4) and a Read file card whose chip opened `lesson-runner.ts`, then Theia with `lesson-runner.ts` and `Preview README.md` as its own top-level tabs. Captured against the stub Theorem, which seeds the Lesson player project, the To-do section, six Recent threads, two threads waiting on review, the lesson-player workspace and the App. The before and after board is `evidence/renders/ide-workspace-board.html`, captured as `ide-workspace-board.png`.

## Oracle classes

- static: the IDE screen at 1600x1000 against the stub Theorem, captured in the built-in browser at 2x in quadrants, beside the before image and Devin screen 5 (`evidence/renders/`).
- interaction: the sidebar's Sessions and Review views, a session click that switches the conversation while the IDE stays, the App's Next step and Start over, and the file chip opening its lines in Theia, each checked as a state.

## Since the plan

- Artifacts show in the conversation, not as Theia tabs (5bebf83).
- Markdown opens rendered in its own Theia tab through VS Code's Markdown extension (34573ea).
- The agent terminal stays one toggle away, on the rail and at the sidebar foot.
- An App frame now takes its page's fractional height, so it no longer scrolls by a pixel, and shrinks when the page gets shorter. Both were there before this work.
