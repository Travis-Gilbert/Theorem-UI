// SOURCING: zod (parses the notebook forms off the artifact wire). The shapes
// project theorem-surface-contracts' generated bindings (ObservablePublication,
// MarimoPublication, RetainedOutputs), which live in the Theorem repository
// and are not published to this one; no library models them.
import { z } from 'zod'

/**
 * The notebook form version this build reads. A part names the version it
 * was written in, and a newer one may change the shape, so it is not read.
 */
export const NOTEBOOK_FORM_VERSION = 1

const formVersion = z.number().int().positive().optional()

const ObservableCell = z.object({
  id: z.string().min(1),
  kind: z.enum(['js', 'md']),
  source: z.string(),
})

/** An Observable notebook: reactive JavaScript and Markdown cells, and optional data. */
export const ObservableForm = z.object({
  form: z.literal('observable'),
  title: z.string(),
  cells: z.array(ObservableCell),
  data: z.record(z.string(), z.unknown()).optional(),
  formVersion,
})

const RetainedOutput = z.object({ mime: z.string(), data: z.unknown() })

/**
 * Outputs a run of the notebook produced, kept with the host that ran it. A
 * renderer shows them as recorded; they are never a claim of a live run.
 */
export const RetainedOutputs = z.object({
  /** `sha256:` and the hex SHA-256 of the notebook source the run executed. */
  revision: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  cells: z.array(
    z.object({ id: z.string(), outputs: z.array(RetainedOutput) }),
  ),
  execution: z.object({
    /** `browser`, or the id of the registered host that ran it. */
    host: z.string(),
    device: z.string().optional(),
    startedAtMs: z.number(),
    finishedAtMs: z.number(),
  }),
})

/**
 * A marimo notebook: its `.py` source, where it may run, and where its
 * recorded outputs are. A stored part names them by `retainedOutputs.href`;
 * `outputs` inline is what a publication may carry before it is stored.
 */
export const MarimoForm = z.object({
  form: z.literal('marimo'),
  title: z.string(),
  source: z.string(),
  runtime: z.enum(['pyodide', 'native']),
  needs: z
    .object({
      gpu: z.boolean().optional(),
      packages: z.array(z.string()).optional(),
    })
    .optional(),
  outputs: RetainedOutputs.optional(),
  retainedOutputs: z
    .object({ sourceRevision: z.string(), href: z.string() })
    .optional(),
  formVersion,
})

export const NotebookForm = z.discriminatedUnion('form', [
  ObservableForm,
  MarimoForm,
])

export type ObservableNotebook = z.infer<typeof ObservableForm>
export type ObservableCell = z.infer<typeof ObservableCell>
export type MarimoNotebook = z.infer<typeof MarimoForm>
export type RetainedOutputs = z.infer<typeof RetainedOutputs>
export type RetainedOutput = z.infer<typeof RetainedOutput>
export type NotebookForm = z.infer<typeof NotebookForm>

/**
 * The notebook form a value carries, or undefined when it carries none or
 * names a form version newer than this build reads.
 */
export function parseNotebookForm(value: unknown): NotebookForm | undefined {
  const parsed = NotebookForm.safeParse(value)
  return parsed.success &&
    (parsed.data.formVersion ?? 1) <= NOTEBOOK_FORM_VERSION
    ? parsed.data
    : undefined
}

/**
 * Whether the notebook can only run on a native host: it says so, or it
 * needs a GPU, which a browser's Pyodide never has.
 */
export const needsNativeHost = (notebook: MarimoNotebook) =>
  notebook.runtime === 'native' || notebook.needs?.gpu === true
