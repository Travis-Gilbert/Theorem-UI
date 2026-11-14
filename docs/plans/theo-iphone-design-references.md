# Theo iPhone: design references

The owner chose four iOS apps as references for the Theo phone app. Each one
answers a different question:

| App | What it shapes |
|---|---|
| Linear | The baseline: layout, navigation, lists, detail pages, and how screens compose. It has the most influence. |
| Claude | Talking with the agent: the conversation, the composer, attachments, the conversation list. |
| Cursor | Anything about code: agent runs that change files, change summaries, diffs. |
| Obsidian | Notes in Library: the editor, finding a note, properties. |

All references are iOS screens on Mobbin, cited by link. This file describes
the patterns in our own words. Do not copy the screenshots into the repo.
Where a pattern conflicts with `mobile/AGENTS.md` (native first, show only
confirmed state, detach is never stop), `AGENTS.md` wins.

## Linear: the baseline

Linear is a set of a few row and page types reused everywhere. That reuse is
the point: it is the composable structure the phone plan already calls for.

**Navigation.** The tab bar floats as a rounded pill with a separate round
search button beside it. A chevron at the end of the tab bar opens the full
destination list, and a Customize sheet reorders the tabs or hides them. Any
project can be pinned to the tab bar from its menu.
- Inbox with the floating tab bar: https://mobbin.com/screens/f97b18e7-5e86-42f2-85df-9e7a000fae0e
- Expanded destination list: https://mobbin.com/screens/0248e978-f201-4ecc-b2aa-19ff8c38e2e5
- Customize sheet: https://mobbin.com/screens/f08232c6-e28c-44ae-b0dc-df227339d0f2
- Project menu with "Pin project to tab bar": https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690

**Page header.** Each page has a large left-aligned title and one or two round
glass buttons at the top right (compose and more). There is no filled header
band. Filters such as Assigned, Created and Subscribed sit under the title as
plain segmented text.
- My issues with tabs under the title: https://mobbin.com/screens/da5b1f34-e51d-45c9-90aa-ba08e5684afa

**Rows.** Rows are flat, with no cards. Each row has a leading status glyph, a
one-line title, and a trailing avatar. Inbox rows add an actor-and-action line,
a time, and an unread dot. Groups have a small header (In Progress, Todo,
Backlog) with a + to add to that group.
- Inbox rows: https://mobbin.com/screens/58a6ef8a-408a-4ce7-90d5-08033f7c5a47
- Inbox in dark mode: https://mobbin.com/screens/22608a29-8c0c-4417-8eb6-d40ab684a3d3
- Grouped by status: https://mobbin.com/screens/f8a9de1f-ef1c-45e6-8db3-9239bdd5c690

**Display options.** A bottom sheet changes how a list is built: grouping,
ordering, whether completed items show, title length in lines, and which row
properties appear (as toggle chips). This is the model for making Theo's lists
composable without a new screen per variant.
- Display options sheet: https://mobbin.com/screens/f02d53ae-347f-46d6-9ce4-96063f4edc90
- Grouping by status: https://mobbin.com/screens/d94d16a0-e93a-46e0-89a1-84d621b17d19

**Detail page.** The detail page has a small identifier, a large title, and a
wrapped row of property chips (status, assignee, labels, project, date) with a
+ for more. Below come the description, a collapsible sub-items box, and an
Activity timeline that collapses older items behind "Show N activity items".
A bottom bar holds a round action button, a "+ Comment" field and search.
- Detail with chips, sub-issues and activity: https://mobbin.com/screens/ed788cb0-3715-4383-9cbd-783d2a55bdf8
- Detail with collapsed activity and attachment: https://mobbin.com/screens/f03367b0-cbbe-497c-bfc5-4479a5ed4fd1

**Feedback.** Destructive or reversible actions show a dark toast near the
bottom, with Undo when the action can be undone.
- Snooze toast with Undo: https://mobbin.com/screens/3d9ccfd8-2425-49e9-a00b-27189140d3a3
- Deleted toast: https://mobbin.com/screens/da5b1f34-e51d-45c9-90aa-ba08e5684afa

**Search and empty states.** Search opens with "Recently viewed" and puts the
field at the bottom, above the keyboard. Empty pages show one icon, one line,
and the page's + menu.
- Search with recently viewed: https://mobbin.com/screens/e9b4ccc3-e76f-4594-acc4-1a43828e8e39
- Projects empty state: https://mobbin.com/screens/ef1daee0-b523-462c-b3dc-851c18af385a

## Claude: talking with the agent

**Conversation.** Round glass buttons float over the content at the top: the
conversation list on the left, new chat and more on the right. A small title
pill shows which project the chat belongs to. The agent's reply is full-width
text with no bubble. The user's message is a right-aligned bubble. Under each
reply sits a quiet row of icon actions: copy, share, retry, rate.
- Dark conversation with project pill: https://mobbin.com/screens/ed3e4d7f-e3e5-44e8-a0ad-649a958ce5fa
- Light conversation with action row: https://mobbin.com/screens/d2824d70-82e1-43d2-8610-83eb95917bdd

**Composer.** The composer is a rounded card pinned to the bottom. The text
comes first, then one row of controls: + for attachments, a model pill, a
microphone, and a round button that is voice until there is text, then send.
A plan notice can attach to the top of the card as its own strip, separate
from the input. In Theo, errors stay out of the composer, as the phone plan
says. An attached strip is only for non-error notices, such as a queued update
during a run.
- Empty chat with the composer: https://mobbin.com/screens/e4c51fae-e8b6-4e42-8a4c-23d1ec12b06a
- Composer with text and send: https://mobbin.com/screens/e2a4b72b-3db9-411b-8027-2ff699f9878a

**Conversation list and projects.** The list is plain: a title and a relative
time on each row, with a floating "New chat" pill at the bottom right and a
search field at the bottom. A project page has its instructions in a row at the
top, two equal buttons (Add files, Instructions), its chats below, and the same
New chat pill. Files are added from a bottom sheet with a small menu (Choose
File, Add Text).
- Chats list: https://mobbin.com/screens/d2bbf396-8ce2-470b-9b1f-129a3da4494d
- Project with chats: https://mobbin.com/screens/b9f16585-ab6c-4132-944b-3060c08f9389
- Project files sheet: https://mobbin.com/screens/db291aa9-629e-4b54-9a34-a9ab38b509d7

**Confirmations.** Delete is a small popover anchored to the more button, not a
full alert. Rename is a short alert with one field.
- Delete popover: https://mobbin.com/screens/f74f92e4-9509-49e3-8849-1186d7c69850
- Rename alert: https://mobbin.com/screens/d1a07a75-0b4c-4653-90dd-e28b0de22a80

## Cursor: code

**Agent list.** The list has a large title and sections for Pinned, Drafts and
Recents. Each row has a leading dot (filled when there is something new), the
task title, and a secondary line with the PR state (Open, Draft, Closed), the
added and removed line counts, and the repository. Search, filter and an
Archived toggle sit in the header. A composer ("Plan, ask, build...") is pinned
at the bottom, so a new task starts from the list.
- Agents with PR state and counts: https://mobbin.com/screens/1066acb9-1146-46e2-b56d-3381cc6899fd
- Agents with a Drafts section: https://mobbin.com/screens/efbfc13c-60c9-44e7-85a8-4e6fb8f5dc84
- Archived filter: https://mobbin.com/screens/06f1c3be-41aa-4b2e-9aeb-22695dd028aa

**Agent detail.** The run's summary reads first, as normal text with inline
code blocks. Then comes a Changes card: one row per file with a type icon, the
name and the +/- counts, ending with "N more". A "Follow up..." composer is
pinned at the bottom. Archiving asks for confirmation in a two-button alert.
- Detail with Changes card: https://mobbin.com/screens/d1e1bc38-ca6e-4308-81ef-4fca7fb36fa3
- Archive confirmation: https://mobbin.com/screens/4d75fc8f-0ad0-4553-b6a9-2fca6ca0ad2d

**Diffs.** The file list shows each file's path in grey after its name, with
counts on the right. Each file expands in place to a diff with line numbers,
red and green line backgrounds, and "N unmodified lines" folds.
- File list: https://mobbin.com/screens/a83adad1-1732-466d-8383-dcbe6ec30d83
- Expanded diff: https://mobbin.com/screens/20e04ff8-1fc6-40c6-8226-6a0cc083cb6a
- Diff in a file group: https://mobbin.com/screens/f36d4979-2e1f-4149-9b69-6d29ebb66da8

## Obsidian: notes

**Editor.** The editor shows the note title large and the body as rendered
Markdown, with round glass buttons at the top (sidebar on the left, reading
view and more on the right). With the keyboard up, a floating pill toolbar
above it holds formatting actions and a button to dismiss the keyboard. The
toolbar has two sets, structure and inline.
- Editor with list toolbar: https://mobbin.com/screens/feb7584c-e395-47a0-a4f2-f8fcbc47036c
- Editor with inline toolbar: https://mobbin.com/screens/efc80cf7-38a1-4207-8e44-6b3970a8af01

**Finding and creating.** One field at the bottom, "Find or create a note",
lists matches above it. Pressing return on a new name creates the note.
- Quick switcher: https://mobbin.com/screens/e9aaa07a-ab80-4354-bd1c-a37bc9a3f404

**Properties and tables.** Properties sit under the title as a small block with
suggested keys. A table view lists notes with columns such as backlinks, with
grouping and search in its own toolbar. Obsidian's purple accent is close to
the purple Theo is moving to.
- Properties: https://mobbin.com/screens/e7717b14-574c-422f-b9f9-5c7e0b47e9fe
- Table view with search: https://mobbin.com/screens/fef1fc9b-655e-49d5-a5e4-d02502a3080b
- Rename sheet: https://mobbin.com/screens/f3b4c2c8-b97c-4a34-8897-b159db5a9f15

## What this means for each workstream

**All screens (lists and look).**
- Large left-aligned titles, round glass header buttons, and no filled header
  band. PR #99 already moved the header items to native `Stack.Toolbar` and
  removed the header background.
- Flat rows, not cards, with one row type per kind of thing, reused across
  Chat, Inbox and Library.
- Group headers with a + where adding makes sense.
- A display options sheet for Library (grouping, ordering, which properties
  show) instead of separate screens per view.
- Dark toasts with Undo for reversible actions.
- Search opens on recent items, with the field at the bottom.
- Keep the system tab bar (`NativeTabs` in `mobile/src/app/(tabs)/_layout.tsx`).
  On iOS 26 it already floats as glass. If `NativeTabs` supports a separate
  search tab, that gives Linear's round search button natively. Check
  expo-router before building anything custom.

**Chat (composer and loop).**
- Reply text is full-width, the user's messages are bubbles, and an action row
  sits under each reply.
- One composer card: text first, then + / recipient pill / microphone / send.
  The recipient control in the plan takes the place of Claude's model pill.
- Pause and Stop appear in the composer's control row only during a run, and
  Send queues an update. Errors stay out of the card; a queued-update notice
  may attach to its top edge.
- The conversation list uses Claude's plain rows plus Cursor's leading dot for
  "something new" and a status line when a run is active.

**Inbox.**
- Linear's Inbox: rows with an avatar or Theo glyph plus an action badge, a
  bold title, an actor-and-action line, a time, and an unread dot.
- Needs you and Updates as the two groups.
- Swipe actions with an Undo toast.

**Computer and code.**
- Runs that change code follow Cursor: summary first, then a Changes card with
  file rows, +/- counts and "N more". The file list expands to inline diffs.
- A "Follow up..." composer is pinned at the bottom of a finished run.
- PR state and counts go on the run's row in Chat or Library.
- Watch, Pair and Drive stay their own controls. Cursor has no live computer
  view, so this part follows the phone plan, not a reference.

**Library and notes.**
- Notes open in an Obsidian-style editor: a large title, rendered body, a
  floating formatting pill above the keyboard, and properties under the title.
- "Find or create" at the bottom of Library search.
- Projects follow Claude's project page: instructions row, Add files and
  Instructions buttons, the project's conversations, and a New chat pill.
- Related items use Linear's detail-page pattern: chips at the top, then
  collapsible sections.
