# Theorem Notes: a programmable object workspace

**Design and implementation proposal · Revision 1.1 · November 27, 2026**

**Revision authority:** This revision supersedes the original Notes redesign handoff wherever the original implied a fixed type vocabulary, a privileged set of built-in classes, or a later optional custom-type feature. The Craft-inspired visual direction, Capacities-inspired browsing and graph, and existing artifact ownership constraints remain in force. The central change is a launch requirement: users can define new first-class object classes without changing or recompiling Theorem.

## 1. Direction and scope

Give Notes the page and editing experience Travis likes in Craft, with the object navigation, collections, and graph he likes in Capacities. Make existing working artifacts recognizable as objects alongside written notes. The result should let someone find a thing, understand what it is connected to, and continue working with it in the same place.

The key product decision is to treat Notes as a familiar entrance to the user's programmable ontology. A written note, a live App, a notebook, a person, and a project have different bodies and actions, but share navigation, identity, properties, relationships, and history. This follows the earlier Macro discussion’s goal of making the graph tangible through ordinary work.

**Theorem supplies the primitives; the user decides what their world consists of.** Pages, Apps, Notebooks, Diagrams, Sources, People, and Projects are proposed standard-library classes, not an exhaustive classification of the world. The platform is to be a useful distribution of a programmable harness, in the spirit of the “Linux of harnesses” direction. A user-created class must participate in the same core object contracts as a shipped class. It must not be a lesser kind of record hidden behind a generic “custom” category. Specialized native owners can supply additional capabilities, but first-class status is not determined by who authored a class.

Open-ended class authoring is part of the first release of this redesign. Individual engineering slices can ship internally in sequence; the integrated feature may not be called complete with only the shipped classes working.

This proposal covers three connected screens: **Library**, **Object**, and **Graph**. It also specifies the object contract, collection semantics, migration boundaries, and implementation sequence required to make those screens truthful. It does not propose a replacement database or a new artifact execution system.

### Evidence and interpretation

The supplied Theorem screenshot shows a working particle-field artifact inside Notes, with **Stop App**, **Edit source**, **Ask about this App**, and **Reload** actions. Its title appears in a long notes list, surrounded by ordinary notes. Preserve that working behavior, its title, and its available actions while making its type and relationships visible.

Craft references selected for this proposal are its [gallery](https://mobbin.com/screens/f1e786de-6930-4b0d-ab6f-569c18ce263b), [editor](https://mobbin.com/screens/fe902442-73f0-4633-bbd6-84b521fe9b9d), and [embedded collection](https://mobbin.com/screens/e88f0359-db97-4ae0-add3-6515ea71bd9a). These are visual references for the page, cards, spacing, and content presentation. The supplied Capacities screenshots establish the requested object sidebar, collection screen, and graph direction.

Capacities documents [object types](https://docs.capacities.io/reference/content-types), [collections](https://docs.capacities.io/reference/collections), [queries](https://docs.capacities.io/reference/queries), [graph view](https://docs.capacities.io/reference/graph-view), and [backlinks](https://docs.capacities.io/reference/backlinks). Its collections organize objects of the same type. Theorem should deliberately extend this with mixed-type collections: a project’s research can contain notes, people, sources, and working Apps together. This is our proposed behavior, not a claim about Capacities.

## 2. What already exists

Source inspection used Theorem-UI main at `99614b5120de5980bc9b9cccf0c042180324a7ee` and Theorem main at `903bc4deb5e912023e55506b7bd4fb1196468c4d`. These observations establish implementation ownership; they do not establish the state of a deployed session.

Notes already reads Documents v2. Saved artifacts use `documentKind: theorem.app`. When such a document opens, `NotePanel` renders it through `useDocumentArtifact` and the shared `ArtifactView`, preserving its interactive form. Notes and chat therefore can show the same durable document, rather than independent copies. See the [notes reader][notes], [Notes artifact branch][note-panel], and [saved artifact adapter][saved-artifact].

The `AppDocument` owner already coordinates canonical source, persistent state, revision checks, and a shared save queue. Notes opens the current head; older conversation revisions remain pinned. All saved publication forms currently retain the storage kind `theorem.app`; the source block’s `artifactForm` distinguishes non-HTML forms. Missing form metadata preserves the legacy HTML interpretation. See [AppDocument][apps] and [backend publication][publication].

Theorem also already has a schema register exposed through Index/CRM, including declared object types, typed properties, relation cardinality, observed shapes, and guarded schema edits. Notes should present and extend this register. It should not maintain another set of incompatible type definitions. See the [record API][record-api] and [object contracts][record-contract].

This is carried forward from the original pinned inspection. Revision 1.1 adds product and engineering requirements; it is not a new inspection of the repository. In particular, the current register's support for stable class identity, schema revisions and migrations, native adapter registration, class-scoped operation bindings, export/import, and runtime discovery must be checked before implementing them. Do not equate the existence of a schema editor with proof of first-class extensibility.

## 3. Screen one: Library and collections

### Navigation

Keep Theorem’s global navigation rail. Within Notes, replace the undifferentiated long document list with a sidebar organized around the user’s destinations:

- **Search** and **New**, with a searchable class chooser and a separate **New object class** action. Creating an instance and defining a class are distinct operations.
- **All objects**, **Recent**, and **Favorites** for broad retrieval.
- **Object types**, populated from the effective, authorized class registry. A new class is immediately available through the same chooser, class library and navigation as the shipped classes. Pinning controls placement, not whether a class exists. Include **Manage classes** for browsing, editing, installing, and retiring definitions.
- **Collections**, for intentional groupings that can contain several types.
- **Saved views**, for reusable queries.
- **Graph**, **Agent notes**, and **Trash**, preserving those distinct destinations.

The type list should be configurable and collapsible. Pin frequently used types; put the rest behind a visible expansion control. The default distribution may pre-pin Pages, Apps, and Notebooks; users can unpin, hide, and reorder these just as they can any other class. Neither sidebar nor creation menu contains a closed domain-type switch. Newly registered classes are discoverable even when empty. Each row has a small type icon, a text label, and a real count when available. Selection uses a restrained surface change. Type color helps recognition without replacing labels.

### Main content

The Library opens with a page title, a short optional description, and one primary creation action. Below it, a compact toolbar holds search, filters, sort, and the available view switcher. Keep those controls in stable positions when switching between All objects, a type, and a collection.

Cards emphasize content: a readable excerpt, an image, a diagram, or an artifact preview above the title and a small type label. Avoid filling cards with empty property rows. Show only the properties the chosen view requests. A list or table view supports denser work without forcing the gallery to serve every task.

An App card uses the artifact registry’s preview representation. Opening it requests its working representation. A gallery must not start every App or notebook merely to draw thumbnails. If a preview is unavailable, show the title, type, and a clear placeholder; the object remains usable.

### Collection semantics

A collection is a named, curated membership set. Adding an object references its canonical identity; it does not move or copy its content. An object may belong to several collections. Removing membership does not trash the object.

A saved view stores a query and presentation settings. Its results change when objects match or stop matching. It must show its active filters and distinguish a query change from a change to object data. Both curated collections and saved views can display cards, lists, or tables, but their membership behavior remains explicit.

Keep four concepts and their actions distinct:

| Concept | Meaning | User action |
| --- | --- | --- |
| Folder | Existing filing location | Move to folder |
| Collection | Overlapping curated membership | Add to collection |
| Saved view | Results of a stored rule | Edit filters |
| Project | An object with content, properties, and relationships | Link to project |

A Project page can display a saved view of objects linked to that project. It should not require a parallel collection membership that can disagree with the relationship.

For example, a “Theorem research” collection could contain a note, the particle-field App, a notebook, and a project record. The Apps type screen would show that same App automatically. Its memberships are additional ways to find it.

## 4. Screen two: an object page

### Page structure

Use one quiet header with a breadcrumb, type icon, editable title where supported, save status, and relevant actions. The body follows the object’s native form. Written notes use a comfortable reading column; working Apps and large visualizations can use the full available body width. A compact properties summary can sit beneath the title without crowding the content.

Preserve the particle-field title and its current actions. “Stop App” belongs to a confirmed running instance; an unopened saved App should offer the action its host actually supports. “Saved” describes persistence and must not imply that execution is running or complete. Editing source continues through the existing source owner.

For a note, the page body remains the editor. For an App, it remains the live artifact. For an Observable or marimo notebook, it remains the appropriate notebook renderer. For a Person or Project, it can combine registered properties with linked notes and related objects. All share an object header and consistent opening behavior.

A class without a custom renderer opens in a fully usable generic object page: editable schema-driven properties, rich content where the class declares it, links, collections, history and supported actions. The same generic path applies to shipped classes that do not need a specialized body. A specialized view is an optional projection, never a prerequisite for creating or managing the class. An unavailable custom renderer must degrade to this generic surface without running untrusted code or discarding data.

### Context inspector

An optional inspector holds information that should be close without consuming the writing surface:

| Section | Content and behavior |
| --- | --- |
| Properties | Fields declared by this object’s type; editable only through the owning API. |
| Collections | Memberships with add/remove actions that leave the object intact. |
| Connections | Typed incoming and outgoing relationships, grouped by meaning. |
| Origin | Source conversation, message, run, or captured source when available. |
| History | Revisions and activity, with clear distinctions between source changes and runtime state. |

The inspector should open a related object in the current pane or to the side. Reuse Notes’ existing Dockview tabs and splits; opening the origin conversation should return to the relevant message when that reference exists. See the existing [Notes workspace][workspace].

Missing provenance is an honest empty state, not an invented conversation link. Historical revisions retain an obvious historical label. An action to continue from history must deliberately create or select the correct working target.

### Connections in the page

Backlinks and typed relationships complement each other. “Mentioned in” answers where someone referred to this object. “Created from,” “belongs to project,” or “uses dataset” explains a declared relationship. Display those labels rather than combining everything into a generic related-items count.

A small local graph can be opened from the inspector, but the default connection list remains usable by keyboard and readable without interpreting a diagram. An embedded collection in a note should reference the same collection or query, with a clear route to open its full view.

An incoming relationship is reverse navigation over the same directed edge. It must not become a separately editable duplicate that can disagree with the outgoing relationship.

## 5. The object contract

Separate the object’s meaning from its renderer and storage representation.

| Layer | Example | Responsibility |
| --- | --- | --- |
| Canonical identity | Existing document ID | Stable target across Notes, chat, collection, and graph. |
| Storage kind | `theorem.app` | Selects the established persistence and revision owner. |
| Renderer form | HTML App, Observable, marimo, OpenUI | Describes how the body is stored and presented. |
| Object class | Stable registered class ID (label: App, Notebook, Building, Research hypothesis) | Describes meaning, fields, relationships, and navigation independently of origin. |
| Capabilities | Preview, open, edit, run, inspect source | Exposes actions this owner and renderer actually support. |

Do not rename `theorem.app` to `notebook` to make notebooks first class. Current loaders explicitly check the storage kind. Instead, project the appropriate user-facing type from the canonical form or registered metadata. A visualization can remain an HTML App while receiving a more specific semantic type later.

The schema register’s provider descriptors already distinguish native views, declared records, derived programs, and connectors. Evaluate those existing mechanisms for document/artifact adapters. The adapter should point to the native owner, not create a second editable copy of the content. The register already has extension metadata for presentation hints; add icon, color, and preferred layout there where the existing contract permits it. See [object contracts][record-contract].

### 5.1 One registry; a standard library, not a closed ontology

The effective class registry is the common discovery and validation contract for Notes, Index/Records, the harness, search, graph, APIs, and other authorized consumers. Reuse the existing schema register and extend its canonical owner where necessary. Do not create a parallel Notes class store or require a new Rust enum variant, front-end conditional, dedicated API endpoint, top-level model tool, or core release for every domain class.

Shipped definitions and user-defined definitions register through the same public class contract. Native adapters and low-level storage implementations may be built-in; that is a distinction in implementation or authority, not in ontology. Class registration must not itself select an arbitrary native storage owner or confer access to it. The same declared capability requirements and authorization rules apply to both classes.

The first distribution should supply Pages, Apps, and Notebooks with reliable native adapters. Reuse existing registered Project, Person, and other record classes when their owners expose the required fields and actions. Keep Agent notes visibly attributable and preserve the permissions enforced by their existing owner. Additional artifact adapters for scenes, diagrams, code and datasets may follow as their canonical identities and lifecycle contracts become available. Adding a semantic class does not depend on adding a bespoke artifact adapter.

A class is a durable, addressable, versioned definition with its own stable identity. An object instance refers to the class identity and an applicable schema revision. Human labels, icons and navigation placement are presentation metadata, not identities. Properties and relationship declarations have stable identifiers independent of labels. Definition origin and dependencies are inspectable. A minimal core metamodel can bootstrap the registry without requiring an infinite hierarchy of class-of-class definitions.

The following vocabulary is conceptual. The implementation must map it to the existing schema owner rather than introducing these names as a competing API by default.

| Dimension | Class definition may declare |
| --- | --- |
| Identity and semantics | Stable class ID, namespace, singular/plural labels, description, revision, origin. |
| Properties | Stable field IDs, types, defaults, requiredness, constraints and display hints. |
| Relations | Named, directed relations, permitted target classes or any-object targets, cardinality and inverse display labels. |
| Content and ownership | Optional rich content, references to canonical artifacts, and permitted owner adapters. |
| Views | Preferred object body, preview, gallery/table field selection, optional specialized renderers and fallback. |
| Operations | Typed inputs and outputs, declared effects, capability references and user-visible actions. |
| Computation | Formulas, derived values and explicit refresh/invalidation rules; computed values are not confused with asserted facts. |
| Lifecycle | Optional states, transitions, events and authorized workflow bindings. |
| Permissions | Policy requirements and scope constraints, enforced by the existing authority boundary. Definitions cannot grant themselves additional rights. |

Only the minimal identity, semantics and valid schema are required for a simple class. A Book class can be useful without a custom renderer, runtime or lifecycle. A Simulation class can declare richer views and behaviors without changing Theorem's core. Avoid making every class a program, every graph node an object in Notes, or every object an actor.

### 5.2 Class authoring experience

Keep the agreed Craft visual treatment. The class editor is a normal workspace surface, reachable from **New → New object class**, the type sidebar and **Manage classes**. It should begin with a compact form: name, icon/color, description and properties. Advanced sections expose relations, views, behavior/computation, lifecycle and permissions. Offer a preview of a generic instance and of its card or table row using a draft definition; preview must not perform live effects.

Three authoring paths are peers:

- **Direct manipulation:** define fields, relationships and display metadata in the editor; save a valid class and immediately create an instance.
- **Conversational:** ask the agent to design a class in ordinary language; inspect its proposed definition and apply it through the same authorized registration operation. Drafting a definition is not permission to publish it or execute its behaviors.
- **Programmatic:** register or update the same definition through existing harness/SDK/CLI operations where supported. Make the canonical operation available through capability discovery, rather than inventing a second source of truth for code-authored types.

All three write the same versioned definition and receive the same validation, scope and conflict checks. Changes initiated outside Notes become discoverable in Notes through the same registry refresh/invalidation path. No manual UI mapping is required. A class may be created even when it has no instances. Selecting its empty library offers creation rather than an unavailable placeholder.

### 5.3 Class evolution and composition

Class definitions may reference or compose reusable schemas and capabilities. Prefer explicit composition and declared dependency versions over a new unrestricted multiple-inheritance system. A definition with unresolved dependencies or conflicting fields must fail validation with a useful reason rather than silently acquire a different meaning.

Renaming a class or field preserves instance and field identity. Adding an optional field does not erase old values; defaults, missing values and stored values remain distinguishable. Before applying an incompatible change (such as field type conversion, stricter cardinality, or removal), inspect the affected instances, present the migration plan, validate the result, and preserve the previous committed definition and data until the new state is safely activated. No silent coercion, relation loss or instance recreation. Historical reads use the appropriate historical semantics; new writes use the active version or a defined compatible revision. Concurrent edits must not quietly overwrite another accepted revision.

Retirement stops new instantiation by default but retains existing objects, references, and definitions necessary to read history. Hiding/unpinning is purely a placement preference. Removing an extension or renderer must not delete instances. Destructive removal of an in-use definition is refused or requires an explicit, separately authorized migration/deletion of the affected data.

Export class definitions with stable IDs, versioned dependencies, and their declared view/operation references; keep instance export a separate explicit choice. Import validates the manifest, resolves dependencies and name/ID collisions without conflating distinct classes, and does not activate code or grant permissions implicitly. If a dependency is unavailable, preserve readable data and report the unsupported behavior. This lays the groundwork for installable domain packages; a public marketplace is not required for the first release.

### 5.4 Operational objects and harness discovery

A custom class must be useful to agents as well as to humans. The harness discovers registered classes and schemas when relevant, searches and reads instances, creates or changes instances through the canonical owner, follows typed relations, and discovers applicable operations using the existing capability machinery. Schema information can enter context on demand; do not append all class definitions or their operations to the model's stable prompt. Registering a class must not require a new hardcoded model tool.

For behavior, reuse Theorem's existing operation registry, programmable graph and authorized execution/runtime boundaries. A class action binds a capability with a typed object/revision target and typed inputs/outputs, declared effects, applicable scopes and execution limits. Invocation passes through the real owner and permission gate, generates the usual result/receipt, and records relevant outputs or provenance by reference. A UI button and a harness invocation must resolve the same operation. Custom code is optional and must run with explicit grants, resource limits, and isolation. A definition alone never grants network, filesystem, browser, credentials, cross-object access or background execution authority. Lifecycle-triggered behavior needs explicit activation, cancellation and retry/idempotency semantics; registering a class must not silently trigger it.

For example, a person creates a Building class with address, construction date, floor area and condition, relates it to a Project and a Source, and uses the generic property and relationship editor. They then optionally bind an already available procedural reconstruction capability. It produces a scene reference and evidence, not an independent copy of the building. A specialized 3D view may be added later; the object remains useful without it. This is an illustrative workflow, not a claim that a production building integration already exists.

### One artifact across surfaces

The particle-field App should have one canonical identity and one source/state owner. Its Notes page, chat appearance, collection card, and graph node are representations of that object. Revisions remain revisions of it. A deliberate duplicate or fork creates a new identity and retains a relationship to its origin.

Cards should resolve metadata and a preview without starting execution. A live body resolves the current head through `AppDocument`. Historical results remain pinned to the exact revision they describe. Source revision, saved interactive state, and a stored computational result should not be collapsed into one ambiguous “version.”

Define the multiple-open runtime policy before integrating live bodies. Two panes showing the same document must not accidentally start two executions. Prefer attaching both to one active runtime instance when the host supports it; otherwise expose a deliberate separate-run action. Active runtime status is separate from both saved state and source revision. Closing a preview is not an implicit request to stop shared work.

Automatically list recognized, durably published document-backed artifacts. A transient code block or diagram in chat does not become a durable object until its publication or promotion owner supplies identity and persistence.

## 6. Screen three: Graph

Offer three scopes using the same objects and relationships:

- **Local:** the selected object and a bounded number of relationship steps.
- **Collection:** members of a collection or saved view, with an explicit option to include connected objects outside it.
- **Global:** an overview of the accessible object graph, with filters and progressive expansion.

Local scope is the most useful initial entry from an object page. Global scope remains available for exploration. Collection scope explains the context someone is actively working in. The current scope, filters, and any result limit should be visible; a bounded result must not imply it contains the entire graph.

Resolve class icons, labels and colors from the same registry used by the sidebar. Class filters must include authorized user-created and installed classes without a hardcoded list. Selection should show the object’s title, type, and relationship details in an inspector. Clicking a node opens or previews that object; it does not silently start an executable artifact. Preserve positions during filtering and expansion where possible so the diagram remains understandable.

### Relationship meaning

| Relationship class | Proposed presentation |
| --- | --- |
| Explicit | User-created link or declared relation, with its actual label and direction. |
| Recorded provenance | “Created from,” “produced by,” or similar relation supported by a receipt or source reference. |
| Inferred | Suggested association, visibly distinguished and accompanied by available evidence or rationale. |

A high similarity score alone must not be drawn as an asserted dependency or factual claim. Likewise, a real provenance relation should not be weakened into a vague similarity. The inspector should explain why an edge exists and offer the actions appropriate to its owner, such as opening the source or accepting a suggestion.

Provide an equivalent list of the scoped objects and relationships. Search, filtering, selection, and opening should work there too. Reduce or suspend force motion once a layout settles, honor reduced-motion preferences, and keep graph controls outside the drawing surface’s selection targets.

The existing vault graph offers local-depth and visibility filters, but its model is path-based and collapses links into undirected pairs. It is not a ready-made typed object graph. Reuse useful rendering and interaction work selectively, with a new read adapter preserving canonical IDs and edge metadata. See the [vault graph model][vault-graph].

## 7. Appearance and responsive behavior

Use Craft as the primary visual reference: a composed page, deliberate content widths, restrained controls, and cards whose contents establish the hierarchy. Keep Theorem’s warm purple and gold as measured accents for selection, focus, and type recognition. Avoid tinting every panel or placing several competing toolbars above the content.

Proposed starting tokens are a sidebar around 240–270 CSS pixels, 16–18 pixel reading text, line-height near 1.5, and a prose measure around 65–75 characters. These are design starting points to inspect in rendered screens, not claims of universal optimal values. Artifact stages can expand beyond the prose measure. Object titles should wrap predictably instead of hiding the distinguishing words in a long list.

Light mode uses separated paper and surrounding surfaces with legible secondary text. Dark mode uses the same hierarchy and color roles, rather than simply inverting the light palette. Type color always has an accompanying icon or label. Focus indicators, selected states, and error/save messages remain visible in both themes.

At narrower widths, collapse the sidebar into navigation and open the context inspector as a sheet. Preserve the main object body. Avoid squeezing an editor, sidebar, and inspector into three unusable columns. Tabs and breadcrumbs can shorten, while the full title remains available on the page.

Keyboard behavior should be consistent: search is reachable, card and row activation open the same object, menus expose their actions, and focus returns to the invoking control after an inspector or dialog closes. Test long titles, large text, and mixed content rather than judging only an ideal short-label fixture.

## 8. Folder migration and API gaps

Current Notes folders are document collections used as filing destinations. The existing move workflow corrects a filing receipt and treats membership as exclusive. Preserve these folders and receipts during the transition. Do not silently reinterpret them as the new many-to-many curated collections. See [folder and filing behavior][folders].

An initial migration can retain a “Folders” section or present each old folder through a compatible view. New collection membership should be explicit and independent. A later migration may offer to convert folders into curated collections, preserving names, contents, and source identifiers. Removing a collection must never imply deleting its members.

The principal API and registry work is bounded:

1. **Gallery summaries:** expose enough identity, type, renderer form, preview availability, and revision metadata to draw cards without loading every canonical body.
2. **Membership and saved views:** establish distinct operations and persistence for curated membership and query definitions, including pagination and stable filtering.
3. **Object adapters:** connect native document/artifact owners to the existing schema register and shared opening contract.
4. **Relationship reads:** preserve edge direction, type, source/provenance, and inferred status where supplied. The current record decoder reduces outgoing edges to ID arrays, so it is insufficient for the proposed inspector.
5. **Origin references:** expose saved conversation/message/run links where records actually retain them; retain unavailable states for older objects.
6. **Class definition and evolution:** inventory the schema register’s real read/write contracts and authorization, converge standard-library and custom definitions, and fill missing identity, versioning, validation, migration and import/export seams through that owner.
7. **Operational discovery:** connect class and instance lookup, generic mutation, and class-scoped capability discovery to the real harness path. Reuse existing execution and permission owners; do not create a Notes-specific runtime.

A registry update needs a coherent readback path. After a committed definition is registered, authorized class enumeration, instance creation, search indexing, graph filtering and the agent's schema discovery must agree on identity and applicable revision. Where an index or projection is asynchronous, show a truthful pending/failed state, and verify eventual visibility; do not report a successful registration as proof that every consumer is already updated.

Documents v2 already supplies stable identity, revision, origin, actors, collection references, and list pagination. Extend those contracts thoughtfully instead of placing the full responsibility on browser-only metadata. See the [document contract][documents] and [record API][record-api].

Gallery summaries and graph projections should be derived and rebuildable; document mutation stays with the canonical owner. If projection updates cross storage boundaries, a proposed approach is an identity- and version-bearing event with an idempotent projector, avoiding independent writes that can drift. That transaction path requires implementation review. Counting types and drawing cards should never require loading every full source body.

## 9. Implementation phases and acceptance

### Delivery sequence

**Phase 0 — verify and converge the class contract.** Inspect the current schema register and its write owners, class and field IDs, revision semantics, authorization and active consumers. Map shipped definitions, native adapters and generic records to one discovery/validation contract. Establish a generic class with no application-specific code path. Define the migration of legacy types and existing references before any incompatible change. This is a prerequisite to claiming registry parity, not a separate ontology rewrite.

**Phase 1 — registry-driven Notes and real class authoring.** Restyle the Notes shell, reuse Dockview and register native Pages/Apps/Notebooks as initial standard-library definitions. Wire the dynamic sidebar, type chooser, class manager, class editor and generic object body. Prove that a user creates an unforeseen class, saves it, creates instances and can reopen them without restarting or rebuilding the application. Preserve the existing particle-field App and ordinary note editor and save behavior.

**Phase 2 — collections and context.** Add explicit curated memberships, saved views, object header, properties/origin/history sections, and generic cross-class references. Acceptance: a custom-class instance appears in its type view and two collections; editing it is visible through all openings; removing one membership leaves the other and the object intact. Missing provenance is honest. Verify a compatible schema change and a refused or safely migrated incompatible change.

**Phase 3 — typed connections, graph and harness integration.** Add the richer edge adapter, object/collection/workspace graph scopes, accessible relationship list, and authorized class discovery and instance operations through the real agent path. Include a class-specific registered capability and prove that its UI and agent invocations share the same operation owner and enforce permissions. A denied action cannot mutate underlying objects. Prove standard and custom class parity across all three surfaces.

**Phase 4 — portability and integrated acceptance.** Round-trip a custom class definition and instances (when explicitly included) through supported export/import, preserve dependencies and identities or explicitly remap references. Verify fallback behavior when a renderer or capability is unavailable, restart persistence and authorization. This phase closes the first redesigned Notes release. Additional native artifact adapters can then be delivered in bounded work without delaying user-defined semantic classes. A public package marketplace, arbitrary inheritance system and specialized renderer for every class are not release requirements.

### Technical requirements and acceptance register

These requirements are release-blocking for the integrated feature. Use them as the technical-requirements companion for this bounded amendment. Each has a stable ID, responsible boundary, and observable verification. Exact API names and persistence details remain subject to Phase 0 inspection; fixture success alone is not proof of end-to-end reachability.

| ID | Boundary and required behavior | Required proof |
| --- | --- | --- |
| OC-01 | Schema owner: shipped and custom definitions are registered/discovered through the same contract; no closed domain enum determines eligibility. | Register an unforeseen class on a running application without modifying source, rebuilding or restarting it. Enumerate shipped and custom definitions through the same real API. |
| OC-02 | Notes: class creation is distinct from instance creation; dynamic navigation and the generic object body derive from the registry. | Create a class with no instances, then add instances; pin/unpin, rename, open and edit them; verify the chooser, class library and card/table views update. |
| OC-03 | Instance owner: class identity, field IDs, revisions and content ownership remain stable. | Rename a class and field; reopen the same instance from its original links, collection and graph. Existing artifacts keep their canonical IDs, saved state, revision and current-head semantics. |
| OC-04 | Schema/relationship owner: field types, requiredness and directed target/cardinality constraints are enforced for every caller. | Invalid mutations from UI and harness are refused without partial writes; a valid cross-class link appears as one directed relation with inverse navigation. |
| OC-05 | Library/search/graph: no privileged built-in-only indexing, filtering, membership or navigation. | A newly created class is discoverable; instances participate in full-text/appropriate property search, filters, saved views, mixed collections, local and workspace graph and accessible list. Verify explicit versus suggested edges and permission-filtered counts. |
| OC-06 | Harness: class discovery, schema inspection, instance operations and authorized relationships use the real registry/owner. | Ask an actual agent to create or find an instance of a previously unknown custom class and link it to a shipped class; read back the committed changes via Notes. No hardcoded new tool or prompt change. |
| OC-07 | Class authoring: visual, conversational and programmatic creation converge on canonical validation and versioning. | Create or update definitions via all three routes, verify the same IDs/revisions through the canonical read API, and refuse stale or invalid edits consistently. |
| OC-08 | Presentation: generic fallback is fully usable; specialized views are optional projections. | Open a user-created class without any custom renderer; add a compatible specialized view and then disable it; verify the same object/fields/links and generic editing remain. Preview does not start Apps. |
| OC-09 | Capability and runtime owners: optional class actions bind real authorized operations, not unchecked scripts. | Bind an existing safe computation to a custom class; invoke it via UI and harness with the same typed target. Verify outputs/receipt and deny an unauthorized invocation; preview never executes effects. |
| OC-10 | Schema evolution: compatible additions, incompatible migrations and concurrency preserve accepted state. | Add optional field; preview and apply or refuse a type conversion/cardinality change; inject migration failure and stale write; reopen old committed data and verify no silent loss. |
| OC-11 | Retirement and preferences: unpin/hide, retire, uninstall and delete have different effects. | Hide a class without altering instances; retire it without orphaning links/history; remove its renderer and retain fallback; refuse unsafe deletion of an in-use definition. |
| OC-12 | Portability: definitions are durable, versioned and exportable; dependencies and privileges are explicit. | Export/import a custom class and explicitly chosen instances into an isolated workspace; verify fields and links, collision handling and missing-dependency fallback. No implicit permission grant or execution. |
| OC-13 | Authority and retrieval: scope applies to schema reads, instance reads, graph edges, search and effects. | Use two isolated authorization scopes to prove private class metadata and instances do not leak via search, counts, graph, preview or agent discovery; ungranted operations refuse without effects. |
| OC-14 | Durable artifact owner: existing published Apps/Notebooks remain recognizable first-class objects. | Publish a real artifact; find it through its class and collection; open via a linked note; revise its current head and confirm historical chat references remain pinned. Verify multiple-open and failed-save behavior. |
| OC-15 | Persistence and UX: registry and object identity survive reopen; missing projections or errors are explicit. | Restart the actual application; recover custom definitions, instances, relations, membership and saved views; check narrow and dark layouts, long labels, keyboard flows and unavailable previews. |

### The architecture-complete acceptance journey

Use a new class chosen by the reviewer at test time, not a class preprogrammed by the implementer. The illustrative name “Building” is not an acceptance fixture that may receive special-case code.

1. In the running Notes app, create an unforeseen class with a description, two differently typed fields and a directed relationship to an existing class. Save it, observe it in the registry, sidebar/chooser and an initially empty library.
2. Create two instances using the generic editor. Link one to an existing Page, Project or Source, add it to two mixed-type collections, and find it again using search and a saved view.
3. Open its graph, select the labeled relation, and follow it to the existing object. Verify that the same object identity and provenance are used in both directions and in the list alternative.
4. Ask the live agent to discover the new class and make an authorized instance change. Reopen Notes and inspect the committed change. Bind and exercise one existing authorized computation; verify both UI and harness invocation and a permission refusal.
5. Rename a field and add an optional field without losing data; exercise an incompatible-change refusal or explicit migration. Disable a specialized view and prove the generic page remains usable. Close and reopen the actual application.
6. Export/import the class in an isolated environment, including instances only by explicit choice. Verify reference resolution and fallback for unavailable dependencies. Separately verify the existing saved artifact's current and historical revision behavior.

**Completion rule:** If any step requires changing Theorem core source code to recognize that class, or if the agent can only understand it through a manually rewritten prompt, the extensibility requirement has failed. A visually convincing mock, a predeclared sample class, or a schema-only API test does not satisfy the release gate. Verify the mounted application and real harness path.

## 10. Prototype and production boundary

The original accompanying single-file HTML prototype remains a visual review surface using illustrative content. Revision 1.1 changes the specification and acceptance gates; the prototype itself has not been modified or retested in this revision and does not demonstrate class registration or the class editor. It implements library and collection navigation, search, type filtering, gallery/list switching, object views, local note and source drafts, light/dark appearance, and graph scopes with an alternative relationship list. Its particle canvas runs locally and supports pause, restart, and orbit controls. Source drafts do not execute, and prompt drafts do not send a message to an AI. Local edits and preferences use browser storage.

All counts and relationships describe the sample workspace. Its examples do not establish backend persistence, real account data, working production provenance, the existing production artifact runtime, or a completed migration. The sample's Pages, Apps, Notebooks, Diagrams, Sources, People, and Projects illustrate a standard-library distribution only. Its static sample type list must not be carried into production as an enum, fixed navigation menu, or acceptance boundary.

Production implementation must connect the approved interactions to the owners identified above and verify the stated acceptance criteria. No production deployment, repository change, or successful integration test is implied by this proposal. The historical verification record below states the original prototype checks. Revision 1.1 does not claim that any OC requirement has been implemented or passed.

## 11. Prototype verification record (original revision, retained)

The original handoff records the following checks in a live browser. These are historical observations of the unchanged prototype, not new verification of Revision 1.1:

- Library gallery; type filtering to two Apps; list view; search for a transformer Page and opening its content.
- Collection overview and mixed-type collection counts, driven by the same sample objects.
- Working particle canvas, Stop/Run, and the source view pausing the canvas with a visible state label. Source drafts remain non-executing.
- The object-local graph, full-workspace graph, explicit directed edges, opt-in suggested edges, object selection, and the alternative relationship list.
- Light desktop layouts at 1536 × 1000 and 2048 × 1231; a dark graph view at 1536 × 1000; and the artifact view at 390 × 844.
- A syntax check of the single-file JavaScript.

Visual review led to larger graph labels, directional arrowheads, an accessible graph container and focusable nodes, a clear paused state in the source view, and an initially closed inspector on narrow screens. The mobile sidebar now tracks the 760-pixel layout breakpoint with inert/aria-hidden when closed; its hidden/open accessibility-tree states were verified in the live mobile preview, and desktop restoration plus the 760/761-pixel boundary were checked in a focused DOM shim. This is targeted prototype verification, not a production integration or full accessibility audit.

[notes]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/lib/theorem/notes.ts
[note-panel]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/components/notes/note-panel.tsx
[saved-artifact]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/components/artifacts/saved-artifact.ts
[apps]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/lib/theorem/apps.ts
[publication]: https://github.com/Theoremrs/Theorem/blob/903bc4deb5e912023e55506b7bd4fb1196468c4d/rustyredcore_THG/crates/rustyred-thg-server/src/theorem_agent_stream/conversation_apps.rs
[record-api]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/components/records/api.ts
[record-contract]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/components/records/contract.ts
[workspace]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/components/notes/notes-workspace.tsx
[artifact-model]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/components/artifacts/artifact-model.ts
[registry]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/components/artifacts/artifact-registry.tsx
[vault-graph]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/lib/vault/graph-model.ts
[folders]: https://github.com/Theoremrs/Theorem-UI/blob/99614b5120de5980bc9b9cccf0c042180324a7ee/src/lib/theorem/note-folders.ts
[documents]: https://github.com/Theoremrs/Theorem/blob/903bc4deb5e912023e55506b7bd4fb1196468c4d/rustyredcore_THG/crates/theorem-surface-contracts/src/document.rs
