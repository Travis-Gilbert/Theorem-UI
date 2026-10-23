# Theorem icon provenance

## Development workspace rail icon

`rail/noun-shellfile-1517619.svg` is the owner's attached Noun Project
Shellfile (1517619) rendition, copied without changes for the Development
Workspace destination. SHA-256:
`295a47493a784d449d89a3e8122fce5a5f467f21ff1ef8cddb5a99d4f0072115`.
The owner states that their license is royalty free. The attachment itself
contains no creator metadata; `GET /v2/icon/1517619` identifies Smashicons,
line weight 14, with public `creative-commons-attribution` metadata.

## Global rail icons

Except for Search, these SVGs were retrieved once through the owner's licensed
Noun Project v2 API key and are the unmodified `icon_url` responses. Search is
the owner's attached SVG, copied byte for byte. The API reports
`creative-commons-attribution` as the other icons' public license; the owner
states their paid license is royalty free. The shipped app uses only bundled
bytes and never calls the API or includes credentials.

| Destination | File | Term and creator | Style | SHA-256 |
|---|---|---|---|---|
| Chat | `rail/noun-chat-52762.svg` | chat (Noun asset 52762); creator not embedded in attachment | Owner-supplied rendition, 1200 view box, drawn solid | `ee96f0c5e4037f45333ef7a24238d9142fab4071926cde73b56da4c23d437540` |
| Spaces | `rail/noun-penrose-triangle-881122.svg` | Penrose Triangle, Lluisa Iborra | Owner-supplied rendition | `495ff6ca11078ed418eda97490160eede32b42e1ef3f252885dcf3ea3c267241` |
| Projects collection | `rail/noun-projects-8375031.svg` | Data, Reion | line 14 | `6211d378be4311d19dd02f05f581dba0fb8a457d8e1db7c25069b7d5f5d640fe` |

The contextual Projects tree uses the same retrieval and paint model. Its project
rows use `tree/noun-data-8394841.svg` (Data by Mustofa Bayu, no style declared,
SHA-256 `85f3690e1d40685b2712b0c625ef4f87cbdd23bf6a4f9cfd8c0e950d724b8028`)
and its child rows used `tree/noun-file-8434068.svg` (File by El Hikami,
line weight 11, SHA-256
`1e6655aa7a4755809bc860867e533dcce5a51cc73b45c476ad020beb5824f6be`), now
retired. That child icon replaced the earlier File (8398662) selection at the
owner's request. It was the unmodified `icon_url` SVG from `GET /v2/icon/8434068`.

The Search asset came from the owner's attached SVG rather than a fresh API
response. Its 1200 view box and byte digest are preserved; the rendering layer
scales and tints it. New chat now uses the former Chat destination's mark, and
the redundant Chat rail destination has been removed.

The owner's icon swap of 2026-10-02 replaced three of these by URL: Index is
Inbox (8216259), New chat is chat (8216252), and Notebook is note (8327985),
each retrieved once through the same API key as unmodified `icon_url` bytes.
The fourth named in that swap, send (8216262), was re-fetched and is
byte-identical to `composer/noun-send-8216262.svg`, which the composer drew
until 2026-10-22, so nothing changed there. The optical corrections for the three new
marks were measured by `oracles/icon-optics.mjs` at the rail's 18 du design
size and are in `crates/gpui/design/src/icon_optics.rs`.

The owner's rearrangement of 2026-10-11 attached four SVGs, each copied byte
for byte with its 1200 view box: Apps is collection (8408872), Index is
database (8408864), Database is renamed Data and drawn with nodes (138240),
and Space is renamed Spaces and drawn with Penrose Triangle (881122). The
attachments carry no creator metadata; the creators above are the ones each
icon's public Noun Project page names. Spaces now sits directly below New chat
and Data directly above Apps. Apps left the Lucide group to join this one, so
the rail family's median moved and `oracles/icon-optics.mjs` re-derived every
rail correction: New chat rose from 1.07 to 1.10 and Projects collection now
needs none. The marks they replace are listed under Retired.

The owner's calibration of 2026-10-03 named the Space mark: cube (8186312) by
sentya irma, `rail/noun-cube-8186312.svg`, no style or line weight declared,
API-reported license `creative-commons-attribution`, SHA-256
`995f93448fec3623c988b52be67534f1bd959e0ec0a0640fe905e359af06fbf5`, the
unmodified `icon_url` bytes from `GET /v2/icon/8186312`. It belongs to the
Space destination, the surface Database and Records move into, and the rail's
Space tile draws it (`crates/gpui/shell/src/rail.rs`, `SPACE_SVG`). It is
measured with the rail family it joins. The same calibration raised every mark one step
(rail 20 du; toolbar, sidebar and header 18 du), so every correction was
re-measured at those sizes. The cube sits within 15% of the rail family's
median at 20 du and needs none.

## Rail marks derived from Lucide

Theme (Moon under Paper, Sun under Graphite) and, until 2026-10-11, Apps were drawn from the
Lucide bundle `gpui-component` ships. Measured against the Noun rail family at
20 du (icon-optics oracle, group `rail-lucide@20`), the kit's stroke-2 outlines
painted 39 to 181% more ink than the family's median: Moon +55%, Sun +39%,
LayoutDashboard +181%. Scaling cannot close that without leaving them
undersized, so the oracle's rule applies: they need a different asset. These
are Lucide's own marks lightened to the family's weight, with the change and
the licence notice written into each file. Every 2x2 grid Lucide offers stayed
26% or more too heavy even at stroke 1, so Apps takes Lucide's 3x3 `grip`,
the conventional app-launcher mark, with its outer dots moved to the cell edge
for extent.

| Control | File | Derived from | Change | License | SHA-256 |
|---|---|---|---|---|---|
| Theme, under Paper | `rail/lucide-moon-rail.svg` | `gpui-component` `crates/assets/assets/icons/moon.svg` (`205b959e940d5841f0ce1d09c933153da9d9c94130a54d5cc0c68c2af1d403da`) at revision `b94c409f119ed11a785120925d14021fed3e9b69` | stroke-width 2 to 1.3 | ISC, "Copyright (c) 2026 Lucide Icons and Contributors" (`crates/assets/LICENSE-LUCIDE`); notice carried in the file | `40b4017a5eb01a49f5704305bfa752569ece9d07cc53c42b2fa7a60c36929af0` |
| Theme, under Graphite | `rail/lucide-sun-rail.svg` | `sun.svg` (`a3955c8b0425fcc5c9ba12d2bdd77fe53b2cd5dd05e7742a56f342e996fb2ef8`), same revision | stroke-width 2 to 1.5 | ISC, as above | `43f936d61098aaf5640838ab48c19a8a1d5c85a0bb73cd9cb8829b196682604c` |

Each lands within 15% of the family's median ink and extent at 1x and 2x and
needs no correction. They are corrected toward that family's uncorrected
median without joining its group, which would move the median and re-derive
every calibrated Noun mark.

## Header control icons

SPEC-THEOREMWEB-ZED-PROPORTIONS-1.1 section 7.3 gives the Chat sidebar header
a New conversation button with a compose glyph. Its neighbours in that header
(More, Refresh) are the Lucide icons `gpui-component` bundles, and that bundle
has no compose mark, so this one is Lucide's own rather than a drawing of one.

| Control | File | Source | License | SHA-256 |
|---|---|---|---|---|
| New conversation | `square-pen.svg` | `lucide-static` 1.48.0, `icons/square-pen.svg`, retrieved from `https://cdn.jsdelivr.net/npm/lucide-static@1.48.0/icons/square-pen.svg` and committed byte for byte | ISC, "Copyright (c) 2026 Lucide Icons and Contributors"; the file carries its license comment | `8a6154592279423212d00525d3c5bb2618c149339e7089cb90b0d81ba15f42f9` |
| Share (Chat workspace header, section 7.6) | `share.svg` | `lucide-static` 1.48.0, `icons/share.svg`, retrieved from `https://cdn.jsdelivr.net/npm/lucide-static@1.48.0/icons/share.svg` and committed byte for byte | ISC, as above | `65302d33c54142f18752bb170b366ab0f953b491f8e19e0709402ddc0964e075` |
| Pin conversation (Chat workspace header, section 7.6) | `pin.svg` | `lucide-static` 1.48.0, `icons/pin.svg`, retrieved from `https://cdn.jsdelivr.net/npm/lucide-static@1.48.0/icons/pin.svg` and committed byte for byte | ISC, as above | `cdc7f4d7591ba6cbe0bcefe145e33a74e014283c3d711152c45ebfd4cd803acc` |

| Follow agent (thread header, DESIGN.md 4) | `crosshair.svg` | `gpui-component` `crates/assets/assets/icons/crosshair.svg` at revision `85b56f105961f9804b64b612ceff9a2e394e4936`, committed byte for byte; the kit's default icon list does not embed it | ISC, "Copyright (c) 2026 Lucide Icons and Contributors" (`crates/assets/LICENSE-LUCIDE`) | `ae9ed8583286ea03bffae85bb69aee5227540e588b0370cf185f2141ebe25e8d` |
| Side chat (thread header, DESIGN.md 4) | `split.svg` | `gpui-component` `crates/assets/assets/icons/split.svg` at the same revision, committed byte for byte | ISC, as above | `7b8bebfea5419548e9fed898c8c8cfa7b4ddd910628eab44d3903ccce077dd73` |
| Checkpoints (thread header, DESIGN.md 4) | `history.svg` | Lucide `history`, whose three paths the owner's Workbench mock draws verbatim; the kit bundles no `history`, so the paths are transcribed from the mock into Lucide's own 24 box and stroke model | ISC, as above; the file carries the notice | `5831c22b7c4d9637b3ec45163aba16a0a8e17d7e41c9a439537d68c83e8143b3` |

Each is a 24 box with `stroke="currentColor"`, the same paint model as the
kit's bundled Lucide files, so the theme tints it and dark mode needs no second
rendition. The reference canvas draws Share and Pin as its own paths; the kit
bundles neither, so these are Lucide's marks of the same objects rather than a
tracing of the canvas. The header's More is the kit's bundled `Ellipsis`, and
a pinned conversation is shown by the kit button's selected state, so no
`pin-off` mark is admitted. Since the thread header took the Workbench mock's four tools,
Share and Pin are rows in More and draw no mark; the files stay as the
record of what those controls drew.

## Composer control icons

SPEC-THEOREMWEB-PAPER-COMPOSER-1.0 section 12 asks for a coherent family of
actual Noun Project assets for Attach, microphone, Send, Stop, Remove, Tools,
and the supported capability actions, bundled locally, with asset identity,
creator or source, rendition, and license kept in the provenance mechanism.
This file is that record for the composer's controls. Digests are `sha256` of
the committed bytes.

Every file here is upstream's bytes unaltered. The digest is what pins the
rendition, so normalising the geometry would break the tie to the asset it
claims to be.

## Message toolbar marks

The owner calibration of 2026-10-02 (SPEC-THEOREMWEB-CHAT-WORKSPACE-1.0
section 1.3) turns the worded action row under each turn into an extra-small
Kit toolbar of marks. The owner asked that no third-party icon set be copied
in for it, so these eight are Theorem-authored, MIT like the rest of this
repository.

Seven were drawn on the composer family's 100 box as a 7.5-unit line with
round caps and joins, then expanded to a filled outline (kurbo 0.11.3 stroke
expansion, offline, at authoring time) so the file declares no `fill` or
`stroke` and the theme tints it as an alpha mask. The ellipsis is three filled
dots, radius 8, sized to carry the same optical weight at 14 pixels. That is the composer
family's paint model, and one line weight across the eight is section 12's
one-hand rule for marks in one control row. The composer's own refresh and
draft marks are finer illustrations and read as texture at the toolbar's
14 pixel size, so the row has its own reload and edit rather than borrowing
them. `kit/message_toolbar.rs` checks the grid, the paint model, and that the
eight files are distinct.

| Control | File | SHA-256 |
|---|---|---|
| Copied (the copy control, confirmed) | `message/theorem-copied.svg` | `a3ce189825238bfb82f1fea1818a1a7e9922a243b0bb724706c34e3a6696ad7e` |
| Reload response | `message/theorem-reload.svg` | `a009e43b76324e70c95a729c0c2c8590bb9ce792725e37635c71bc39368257ae` |
| Read aloud | `message/theorem-read-aloud.svg` | `a341881e02e0e7606b081f7ee04205e98b7e8e5b1ddb0c417f530fe9f78f71d2` |
| Edit message | `message/theorem-edit.svg` | `195260bcbdd2b34fca8da6aadb4f41a47d7850483c41e31b871c756659f706bd` |
| Message actions (the retained menu) | `message/theorem-more.svg` | `9da5f1b0cbfdc606fad89d5973668b1e9989e48d163cfd98e6cc0cf7b7106bd6` |
| Previous branch | `message/theorem-previous.svg` | `22a4f7381ebccb849054ccc8f2dff36307f5ca0e794c1a2cf7bb7e1f6dc9f614` |
| Next branch | `message/theorem-next.svg` | `c05e78d8aeba879d51647e9c6c33f33d768c599d708edce846e97051275a376e` |

## Status band checkout marks

DESIGN.md 11's checkout mark, the owner's three Noun Project selections of
2026-10-11. Each was retrieved once through the owner's licensed Noun Project
v2 API key and is the unmodified `icon_url` response; the shipped app uses only
these bytes and never calls the API or includes credentials. The API reports
`creative-commons-attribution` as their public license and `solid` as their
style; the license basis is the one recorded under License below.

| State | File | Term and creator | SHA-256 |
|---|---|---|---|

`theoremweb-shell-gpui`'s `the_checkout_mark_follows_the_checkout` checks
that the three are distinct files and declare no colour.

## Rendition

The Noun Project API returns each icon as a 100 view box of filled contours
carrying no `fill` and no `stroke`. GPUI renders an SVG as an alpha mask tinted
by the element's `text_color`, so undeclared paint takes the theme colour: no
file carries a colour and dark mode needs no second rendition. `svg().size()`
scales the view box to the painted box, so the 100 box costs nothing beside the
24-box files the kit bundles.

`crates/gpui/chat/src/kit/atoms.rs::the_admitted_glyphs_share_one_grid_and_one_paint_model`
is the runnable check that both properties hold for every file below.

### The web app's paint

The browser paints these files the way the kit paints them: no file carries a
colour, and undeclared paint takes the theme colour, so dark mode needs no
second rendition.

One thing the two runtimes do differently is the hollow centre. The API
returns a line as a pair of thin contours around an empty middle, which the
kit resolves by drawing the glyph large, and the web app resolves by
striking the same path with the same colour at 3 units of the 100 box. The
stroke closes the hollow and leaves the mark with the weight it was drawn
with; it is a rendering rule in `src/styles.css`, so no byte of an admitted
asset changes and the digests above still pin the renditions. The message
toolbar marks, which Theorem drew solid, opt out of the rule, and the
stroked sets that declare a fill are left alone.

The marks that carry the app's primary affordances sit on a square plate
(`src/components/ui/icon-tile.tsx`) so the glyph has a ground to read
against. The plates are Stone surfaces, so they read as part of the surface
rather than as a colour of their own.

## License

Retrieved through the repository owner's paid Noun Project API subscription,
whose royalty-free grant carries no attribution condition.

The API's per-icon `license_description` reports `creative-commons-attribution`
for all of these. That field describes how the creator published the icon on
the free tier; it is a property of the icon, not of the subscription that
fetched it. The basis is recorded here rather than asserted: a reader who
doubts it should check the subscription terms at
https://thenounproject.com/legal/ against the account the key belongs to, not
this file. The same basis is recorded in
`crates/agpui/gpui/PROVENANCE.toml` for that crate's own Noun assets.

Credentials are not in this repository and are never called at render time:
section 12 forbids both. Retrieval happens once, at authoring time, and what
ships is the bytes.

## Admitted

Six of these are the repository owner's own selections, named by icon URL. The
other five fill the controls those six do not cover, and were chosen to match
them: same style, same line weight, and where possible the same creator.

| Control | File | Icon | Digest | Creator | Rendition | Chosen by |
|---|---|---|---|---|---|---|
| Microphone, idle and capturing | `composer/noun-microphone-8216254.svg` | Microphone (8216254) | `4e6cdaa318bf1d49ff204fa8834a491789fe651ca222091601edda9fc199be03` | Jagat Kreasi | line 8 | Travis |
| Canvas | `composer/noun-draft-8216278.svg` | draft (8216278) | `336d36918969f8504ace8d9677f677f5cfc519624e1e8be5ce273b64c0d5879f` | Jagat Kreasi | line 8 | Travis |
| Attach | `composer/noun-attachment-8184735.svg` | Attachment (8184735) | `f2ecf1c68efa226f5747cb07605b979dd0396b7d8258ed939d4ca10c3a50d566` | Angel Yuta | line 7 | Travis |
| Finish dictation, Stop generation | `composer/noun-stop-8086088.svg` | Stop (8086088) | `ef1f97b09c8f441bf3b98809f02b12601622883619ec3519c9e9334479aa220d` | Jagat Kreasi | line 8 | matched |
| Remove | `composer/noun-close-8086061.svg` | Close (8086061) | `7222bb2f11dce56ef8c8b86b0be2b90b4afe7735265b8e973fd0dc8f8d4509b9` | Jagat Kreasi | line 8 | matched |
| Retry | `composer/noun-refresh-8086048.svg` | Refresh (8086048) | `ec0b1e2d68207b399efed91bf3bfe227130941f4b04f6920603594e18a9260d8` | Jagat Kreasi | line 8 | matched |
| Tools | `composer/noun-settings-8086044.svg` | Settings (8086044) | `2291920b3599e170edd1dbe441cd9191efca5dfd9f86dc9a334540980705446a` | Jagat Kreasi | line 8 | matched |

Four creators, and two of the six carry no declared line weight. That is a
weaker match than section 12's "match optical size, visual weight, view-box
padding" asks for, and it is a deliberate choice by the owner rather than an
oversight. What it costs is recorded below.

`Attachment (8184735)` was first wired to Think and is now on Attach, which is
what it draws. Think and Effort are `Power (8132697)`.

### Weight is not a parameter

The v2 API cannot re-render a given icon at a different weight. `line_weight`
is documented as *"filter results by line weight"* and comes back inside each
icon's `styles[]` as a read-only property of that drawing; there is no stroke
or weight parameter on any endpoint. Weight is baked into the file, so asking
for a heavier version of an id is asking for a different id. Any future
"make these heavier" is therefore a re-selection, not a re-fetch, and the
search that finds candidates is `GET /v2/icon?styles=line&line_weight=<n>`.

### What the render shows

The Noun API returns these at line weight 7 to 8 on a 100 box. That is
nominally close to the 24-box stroke-2 files the kit bundles, and it does not
render the same: these are outlines *of* line art, so each stroke is a pair of
thin contours around a hollow centre, carrying roughly half the ink of a solid
stroke of the same nominal width, plus interior detail a small control cannot
resolve.

Two changes since answered that without touching a byte: the Standard glyph is
36 rather than 19, and the capability controls now sit on a filled tile. A
thin contour resolves at 36 where it smeared at 19, and ink on a filled tile
carries contrast that thin ink on the card's own ground does not. The check
for any of this is `examples/composer_capture.rs`, not the unit tests - a byte
test can see the view box and the paint model, and cannot see weight.

A weight-21 family was rendered as an alternative and is not what shipped; the
owner's selections are.

## Retired

| File | Digest | Creator | License | Status |
|---|---|---|---|---|
| `rail/noun-database-8419544.svg` | `bf63c4cb1d75e29ac05c070e0a66d580856c3306b89189a52d8848cf299c9656` | Lordz / Noun Project, asset 8419544 | Subscription, as above | Database until the owner's 2026-10-11 rename to Data, drawn with `rail/noun-nodes-138240.svg`. |
| `rail/noun-inbox-8216259.svg` | `e079f651db029a747be80cc48f61075ecf4c30808c3cf79b0801c19d8ee201af` | Jagat Kreasi / Noun Project, asset 8216259 | Subscription, as above | Index until the owner's 2026-10-11 swap to `rail/noun-database-8408864.svg`. |
| `rail/noun-cube-8186312.svg` | `995f93448fec3623c988b52be67534f1bd959e0ec0a0640fe905e359af06fbf5` | sentya irma / Noun Project, asset 8186312 | Subscription, as above | Space until the owner's 2026-10-11 rename to Spaces, drawn with `rail/noun-penrose-triangle-881122.svg`. |
| `rail/lucide-grip-rail.svg` | `18190f0d782bd1251a1aace6c87c54875f5facaba14bc8ca38d0f57f5bbb932f` | Lucide `grip.svg`, lightened (stroke 1.35, outer centres at the cell edge) | ISC | Apps until the owner's 2026-10-11 swap to `rail/noun-collection-8408872.svg`. |
| `rail/noun-chat-8216252.svg` | `5d54cd67d6439c61fc9a68c6e09578e7fcee4a4bb4728b978cd3f8bd1bdeae5f` | Jagat Kreasi / Noun Project, asset 8216252 | Subscription, as above | Chat until the owner's 2026-10-23 swap to the attached `rail/noun-chat-52762.svg`, copied byte for byte. |
| `rail/noun-chat-1747287.svg` | `140ba4aa90126f3a72c40004370058a71ce87630d22af9608bb42b9e859ec29d` | Kaleo / Noun Project, asset 1747287 | Subscription, as above | New chat until the owner's 2026-10-02 swap to `rail/noun-chat-8216252.svg`. |
| `rail/noun-organize-7934045.svg` | `a01dbea69d2f63121d904a20ee2fede474758cccb5e4738b43a07aeba2be26da` | Koko Robert / Noun Project, asset 7934045 | Subscription, as above | Index until the owner's 2026-10-02 swap to `rail/noun-inbox-8216259.svg`. |
| `rail/noun-document-1517606.svg` | `ae71c886d43bc7bb11d07b0361a4acce70f91ead19c0244302920a3df9b7a234` | Smashicons / Noun Project, asset 1517606 | Subscription, as above | Notebook until the owner's 2026-10-02 swap to `rail/noun-note-8327985.svg`. |
| `rail/noun-writing-8390845.svg` | `9f05524b241083bddd6012de37d52ef4c1461321bd8947db928192b759a65914` | Nur Achmadi Yusuf / Noun Project, asset 8390845 | Subscription, as above | Previously New chat; removed when New chat adopted `rail/noun-chat-1747287.svg`. |
| `noun-microphone-8420586.png` | `65c6b036a4f6b2fe64bfdb4d4ab604f8e74d4b8077f1948043f02176db53c2d5` | Dian Chandra Lesmono / Noun Project, asset 8420586 | CC BY 3.0 | Raster, drawn on a hardcoded white circle. Replaced by `composer/noun-microphone-8216254.svg`, which the theme tints. |
| `composer/paperclip.svg` | `7c0096b20a0fab483bf30142f67b682b4958d1d40fdb3a9d7012c0e9a1639b51` | Theorem | MIT (this repository) | Interim original geometry. Replaced by the admitted Noun rendition. |
| `composer/microphone.svg` | `68a6ec96c568b21b5fb05119fc96805e2367ebc181c96a92e26988af93ab928f` | Theorem | MIT (this repository) | Interim original geometry. Replaced by the admitted Noun rendition. |
| `composer/microphone-off.svg` | `c7b63875ba59a0988d5859183c39d38e232ebda1246c0ba1b379fab76ece82c2` | Theorem | MIT (this repository) | Interim original geometry. Replaced by the admitted Noun rendition. |
| `composer/square.svg` | `5f4de0686dc78967dd082e45d249e6580f5f4ba2f41bbb00f10daf76a0895414` | Theorem | MIT (this repository) | Interim original geometry. Replaced by the admitted Noun rendition. |
| `composer/sparkle.svg` | `01763e61077e0a908e28103efad1ba4c8b9ce5236e20334596b44efae630b59f` | Theorem | MIT (this repository) | Interim original geometry. Replaced by the admitted Noun rendition. |
| `composer/noun-attach-8216286.svg` | `16b422aaa8d86bfc4bb8af9e743a3ba72a1c25fe62dcfeb43cea16494e23f3cc` | Jagat Kreasi / Noun Project, asset 8216286 | Subscription, as above | Held Attach for one revision. Replaced when the owner moved their own `Attachment (8184735)` onto Attach, which left this with no control to draw. |
| `rail/noun-home-1570519.svg` | `1b5ac6f9ad59f7856f7312cd70b1553e8171bec5b063d834b0d070c1c84a52a9` | Owner-supplied Home (1570519); creator not embedded in attachment | Subscription, as above | Drew Home. The digest is the cropped file's; the attachment's was `457e90f5a985278faf389b785ee20dd36fb78818675b4ff8f6e0cee5ed6f07b8` (see Home and Writing optical calibration). Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `rail/noun-writing-8280302.svg` | `9a9979145a0b2f7f875c2c166c3e458410bef66ab746b6991aeb03104ec65022` | Owner-supplied Writing (8280302); creator not embedded in attachment | Subscription, as above | Drew Writing (New chat's rail mark) until 2026-10-22; replaced by `streamline/streamline-pencil-write-2.png`. |
| `rail/noun-geometry-152494.svg` | `24340840f7d715f7867e0304d3533dd0f6efaed3aee342bf43d970028bc06a4e` | Owner-supplied Geometry (152494); creator not embedded in attachment | Subscription, as above | Drew Search. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `rail/noun-database-8408864.svg` | `c393569094ac128fa35c9e2e236a19e28957e4bbef4591a302a90a3a63902f79` | database, Sofiah | Subscription, as above | Drew Index. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `rail/noun-note-8327985.svg` | `a4abf514a38f484a175edfddc4be2660785c46da3e1a54d187da1a5724b14f0c` | note, Bakunetsu Kaito | Subscription, as above | Drew Notebook. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `rail/noun-tasks-8481868.svg` | `8b439d56a97849678887d727750238b3088d9d42b707a9a5398f5dee7883cec4` | Checklist, Win Ningsih | Subscription, as above | Drew Tasks. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `rail/noun-nodes-138240.svg` | `3774603cc974587e3f70aadee0b693b5f3ee997c2d1333eb842283282589ef79` | nodes, Gregor Cresnar | Subscription, as above | Drew Data (Records authority). Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `rail/noun-collection-8408872.svg` | `379fd857a1ca8b35efc49f2ca8e7fcfc51b16d2966423c4e3732e76cf3f6a960` | collection, Sofiah | Subscription, as above | Drew Apps. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `message/theorem-copy.svg` | `689663ef892465cd80f38b270c82d73796f4837e2221952043e227392035c2c3` | Theorem | MIT (this repository) | Drew Copy until 2026-10-22; replaced by `streamline/streamline-copy-paste-1.png`. |
| `status/noun-git-5940992.svg` | `732cae6f50acf32b537e8e521d3aea367118bcf44aa8fa1f93da7b4bdf5963fb` | git, Afianroc | Subscription, as above | Drew Clean branch (the default). Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `status/noun-git-3639045.svg` | `f9b47e6a83aff7e76cc9e5b9a660f6a28c999972cb33cee17ee741ffef6e3522` | git, Colourcreatype | Subscription, as above | Drew Uncommitted changes. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `status/noun-git-4782679.svg` | `f22aa309d9cb85431d895245e94bd57f24f37f219190b223763f5bdf621db44b` | git, Saepul Nahwan | Subscription, as above | Drew Detached HEAD. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `composer/noun-send-8216262.svg` | `9811da655d95a0017093dc6dcf150dac42df0c965cf5a736f4e8b2d6afe10ac9` | Jagat Kreasi, send (8216262) | Subscription, as above | Drew Send until 2026-10-22; replaced by `streamline/streamline-send-email-1.png`. |
| `composer/noun-power-8132697.svg` | `ef80ce603792f1efa23902b7334b3e86a7182d61cf254d1360577ff0f0b3ce42` | AFYstudio, Power (8132697) | Subscription, as above | Drew Think, Effort. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `composer/noun-mute-8387591.svg` | `830633690b6a203928605a0eb26b6ecdba3a81203ae569463ab108f4dd5995c3` | Gendis Studio, Mute (8387591) | Subscription, as above | Drew Microphone, capture closed. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-abacus-8263966.svg` | `22a18d22be40e2a33ba5c7bae6f7d63483bbc21df28c474c8f1d8e0b22665a75` | Abacus, Dierys Design (asset 8263966) | Subscription, as above | Drew field Numeric. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-book-8263964.svg` | `e73bc505a0ded6b8742c65e4c228479fcc0e40cb36c8a312f0e16a3f0fe939b1` | Book, Dierys Design (asset 8263964) | Subscription, as above | Drew object Book. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-box-8269861.svg` | `55671b8e0e94e8ba6da2bdf2b3407a7d061a4c12580e04b50bff69c7f68214be` | Box, Dierys Design (asset 8269861) | Subscription, as above | Drew object Object. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-calculator-8263963.svg` | `686a772212c48545a1009b76e41b76cc30e356adf223f879adcef0e1fd93afcf` | Calculator, Dierys Design (asset 8263963) | Subscription, as above | Drew field Number. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-calendar-8086071.svg` | `20fddd8001fab68158d44be43d660db7a07b35fbf4110ef0ef58a9f130d5ba4a` | Calendar, Jagat Kreasi (asset 8086071) | Subscription, as above | Drew field Date, object Event. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-check-8265528.svg` | `600243b1867e2f2d85a413247571ac45686b376719b19e40ce1ebeecd8c5ce72` | Check, Dierys Design (asset 8265528) | Subscription, as above | Drew field Select. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-checklist-8265534.svg` | `99a10fe13a8ea002b0793ffd114a7b4cdc66f9d7b8ddbc85d5e11d54d9b2fb99` | Checklist, Dierys Design (asset 8265534) | Subscription, as above | Drew object Task. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-clock-8086073.svg` | `c6c669fa00f96d88782c61f11ce745bfe2258ec4befa313471382b83c323b800` | clock, Jagat Kreasi (asset 8086073) | Subscription, as above | Drew field DateTime, control Timeline. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-company-8265564.svg` | `0099513e303354f88b2ec1dda0d5450c993191cccefaea12c6fead2d295ea622` | company, Dierys Design (asset 8265564) | Subscription, as above | Drew object Company. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-copy-8086079.svg` | `0a545c647b61b3562698f204863697ff4ab84185fc0109f2c502f72145bf680c` | copy, Jagat Kreasi (asset 8086079) | Subscription, as above | Drew control Copy. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-database-8265520.svg` | `64c981601e1c2ef1fe78c1998ca6d3d351977b50fbc779e3c3daaa8dc0be7ce9` | database, Dierys Design (asset 8265520) | Subscription, as above | Drew object Table. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-diagram-8269845.svg` | `9fea842bd2bb0c61408ee5869ace453e3f0b68a238c78b13e930e1f3aa0799bb` | diagram, Dierys Design (asset 8269845) | Subscription, as above | Drew object Workflow, and diagram artifacts in Theorem UI until 2026-10-22; replaced there by `streamline/streamline-code-write-1.png`. |
| `records/noun-edit-8086055.svg` | `eac9c4392bee4c9e4d1c325231757818b510d20e90b5ff74a93376a2d4ebb844` | edit, Jagat Kreasi (asset 8086055) | Subscription, as above | Drew field Text. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-filter-8086076.svg` | `b42b29e93b91d656ca3b1c64bd8dfc5727e085a9c222723794d0be04d8ea82eb` | filter, Jagat Kreasi (asset 8086076) | Subscription, as above | Drew control Filter. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-folder-8259864.svg` | `dbfe6059dc96eaff782ee7a8c6b0ef6fd6248f5b3e515782562df39155cfae0e` | Folder, Dierys Design (asset 8259864) | Subscription, as above | Drew object Folder. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-hierarchy-8259865.svg` | `a2a68e0d488ca270621fcc2c9ce906a9b7e37bd14be67a90e4f94ff6193d2d42` | hierarchy, Dierys Design (asset 8259865) | Subscription, as above | Drew field MorphRelation. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-home-8086043.svg` | `1d69d8740bc4ea81e37869e655fe1734d4be0c2a1f42f226f90b08107fad5a36` | Home, Jagat Kreasi (asset 8086043) | Subscription, as above | Drew control Home. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-image-8265516.svg` | `ce0e27b9ce6ce74658b5ddcbb5df2cabd00ef1b9a65e0c9863a10cb8a9959f13` | Image, Dierys Design (asset 8265516) | Subscription, as above | Drew object Image. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-key-8266498.svg` | `4d114bba60339507a503df08dfe9c4ed65fc3e435d9ffc77ff350ea751bddf55` | Key, Dierys Design (asset 8266498) | Subscription, as above | Drew field Uuid. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-map-8265522.svg` | `87e3354c21cca6bde7913e63b15e07b7a011a308fc99af870890f51b9ef7f839` | Map, Dierys Design (asset 8265522) | Subscription, as above | Drew field Address. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-message-8086072.svg` | `7eed394b098c270e3b7103821376d8814024064124aec85a0bb5714aa654556b` | message, Jagat Kreasi (asset 8086072) | Subscription, as above | Drew field Emails. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-money-8268583.svg` | `1827bfa84a02cba779e94ba785a1face5000ebaccc0e23d31568c4b814f93665` | Money, Dierys Design (asset 8268583) | Subscription, as above | Drew field Currency. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-networking-8265531.svg` | `6555ae527a3dab3a916caa2a040f7888d567da3232d7e9ec88d0c2eecbf885d4` | networking, Dierys Design (asset 8265531) | Subscription, as above | Drew field Relation, control Graph. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-phone-8216256.svg` | `c60c1c8a000a68de610b932671e717ccd30a2a2101149da581b2cafde93cfe39` | Phone, Jagat Kreasi (asset 8216256) | Subscription, as above | Drew field Phones. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-pie-chart-8266514.svg` | `a55c9f56ee7c5b2227f4ec4a726f152331ace8acaf94ee2a1f27585249994dda` | Pie Chart, Dierys Design (asset 8266514) | Subscription, as above | Drew object Dashboard. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-profile-8086051.svg` | `7b0e022a49069e33bbd020f78df4f72d6ce37672818b2459280e78c56e7df74c` | profile, Jagat Kreasi (asset 8086051) | Subscription, as above | Drew field Actor, object Person. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-search-8086046.svg` | `55b83fc7be7e645f9c8f7ad0208ccfc144c57413410b4f3b91579ddcd666254f` | Search, Jagat Kreasi (asset 8086046) | Subscription, as above | Drew field TsVector until 2026-10-22; replaced by `streamline/streamline-search-square.png`. |
| `records/noun-sort-8086080.svg` | `0db2adcf0393c8c25f9f74509508288ffc04ac4bbf54530ae31a39cb0ee004a3` | Sort, Jagat Kreasi (asset 8086080) | Subscription, as above | Drew field Position, control Sort. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-star-8086065.svg` | `2a757f397f0c50ea4c021b2605af40c9620ec2b36bb68e164dc329cff68ac586` | Star, Jagat Kreasi (asset 8086065) | Subscription, as above | Drew field Rating. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-tag-8135485.svg` | `27436b2110209fcd0719e91d26a8793facdae82a31e1b3025397d8ce84c4f60b` | Tag, Dierys Design (asset 8135485) | Subscription, as above | Drew field MultiSelect, object Tag. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-target-8138418.svg` | `74cf675dbdda01ac106e6469cf946220639a54cacccbc52b8ff0ff04b4b7e46e` | Target, Dierys Design (asset 8138418) | Subscription, as above | Drew object Opportunity. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-user-8265523.svg` | `deb2f0b6a7ab4f41d2d3666d82aaca766e94849d4174a28d38a43513fc08f5e1` | User, Dierys Design (asset 8265523) | Subscription, as above | Drew field FullName. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-bookmark-8086052.svg` | `5ee161e932f87e0d1deaf0f72f5d8137f3ec9b5d6c6ea1e74dd49501d45fe21e` | bookmark, Jagat Kreasi (asset 8086052) | Subscription, as above | Drew control Highlight. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-gallery-8176259.svg` | `1b61f10108f4c002b1e29def325a0d539adb838ed7a51961e6e448d1748d71c6` | gallery, Dierys Design (asset 8176259) | Subscription, as above | Drew control CardsView. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-list-8130845.svg` | `a47746019c217c628c7309e6d112bb84c00b5e7bbfc4261ec87ac47259f5c3d6` | List, Jagat Kreasi (asset 8130845) | Subscription, as above | Drew control AddToList. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-menu-bar-8176279.svg` | `5b15ee60b18a22d1f573fccbaea3d336864a584012e0be52458bbd720a887cc1` | menu bar, Dierys Design (asset 8176279) | Subscription, as above | Drew control Split. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-reading-7143292.svg` | `27e134d0b3c9378e6c6638d32fa0368cf01bceea357fe295394a447137931347` | Reading, Dierys Design (asset 7143292) | Subscription, as above | Drew control Reader. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `records/noun-share-8086062.svg` | `cb31dfec3d9dfe315d09e7247cb9f4f4777c45316628a50e1b166c4a1f8fed11` | Share, Jagat Kreasi (asset 8086062) | Subscription, as above | Drew control Share until 2026-10-22; replaced by `streamline/streamline-share-1.png`. |
| `rail/noun-page-7936682.svg` | `f14a86ea7e4ede437e4a42ee81db4bf5ae3df8e999b47ea65b3365a27e44c19c` | Not recorded | Subscription, as above | Never recorded here. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `rail/noun-pages-8285393.svg` | `387d4d95fa53ed650caade86d4fe5f7c8f63c48e4966b14c8e37ab6b773001f9` | Not recorded | Subscription, as above | Never recorded here. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `tree/noun-file-8434068.svg` | `1e6655aa7a4755809bc860867e533dcce5a51cc73b45c476ad020beb5824f6be` | El Hikami / Noun Project, asset 8434068 | Subscription, as above | Drew the Projects tree's child rows. Removed 2026-10-22 with the other Noun files nothing in Theorem UI imports. |
| `composer/noun-web-8223212.svg` | `3286f48751a00c75407f02c1691729a6980717825fb9fdbea4f0b3a9ac763372` | Dierys Design, web (8223212) | Subscription, as above | Drew Search until 2026-10-22; replaced by `streamline/streamline-cross-region-data-delivery-2.png`. |

The Lucide files the kit bundles are no longer reached from this surface. They
remain in `gpui-component`'s own asset bundle for every other surface that
draws them; nothing was copied into or removed from this directory for them.

## Data surface marks

The owner asked on 2026-10-12 that the Data surface's Lucide icons be
replaced with the Noun marks the site already uses. These are the marks the
records table, its objects navigator, its view bar and the record sheet draw:
one per Commonplace field type (25, each distinct, so two types never read as
one), one per kind of object, and the table's and sheet's controls.
`crates/gpui/design/src/record_glyphs.rs` compiles them in and checks that
every file declares no colour of its own and that the field marks and the
sheet's three tab marks are distinct.

On 2026-10-22 Theorem UI deleted the Noun files it never imported. Their rows
moved to Retired, so the table below keeps only the marks Theorem UI draws, and
a file this section names that appears under Retired is no longer on disk.

The controls are drawn by the composer's hand, Jagat Kreasi's User Interface
set (ten files in its line 8 style, seven in its line 9 style; the Style
column names each). A field type or object that set does not draw comes from
Dierys Design (line 8), whose web mark the composer already carries: 17 new files
are Jagat Kreasi's and 23 are Dierys Design's. Every file is upstream's bytes
unaltered, retrieved once at authoring time; the app never calls the API.
The license basis is the one recorded under License above.

Reused from the families already admitted, with no new file: `composer/noun-attachment-8184735.svg` (field Files); `composer/noun-close-8086061.svg` (control Close); `composer/noun-settings-8086044.svg` (control Options); `rail/noun-chat-8216252.svg` (control Discuss, retired 2026-10-23); `rail/noun-nodes-138240.svg` (control Data); `rail/noun-note-8327985.svg` (object Note).

| File | Draws | Term, creator and asset | Style | SHA-256 |
| --- | --- | --- | --- | --- |
| `records/noun-add-8086054.svg` | control Add | add, Jagat Kreasi (asset 8086054) | line 9 | `f21760efeeb1a5769100af2a85c7a922932c3bd1bfd1764f6e8bda9c57494cee` |
| `records/noun-article-8259879.svg` | field RichText | article, Dierys Design (asset 8259879) | line 8 | `a9dfb8e8dde770060cca7f135801c30a5b93ab028da23d7e66cf33e7d116300b` |
| `records/noun-checkmark-8086058.svg` | field Boolean | checkmark, Jagat Kreasi (asset 8086058) | line 8 | `e8862eada7d2b77515052928c431114bf2054f78902f9d066631cea4e0313e08` |
| `records/noun-coding-8259870.svg` | field RawJson | coding, Dierys Design (asset 8259870) | line 8 | `33e0a160465156606072a83287ad90ebdc2c3895500add65574dd9a4742c05a9` |
| `records/noun-expand-8086092.svg` | control Expand | expand, Jagat Kreasi (asset 8086092) | line 9 | `ea84fb04d755d2779822ad12e05e486b07fa07b57987642a08a2a5b05d18f65f` |
| `records/noun-file-8259863.svg` | object Document | File, Dierys Design (asset 8259863) | line 8 | `b254f092adcd62e50b828024ef216f30ae97a24b52857eb489a755977d30ab5d` |
| `records/noun-link-8086078.svg` | field Links, object Link | link, Jagat Kreasi (asset 8086078) | line 8 | `224dbfbb1129c46d5d15233d5dc361716d217a10c5061986a63f176f775a283a` |
| `records/noun-menu-8086045.svg` | field Array, control List | menu, Jagat Kreasi (asset 8086045) | line 8 | `3778c1de67f89fb06c00dd446d37d6f52f33b07af5315d404913063bf00d3e47` |
| `records/noun-archive-8315826.svg` | control Archive | archive, Dierys Design (asset 8315826) | line 8 | `360f451f05cf79f01886688f5db93f8f92f58a7ab688cf6fe9d28af98ffc642d` |
| `records/noun-eye-8086063.svg` | control Unread | Eye, Jagat Kreasi (asset 8086063) | line 8 | `34f002e915ec846d0892446e012c1d05db82d366008a677204bde5db2853c873` |
| `records/noun-layout-8176268.svg` | control BoardView | Layout, Dierys Design (asset 8176268) | line 7 | `75fd929a467cd32dad81c264f8185d70a516740c5b1b6911b847a7d646827990` |

The record sheet folds its sections without a disclosure mark. Neither the
Jagat Kreasi set nor Dierys Design draws a chevron, and a chevron from a
third hand would sit beside the sheet's other marks as a different line. The
section header says its state in words ("Show", "Hide") and publishes it as
the semantic node's `expanded` state.

### The library's marks (2026-10-12)

The library (the Data surface's cross-type view of every record a reader
keeps) added nine files above, retrieved the same way: its view switch
(Table, Cards, Board, Calendar), the record page's Reader and Highlights tabs,
the Unread smart list, the bulk bar's Add to list and Archive, Export, and the
Split toggle. Neither family draws a sparkle, so Ask uses the conversation
mark the sheet's Discuss control already wears; asking about records is
taking them into a conversation. The navigator's section disclosure reuses
`message/theorem-next.svg`, Theorem's own chevron from the message bar,
turned a quarter when the section is open, and More reuses
`message/theorem-more.svg`; neither is a new file. Star, When, Move to, Tag,
Note, Table, Calendar and Open original reuse `records/noun-star-8086065.svg`,
`records/noun-clock-8086073.svg`, `records/noun-folder-8259864.svg`,
`records/noun-tag-8135485.svg`, `rail/noun-note-8327985.svg`,
`records/noun-database-8265520.svg`, `records/noun-calendar-8086071.svg` and
`records/noun-link-8086078.svg`.

## Closed gap

An earlier revision of this file recorded that no Noun rendition could be
admitted, on the reading that "the API is not reachable from a build". Section
12 forbids calling the API **during rendering** and forbids shipping its
credentials. It does not forbid retrieving an asset once, at authoring time,
and committing the bytes: that is what "bundle admitted assets locally" asks
for. The gap was a misreading of its own constraint, not a missing capability.

## Home and Writing optical calibration

Both files were retired on 2026-10-22 (see Retired); this records their
calibration.

`rail/noun-home-1570519.svg` was the owner's attachment with one attribute
changed: its view box `0 0 1200 1200` is now `305 305 590 590`, a square on
the painted ink (x 305.4 to 894.6, y 365.7 to 834.3 in the 1200 frame, centred
on 600, 600). Every path byte is the owner's. Without the crop the mark paints
41% of its cell at 20 px and the Stone rail reads 2.11:1 at 1x; the crop
raises the median stroke from 0.30 to 0.52 px, and with the oracle's 1.03
correction the Stone rail reads 3.37:1 at 1x and 4.91:1 at 2x. The window is
narrow: a square of 595 or wider falls below 3:1 on the Stone rail at 1x. Its
ink stays 27% under the family median at 1x, which a crop cannot fix, so the
style column stays owner-supplied and the authored line weight is unchanged.
The digest on disk was `1b5ac6f9ad59f7856f7312cd70b1553e8171bec5b063d834b0d070c1c84a52a9`;
the Retired row records it beside the owner's original.

`rail/noun-writing-8280302.svg` was registered with the rail family with its
bytes unchanged. Its ink ran 17% above the family median at 1x and 13%
above at 2x. The oracle derives its correction at 2x, where it is inside the
band, so no correction is recorded and the 1x heavy flag remains.

## Streamline Ultimate Light marks

These nine PNGs are from the owner's Streamline downloads, "streamline-ultimate-light--48x48-PNG.zip"
(Streamline Ultimate, Light style, 48 x 48, black ink on a transparent ground).
Each was copied byte for byte and renamed in lowercase with a `streamline-`
prefix. The app paints them as CSS masks (`.icon-mask` in `styles.css`), so the
bytes are unchanged and the ink follows `currentColor`. The license is whatever
covers the owner's Streamline plan. Streamline's free tier requires attribution;
a paid plan does not.

| Registry name | File | Streamline name | SHA-256 |
|---|---|---|---|
| Copy | `streamline/streamline-copy-paste-1.png` | Copy Paste 1 | `9700385580df9e3fe93d3e16bc22a54d029ed999d28528c0f00ee073473da8fc` |
| NewChat | `streamline/streamline-pencil-write-2.png` | Pencil Write 2 | `c6a0c709cb22bb6c5e1d4f5fd75494a6546461196d7b368cf7fbc0526f761bf8` |
| Search | `streamline/streamline-search-square.png` | Search Square | `df992de155819ffba277e44c678ef72058103fe1dbb1b1918c797108a15379f2` |
| Send | `streamline/streamline-send-email-1.png` | Send Email 1 | `f8f28286ecb00457a400fb6dfd2bc15d0c66c71f2fd4e58d37c0bc5b03e32d17` |
| Share | `streamline/streamline-share-1.png` | Share 1 | `6dce180df4d355ff4a0597747ac74474aeadc7355ae08c0f312f0ec762586776` |
| Web | `streamline/streamline-cross-region-data-delivery-2.png` | Amazon Web Service Cross Region Data Delivery 2 | `bf2af3fedbfe2ef27e2326eefa76bc188a32bd7b2f02fb483e1e412cc0fdaeb5` |
| Diagram | `streamline/streamline-code-write-1.png` | Code Write 1 | `7108b54d95e8fd3989dfa09beabab4801dcb5413090db1919eed87a89a70289f` |
| Folder | `streamline/streamline-folder.png` | Folder | `f2c5c9fd0f6f8ad25bf7ef6c61879d89ad68211c06734c68bd4bdc613c8d926e` |
| FolderOpen | `streamline/streamline-file-open.png` | File Open | `e62ed40466af24caa37dc1b970e9e24d3f76073ebc877701ddda7c8ecf6a637a` |

The files they replace in the registry are listed under Retired.
