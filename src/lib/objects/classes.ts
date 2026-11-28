// SOURCING: none — the effective class registry Notes reads, as pure lookups over the schema register's declared types (components/records/contract `ObjectType`). Presentation lives in the type's own `extensions`, the slot the register keeps for it, so nothing here is a second store of class definitions.
import type { DataModel, ObjectType } from '@/components/records/contract'

/**
 * The extension key Notes keeps on a declared type: how it looks and, for
 * the standard library's document classes, which native owner holds its
 * instances. It travels with the declaration, so export, import and every
 * other reader of the register see the same presentation.
 */
import type { Presentation } from '@/components/records/model'

export const NOTES_EXTENSION = 'theorem.notes'

/**
 * The document kind a native class holds. Open: Page, App and Notebook ship
 * with Theorem, and any class may name its own kind with the artifact forms
 * whose saved documents it holds (`NotesExtension.forms`).
 */
export type NativeOwner = string

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
  /** For a native class over saved artifacts: the forms whose documents it holds. */
  forms?: string[]
  /** Installed by Theorem's distribution (notes_classes.rs). */
  standard?: boolean
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
  /** The register's own type (Claim, MemoryDocument, ...): read-only here. */
  system: boolean
  retired: boolean
}

const DEFAULT_ICON: Record<string, string | undefined> = {
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
    standard: Boolean(ext.standard || ext.native || ext.role),
    system: type.system,
    retired: Boolean(type.retired),
  }
}

export type ClassRegistry = {
  /** Every declared class, retired ones included for reading history. */
  all: ObjectClass[]
  byId: ReadonlyMap<string, ObjectClass>
  /**
   * The workspace's classes, the ones Notes navigates: declared by a person
   * or installed for Notes, not retired, not a role.
   */
  workspace: ObjectClass[]
  /** The register's system types, kept out of everyday navigation. */
  substrate: ObjectClass[]
  native: Readonly<Record<NativeOwner, ObjectClass | undefined>>
  /** The native class holding a saved artifact of `form`, by declared forms. */
  formClass: (form: string) => ObjectClass | undefined
  collection?: ObjectClass
}

/** Forms a shipped class holds when its declaration names none. */
const SHIPPED_FORMS: Record<string, readonly string[] | undefined> = {
  notebook: ['observable', 'marimo'],
}

export function classRegistry(model: DataModel | undefined): ClassRegistry {
  const all = (model?.objectTypes ?? []).map(objectClass)
  const native: Record<NativeOwner, ObjectClass | undefined> = {}
  const byForm = new Map<string, ObjectClass>()
  let collection: ObjectClass | undefined
  for (const cls of all) {
    if (cls.retired) continue
    if (cls.native) {
      native[cls.native] ??= cls
      const forms = notesExtension(cls.type).forms ?? SHIPPED_FORMS[cls.native]
      for (const form of forms ?? [])
        if (!byForm.has(form)) byForm.set(form, cls)
    }
    if (cls.role === 'collection') collection ??= cls
  }
  const live = all
    .filter((cls) => !cls.retired && !cls.role)
    .sort((a, b) => a.plural.localeCompare(b.plural))
  return {
    all,
    byId: new Map(all.map((cls) => [cls.id, cls])),
    workspace: live.filter((cls) => !cls.system),
    substrate: live.filter((cls) => cls.system),
    native,
    formClass: (form) => byForm.get(form) ?? native.app,
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
