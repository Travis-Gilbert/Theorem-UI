// SOURCING: none — the effective class registry Notes reads, as pure lookups over the schema register's declared types (components/records/contract `ObjectType`). Presentation lives in the type's own `extensions`, the slot the register keeps for it, so nothing here is a second store of class definitions.
import type {
  DataModel,
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
} from '@/components/records/contract'

/**
 * The extension key Notes keeps on a declared type: how it looks and, for
 * the standard library's document classes, which native owner holds its
 * instances. It travels with the declaration, so export, import and every
 * other reader of the register see the same presentation.
 */
import type { Presentation } from '@/components/records/model'

export const NOTES_EXTENSION = 'theorem.notes'

/** The document owners a standard-library class can name. */
export type NativeOwner = 'page' | 'app' | 'notebook'

/** A class with a special job in Notes, rather than an ordinary type. */
export type ClassRole = 'collection'

export const CLASS_TONES = [
  'teal',
  'ochre',
  'redwood',
  'action',
  'insight',
  'neutral',
] as const
export type ClassTone = (typeof CLASS_TONES)[number]

export type NotesExtension = {
  icon?: string
  tone?: ClassTone
  native?: NativeOwner
  role?: ClassRole
  /** `prose` keeps a reading column; `wide` gives the body the pane. */
  layout?: 'prose' | 'wide'
  /** Field keys a card or table row shows, in order. */
  cardFields?: string[]
  /** Which fields hold the title, summary and body (records/model.ts). */
  presentation?: Presentation
}

export function notesExtension(
  type: Pick<ObjectType, 'extensions'>,
): NotesExtension {
  const value = type.extensions?.[NOTES_EXTENSION]
  return value && typeof value === 'object' ? value : {}
}

export function withNotesExtension(
  type: Pick<ObjectType, 'extensions'>,
  patch: Partial<NotesExtension>,
): Record<string, unknown> {
  const next = { ...notesExtension(type), ...patch }
  for (const key of Object.keys(next) as (keyof NotesExtension)[])
    if (next[key] === undefined) delete next[key]
  return { ...type.extensions, [NOTES_EXTENSION]: next }
}

/** A declared type as Notes shows it. */
export type ObjectClass = {
  id: string
  type: ObjectType
  label: string
  plural: string
  icon: string
  tone: ClassTone
  native?: NativeOwner
  role?: ClassRole
  /** Shipped with Theorem's distribution (the standard library). */
  standard: boolean
  retired: boolean
}

const DEFAULT_ICON: Record<NativeOwner, string> = {
  page: 'file-text',
  app: 'code',
  notebook: 'notebook',
}

const toneOf = (id: string): ClassTone => {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return CLASS_TONES[hash % (CLASS_TONES.length - 1)] ?? 'teal'
}

export function objectClass(type: ObjectType): ObjectClass {
  const ext = notesExtension(type)
  return {
    id: type.object_type_id,
    type,
    label: type.label_singular,
    plural: type.label_plural,
    icon:
      ext.icon ??
      (ext.native ? DEFAULT_ICON[ext.native] : undefined) ??
      (ext.role === 'collection' ? 'library' : 'box'),
    tone: ext.tone ?? toneOf(type.object_type_id),
    native: ext.native,
    role: ext.role,
    standard: Boolean(ext.native || ext.role),
    retired: Boolean(type.retired),
  }
}

export type ClassRegistry = {
  /** Every declared class, retired ones included for reading history. */
  all: ObjectClass[]
  byId: ReadonlyMap<string, ObjectClass>
  /** Classes with instances to browse: not retired, not a role. */
  browsable: ObjectClass[]
  native: Partial<Record<NativeOwner, ObjectClass>>
  collection?: ObjectClass
}

export function classRegistry(model: DataModel | undefined): ClassRegistry {
  const all = (model?.objectTypes ?? []).map(objectClass)
  const native: ClassRegistry['native'] = {}
  let collection: ObjectClass | undefined
  for (const cls of all) {
    if (cls.retired) continue
    if (cls.native) native[cls.native] ??= cls
    if (cls.role === 'collection') collection ??= cls
  }
  return {
    all,
    byId: new Map(all.map((cls) => [cls.id, cls])),
    browsable: all
      .filter((cls) => !cls.retired && !cls.role)
      .sort((a, b) => a.plural.localeCompare(b.plural)),
    native,
    collection,
  }
}

/** Resolve a relation target (a type id, node label or name) to its class. */
export const classOfRef = (registry: ClassRegistry, ref: string) =>
  registry.all.find(
    (cls) =>
      cls.id === ref ||
      cls.type.node_label === ref ||
      cls.type.name_singular === ref,
  )

// The standard library

const nameField: FieldSpec = {
  key: 'name',
  label: 'Name',
  field_type: { kind: 'text' },
  required: true,
  system: false,
}

/**
 * The classes Theorem's distribution ships: the document kinds Notes already
 * holds, and Collection for curated membership. They are declared through the
 * same `declareSchema` a person's own class goes through; only the extension
 * says a Documents owner holds the instances of the first three.
 */
export const STANDARD_LIBRARY: {
  key: NativeOwner | ClassRole
  input: ObjectTypeInput
}[] = [
  {
    key: 'page',
    input: {
      name_singular: 'page',
      name_plural: 'pages',
      label_singular: 'Page',
      label_plural: 'Pages',
      description: 'A written note, held by Theorem Documents.',
      node_label: 'TheoremPage',
      label_identifier_field: 'name',
      fields: [nameField],
      enforcement: 'observe',
      system: false,
      provider: { kind: 'connector', connector_id: 'theorem.documents' },
      extensions: {
        [NOTES_EXTENSION]: {
          native: 'page',
          icon: 'file-text',
          tone: 'neutral',
          layout: 'prose',
        },
      },
    },
  },
  {
    key: 'app',
    input: {
      name_singular: 'app',
      name_plural: 'apps',
      label_singular: 'App',
      label_plural: 'Apps',
      description: 'A saved working artifact, held by Theorem Documents.',
      node_label: 'TheoremApp',
      label_identifier_field: 'name',
      fields: [nameField],
      enforcement: 'observe',
      system: false,
      provider: { kind: 'connector', connector_id: 'theorem.documents' },
      extensions: {
        [NOTES_EXTENSION]: {
          native: 'app',
          icon: 'code',
          tone: 'action',
          layout: 'wide',
        },
      },
    },
  },
  {
    key: 'notebook',
    input: {
      name_singular: 'notebook',
      name_plural: 'notebooks',
      label_singular: 'Notebook',
      label_plural: 'Notebooks',
      description:
        'A saved Observable or marimo notebook, held by Theorem Documents.',
      node_label: 'TheoremNotebook',
      label_identifier_field: 'name',
      fields: [nameField],
      enforcement: 'observe',
      system: false,
      provider: { kind: 'connector', connector_id: 'theorem.documents' },
      extensions: {
        [NOTES_EXTENSION]: {
          native: 'notebook',
          icon: 'notebook',
          tone: 'teal',
          layout: 'wide',
        },
      },
    },
  },
  {
    key: 'collection',
    input: {
      name_singular: 'collection',
      name_plural: 'collections',
      label_singular: 'Collection',
      label_plural: 'Collections',
      description:
        'A named, curated set of objects of any class. Membership references each object; it never moves or copies it.',
      node_label: 'TheoremCollection',
      label_identifier_field: 'name',
      fields: [
        nameField,
        {
          key: 'description',
          label: 'Description',
          field_type: { kind: 'long_text' },
          required: false,
          system: false,
        },
        {
          key: 'members',
          label: 'Members',
          description:
            'Object references: a document id, or record:<class>/<id>.',
          field_type: { kind: 'json' },
          required: false,
          system: false,
        },
        {
          key: 'purpose',
          label: 'Purpose',
          description:
            'favorites marks the collection the sidebar shows as Favorites.',
          field_type: { kind: 'enum', variants: ['favorites'] },
          required: false,
          system: false,
        },
      ],
      enforcement: 'warn',
      system: false,
      extensions: {
        [NOTES_EXTENSION]: {
          role: 'collection',
          icon: 'library',
          tone: 'ochre',
        },
      },
    },
  },
]

/**
 * The standard-library declarations this register still lacks. A class is
 * recognised by its extension, not its name, so a person's own `page` type
 * is never mistaken for it; a taken name gets a prefixed one instead.
 */
export function missingStandardClasses(model: DataModel): ObjectTypeInput[] {
  const registry = classRegistry(model)
  const names = new Set(model.objectTypes.map((type) => type.name_singular))
  const labels = new Set(model.objectTypes.map((type) => type.node_label))
  return STANDARD_LIBRARY.filter(({ key }) =>
    key === 'collection' ? !registry.collection : !registry.native[key],
  ).map(({ input }) => {
    if (!names.has(input.name_singular) && !labels.has(input.node_label))
      return input
    const prefixed = `theorem${input.name_singular.charAt(0).toUpperCase()}${input.name_singular.slice(1)}`
    return {
      ...input,
      name_singular: prefixed,
      name_plural: `${prefixed}s`,
      node_label: labels.has(input.node_label)
        ? `${input.node_label}Class`
        : input.node_label,
    }
  })
}
