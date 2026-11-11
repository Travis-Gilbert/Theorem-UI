# Theo points at things

Theo's face (`theo-face.md`) could look at and go to a handful of places:
the person, the pointer, the composer, the text, the artifact, a point.
"The artifact" meant beside the newest card. This plan lets the agent send
Theo to one particular thing on the page (the tool call that failed, a line
of a diff, a section of a document) so that Theo is the agent's finger.

Nothing new moves Theo. A thing is one more place a `look` or a `go` can
name, and the gaze-then-travel that `go` already had (`theo-body.md`,
"Approach an artifact") carries it there.

The checklist in `theo-pointing.checklist.json` tracks this spec item by item.

## Source

Proposed in the session that built it and agreed by the owner on 2026-11-11:
"Let the agent send Theo to a particular thing: the tool call that failed, a
line in a diff, a section inside an artifact." It is not a file, so it has no
hash.

## A thing is a place

```json
{ "op": "go", "to": { "thing": "tool:failed" } }
{ "op": "go", "to": { "thing": "change:dlg_1/src/map.ts", "line": 12 } }
{ "op": "look", "at": { "thing": "artifact:last", "text": "What is left" } }
```

- `thing` is a name the page gives, as `kind:id`. `kind:last` is the newest
  thing of a kind, and `kind:failed` the newest of it that failed.
- `text` is some words in the thing: the first place they appear, as written
  first and then whatever the case, with any run of white space counted as
  one space. At most 200 characters.
- `line` is a numbered line of it, where it has them. A diff has two lines
  with one number where a line was changed; the added one is taken.
- With both, the words are looked for in the line.

Two ids never share a name: white space in an id is written as its code
(`a b.ts` is `a%20b.ts`), and an id too long to write out ends in a mark of
the whole of it.

The agent names things; it never gives coordinates for them. What is on the
page is read with `face.read`, part `page`:

```json
{
  "things": [
    {
      "name": "tool:call_9",
      "label": "Bash",
      "state": "failed",
      "where": "closed"
    },
    {
      "name": "artifact:art_3",
      "label": "Build report",
      "where": "in view"
    }
  ]
}
```

The newest forty, oldest first. `where` is `in view`, `above`, `below` or
`closed`. `state`, where a thing has one, is `running`, `waiting`, `done`,
`failed` or `cancelled`.

### What the page names

| Kind       | Is                                          | Named in                                                | Parts            |
| ---------- | ------------------------------------------- | ------------------------------------------------------- | ---------------- |
| `tool`     | a tool call, by its call id, with its state | the tool card; markers in a closed Details              | words            |
| `message`  | a message, by its id                        | the message's root, with the label Kit's perch has      | words            |
| `artifact` | an artifact, by its id                      | the card in the conversation; the larger view when open | words            |
| `change`   | a file a worker changed, `delegation/path`  | the row in the worker's card                            | words, and lines |

A component names what it draws by spreading `thingProps(kind, id, {label,
state})` on it (`lib/face/things.ts`): three data attributes. Nothing in the
face knows a tool card from a message, so a new kind is a line in the
component that draws it.

Two cases need a word more from the component:

- **Folded away.** A tool call inside a closed Details is not drawn at all.
  Details carries `data-face-holder` and, while closed, a hidden marker for
  each call inside it. A thing that takes no room is pointed at by its
  nearest holder that does.
- **Drawn twice.** An artifact's card shows an excerpt and its larger view
  shows all of it. The larger view is named with `whole: true`, and is the
  thing while both are on the page.

Sandboxed frames (an App, a notebook) are another origin: the face can point
at the card, and cannot see inside.

## Where Theo stands

Beside the thing and outside its box, level with the part asked for:

- on the side the part is nearer, when there is room on both;
- on the side with room, when there is room on one;
- over the thing, just above the part, when there is room on neither;
- a tall thing is pointed at by its head, a line or a phrase by its middle.

While it points, its eyes stay on the thing, with a glance at the person
every 3.4 s, and it lingers 9 s before going home where a visit to a place
lingers 3.5 s. It stands at 1.5 times its resting size unless the step gives
a size.

**The mark.** What is pointed at is marked in Theo's own colour, leaning to
the ink so it reads on a light page as on a dark one: an outline with a faint
wash around a whole thing, a wash with an underline under words, a wash with
a bar before a line. It is one element in Theo's layer, placed each frame
from the same measurement Theo stands by, and it takes no pointer events.
Only what shows is marked: a thing half scrolled off is marked where it
shows, and nothing out of view is marked at all.

**Out of view.** Theo waits at the edge the thing lies beyond (the top of
what the person sees, or the bottom, which is the top of the composer where
that floats over the conversation) and looks that way. The page is never
scrolled by the agent.

## The person's tap

A tap on Theo, or Enter or Space, while what it points at is out of view,
folded away, missing the part asked for, or has that part scrolled off
sideways, brings the thing to the person instead of poking Theo:

1. what folds it away is opened by pressing its own control, the one that
   says `aria-expanded="false"`, as the person would. First what holds the
   thing, then, for a part that is not there, one fold inside the thing
   itself. A menu's button says the same and is never pressed;
2. a part that is there but cut off by a preview that does not scroll is not
   scrolled inside it, since the person could not scroll it back. The control
   the component marks as showing the whole of the thing (`OPENS_WHOLE`, on
   the artifact card's "Open in larger view") is pressed, and Theo then
   points at the whole;
3. the part is scrolled to the middle of what the person sees.

Nothing is pressed twice and at most three things are pressed, so a thing
that will not open is left alone. With motion reduced the scroll is instant.

Opening and scrolling are the person's: the agent's program never does
either. It is told what it would take, below.

## What the agent is told

A program is checked against the page before it plays.

- A thing that is not a name, a `text` that is empty, a `line` that is not a
  whole number from 1: refused, with the path.
- A thing the page does not have, in a program the agent wrote for this
  call: refused at `steps[n].to.thing`, saying `face.read` with part `page`
  lists what is there. Nothing plays.
- The same in a saved performance or a reaction rule, which were written for
  some other page: a note, and the face stays where it is.
- A thing that is folded away, a part that was not found, a thing above or
  below what the person sees: the performance plays, and a note says so and
  says the person's tap opens it or brings it into view.

`face.read`'s state carries `pointing: {thing, where}` while Theo points, and
the status line a screen reader gets says what Theo points at and, when it is
out of view, that pressing Theo brings it.

## Boundaries

- Names, never coordinates. The agent cannot make Theo point at a pixel and
  call it a thing.
- The agent does not scroll the page, open a fold or open a panel. The
  person's tap does.
- Theo marks; it does not select, edit or copy what it points at.
- Words are found in what is drawn, and only there: a revision kept hidden
  beside the one that is open is passed over. A tool result that is folded shut has no
  words on the page until it is opened.
- Whether a tool call failed is the run's own record of it, as the card
  shows it. Pointing adds no judgement.

## Decisions

- **A place, not an operation.** The face has three operations and the turn
  has no room for more (`theo-face.md`, "Operations"). Pointing is `go` to a
  new kind of place, so it composes with everything a program can do: point,
  then glare, then go home.
- **The page names its things with attributes.** Kit's perches work this way
  (`lib/kit/stage.ts`). A registry the components called into would need
  each to mount and unmount an entry; an attribute cannot go stale.
- **Opened by its own control.** Details, a tool card and a changed file each
  keep their open state in their own component. Pressing the control that
  says it is closed needs nothing from them and does what a person's click
  does, including whatever else that click is meant to do.
- **Strict only for what the agent wrote now.** A name that is not on the
  page is the agent's mistake when it wrote the program for this page, and
  ordinary when a saved performance meets a different page.
- **Hand-rolled standing.** `stand` is rectangle arithmetic particular to a
  figure that must stay out of what it points at and say which way a thing
  lies. A positioning library places a panel against an anchor and keeps it
  on screen, which is a different question.

## Files

```
src/lib/face/
  things.ts       names and aliases, the attributes a component spreads, whether a box shows, where the figure stands, what the agent is told
  program.ts      the {thing} place: checked, asked of the page, refused or noted
  engine.ts       the manual's `page` part; `pointing` in the state; strict for a program written inline
  operations.ts   `page` in face.read; pointing in face.perform's description
src/components/face/
  things.ts       finds a named thing in the DOM: words across nodes and shadow roots, a diff's lines, what clips it, what covers it; opens and scrolls on the person's tap
  driver.ts       stands beside the thing, places the mark, keeps the eyes on it, lingers; the tap that brings it
  face-stage.tsx  the mark's element
src/styles.css    .face-point
src/components/assistant-ui/elements/tool-fallback.aui.tsx   tool:<id>, with its state
src/components/chat/theorem-parts.tsx                         Details as the holder, and markers while closed
src/components/assistant-ui/elements/thread.aui.tsx           message:<id>
src/components/artifacts/artifact-message.tsx                 artifact:<id> on the card; OPENS_WHOLE on its open button
src/components/artifacts/artifact-panel.tsx                   artifact:<id>, whole
src/components/chat/delegation-parts.tsx                      change:<delegation>/<path>
src/stories/fixtures/pointing.ts, the story `face-point`
```

## Tests and evidence

**Execution correctness** (`bun test src/lib/face src/components/face`):

- standing (19, `lib/face/things.test.ts`): names, `last` and `failed`, and
  no two ids sharing one; when a press brings a thing; the
  attributes; a tool call's state in one word; a sliver shows and none does
  not; beside and never over; the nearer side; the side with room; over the
  thing above the part; a tall thing by its head; out of view at that edge
  with nothing marked; the composer's cover; marked only where it shows;
  folded away; each note;
- the checker (3, `face.test.ts`): a thing in `look` and `go`, asked of the
  page, with the page's notes under the step's path; seven wrong things
  refused at their paths; a missing thing refused when strict, noted when
  not, and let stand with no page to ask;
- the operations (2, `operations.test.ts`): `face.read` lists the page and
  says what is pointed at; `face.perform` refuses a thing the page lacks and
  nothing plays, and plays one it has with the page's note in the receipt.
  The declarations are still inside Theorem's limits;
- the page (16, `components/face/things.test.ts`, happy-dom with boxes the
  test gives): words across nodes, across a line break, by case, into a
  shadow root and not into a style, and not in what is hidden; the list; a thing that takes no room
  found by its holder; a name on two elements; a diff's added line before its
  removed one; the whole of a thing before a part of it; a clip that is out
  of sight; a cut-off part opening the whole and never scrolling the excerpt;
  a fold opened once and scrolled to; a menu left alone; a thing that will
  not open pressed once.

**Seen** (headless Chromium on software WebGL, the story `face-point` at
1280 by 800, 2x; renders in `evidence/theo-pointing/`):

| Render          | Shows                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `folded.png`    | sent to `tool:failed` while Details is closed: Theo beside Details, which is marked whole                                |
| `words.png`     | after a tap, and sent to the words "Could not resolve": the call open, the words marked in its result                    |
| `below.png`     | sent to line 2 of a changed file below the fold: Theo at the foot of the conversation, above the composer                |
| `line.png`      | after a tap: the diff open, scrolled to, its added line 2 marked with a bar                                              |
| `line-dark.png` | the same in the dark theme                                                                                               |
| `section.png`   | sent to "What is left" in a document whose card cuts it off, after a tap: the larger view open, the heading marked there |

In each the receipt's notes said what the picture shows (folded away, words
not found, below what the person sees), and a thing the page did not have was
refused at `steps[0].to.thing`.

## Not seen

- A person's eyes on it. Whether the mark is strong enough, and whether Theo
  at the edge reads as "it is up there", are judgements nobody has made.
- A live run. The story's conversation is a fixture; no agent has yet called
  `face.perform` with a thing against a real turn.
- A phone. Standing was worked out for a window with room beside the
  conversation; on a narrow one Theo sits over the thing more often.

## Not yet

- Parts of an OpenUI artifact by component, and cells of a notebook. Both
  are words today.
- Things outside the conversation: a file in the IDE, a row in the sidebar.
- A range of lines. One line is marked.
- Following a thing that streams: a tool call still running is found, and
  its words are looked for again each 400 ms, but nothing waits for words
  that have not arrived.
