// SOURCING: @openuidev/react-lang (defineComponent, defineFunction,
// createLibrary, reactive + useStateField) for theorem-artifacts, the artifact
// component library; zod/v4 prop schemas as OpenUI requires. Rendering is
// ./views and ./charts over src/components/ui and coss.
//
// Every prop is semantic: what is compared, values and their units, a
// parameter's range and start, which series is which subject, the current
// step, a warning or an annotation. None sets a color, size, font, spacing or
// class: the implementations own all of it, and the palette follows the theme.
import {
  createLibrary,
  defineComponent,
  defineFunction,
  reactive,
  useStateField,
} from '@openuidev/react-lang'
import { z } from 'zod/v4'
import { PlotView, TimelineView } from './charts'
import { EXAMPLES, GPU_WORKLOAD } from './examples'
import {
  CalloutView,
  ComparisonView,
  ExperimentView,
  LinkedTableView,
  Prose,
  SectionView,
  SequenceView,
  SliderView,
  StackView,
  StatView,
  ToggleView,
} from './views'

export const LIBRARY_ID = 'theorem-artifacts'
export const LIBRARY_VERSION = '1'

const subject = z
  .string()
  .describe(
    'The subject a value belongs to, by name ("CPU", "GPU"). The same name keeps the same color everywhere in the artifact.',
  )
const unit = z
  .string()
  .describe('The unit of the values: "ms", "items", "GB/s", "%", "x".')
const region = z
  .object({ from: z.number(), to: z.number() })
  .describe('A range along an x axis')
const children = z.array(z.any())

/** Sub-components are read by their parents and draw nothing alone. */
const part = () => null

const statementOf = (statementId: string | undefined, name: string) =>
  statementId ?? name.toLowerCase()

const props = <T,>(items: Array<{ props: T } | null | undefined>) =>
  items.flatMap((item) => (item?.props ? [item.props] : []))

// Layout and prose

const Stack = defineComponent({
  name: 'Stack',
  description:
    'The root: blocks top to bottom. Consecutive Stats share a row and consecutive controls share a grid on their own.',
  props: z.object({ children }),
  component: ({ props: p, renderNode }) => (
    <StackView renderNode={renderNode}>{p.children}</StackView>
  ),
})

const Section = defineComponent({
  name: 'Section',
  description: 'A titled group of blocks, with an optional one-line description.',
  props: z.object({
    title: z.string(),
    children,
    description: z.string().optional(),
  }),
  component: ({ props: p, renderNode }) => (
    <SectionView title={p.title} description={p.description} renderNode={renderNode}>
      {p.children}
    </SectionView>
  ),
})

const Text = defineComponent({
  name: 'Text',
  description: 'A paragraph of plain prose.',
  props: z.object({ text: z.string() }),
  component: ({ props: p }) => <Prose text={p.text} />,
})

const Callout = defineComponent({
  name: 'Callout',
  description:
    'A short note set apart: "note" for context, "warning" for a caveat the reader must not miss, "assumption" for a premise the numbers rest on.',
  props: z.object({
    text: z.string(),
    kind: z.enum(['note', 'warning', 'assumption']).optional(),
  }),
  component: ({ props: p }) => <CalloutView text={p.text} kind={p.kind} />,
})

const Stat = defineComponent({
  name: 'Stat',
  description:
    'One headline value with its unit, and the subject it belongs to when there is one. A text value (a verdict, "Never") shows as written.',
  props: z.object({
    label: z.string(),
    value: z.union([z.number(), z.string()]).nullable(),
    unit: unit.nullable().optional(),
    subject: subject.nullable().optional(),
    note: z.string().nullable().optional(),
  }),
  component: ({ props: p }) => (
    <StatView label={p.label} value={p.value} unit={p.unit} subject={p.subject} note={p.note} />
  ),
})

// Controls

const Slider = defineComponent({
  name: 'Slider',
  description:
    'A parameter bound to a $variable, from min to max; its initial value is the variable\'s declared value. "log" moves through orders of magnitude evenly.',
  props: z.object({
    label: z.string(),
    value: reactive(z.number()),
    min: z.number(),
    max: z.number(),
    unit: unit.nullable().optional(),
    scale: z.enum(['linear', 'log']).nullable().optional(),
    step: z.number().nullable().optional(),
  }),
  component: function SliderControl({ props: p }) {
    const field = useStateField('value', p.value)
    return (
      <SliderView
        label={p.label}
        value={typeof field.value === 'number' ? field.value : p.min}
        setValue={field.setValue}
        min={p.min}
        max={p.max}
        unit={p.unit}
        scale={p.scale}
        step={p.step}
      />
    )
  },
})

const Toggle = defineComponent({
  name: 'Toggle',
  description: 'A yes-or-no condition bound to a boolean $variable.',
  props: z.object({
    label: z.string(),
    value: reactive(z.boolean()),
    note: z.string().nullable().optional(),
  }),
  component: function ToggleControl({ props: p }) {
    const field = useStateField('value', p.value)
    return (
      <ToggleView
        label={p.label}
        value={field.value === true}
        setValue={field.setValue}
        note={p.note}
      />
    )
  },
})

// Comparison

const Measure = defineComponent({
  name: 'Measure',
  description:
    'One measure across the Comparison\'s subjects: values in the same order as the subjects, and which direction is better.',
  props: z.object({
    label: z.string(),
    unit,
    values: z.array(z.number()),
    better: z.enum(['lower', 'higher']).nullable().optional(),
  }),
  component: part,
})

const Comparison = defineComponent({
  name: 'Comparison',
  description:
    'Subjects side by side on aligned measures, each measure on its own scale.',
  props: z.object({
    subjects: z.array(subject),
    measures: z.array(Measure.ref),
    note: z.string().nullable().optional(),
  }),
  component: ({ props: p, statementId }) => (
    <ComparisonView
      id={statementOf(statementId, 'Comparison')}
      subjects={p.subjects}
      measures={props(p.measures)}
      note={p.note}
    />
  ),
})

// Timeline

const Stage = defineComponent({
  name: 'Stage',
  description:
    'One stage of a lane, in order, with its duration in the Timeline\'s unit. Mark setup, transfer and other overhead that is not the work itself.',
  props: z.object({
    label: z.string(),
    duration: z.number(),
    overhead: z.boolean().nullable().optional(),
  }),
  component: part,
})

const Lane = defineComponent({
  name: 'Lane',
  description: 'One subject\'s stages, run one after another from zero.',
  props: z.object({ subject, stages: z.array(Stage.ref) }),
  component: part,
})

const Mark = defineComponent({
  name: 'Mark',
  description: 'An annotated point on a scale: a threshold, a crossover, "this workload".',
  props: z.object({ at: z.number(), label: z.string() }),
  component: part,
})

const Timeline = defineComponent({
  name: 'Timeline',
  description:
    'Lanes on one shared time scale, so completion times compare by length.',
  props: z.object({
    lanes: z.array(Lane.ref),
    unit,
    marks: z.array(Mark.ref).nullable().optional(),
  }),
  component: ({ props: p, statementId }) => (
    <TimelineView
      id={statementOf(statementId, 'Timeline')}
      lanes={props(p.lanes).map((lane) => ({ ...lane, stages: props(lane.stages) }))}
      unit={p.unit}
      marks={props(p.marks ?? [])}
    />
  ),
})

// Plot

const Axis = defineComponent({
  name: 'Axis',
  description: 'What an axis measures, in what unit, on a linear or log scale.',
  props: z.object({
    label: z.string(),
    unit: unit.nullable().optional(),
    scale: z.enum(['linear', 'log']).nullable().optional(),
  }),
  component: part,
})

const Series = defineComponent({
  name: 'Series',
  description: 'One subject\'s values: x and y arrays of the same length.',
  props: z.object({ subject, x: z.array(z.number()), y: z.array(z.number()) }),
  component: part,
})

const Plot = defineComponent({
  name: 'Plot',
  description:
    'Series against shared axes, with a legend and values the reader can inspect point by point. Dragging across selects an x range into $region, which a LinkedTable can follow.',
  props: z.object({
    x: Axis.ref,
    y: Axis.ref,
    series: z.array(Series.ref),
    region: reactive(region.nullable().optional()),
    marks: z.array(Mark.ref).nullable().optional(),
  }),
  component: function PlotChart({ props: p, statementId }) {
    const field = useStateField('region', p.region)
    // OpenUI validates literal arguments only: an axis passed by reference to
    // a statement that never resolved arrives as nothing.
    const { x, y } = p as Partial<typeof p>
    if (!x?.props || !y?.props) return null
    return (
      <PlotView
        id={statementOf(statementId, 'Plot')}
        x={x.props}
        y={y.props}
        series={props(p.series)}
        marks={props(p.marks ?? [])}
        region={field.value}
        setRegion={field.setValue}
      />
    )
  },
})

// Table

const Column = defineComponent({
  name: 'Column',
  description:
    'A LinkedTable column: the row key it reads, its heading, its unit, and its subject when the column is one subject\'s values.',
  props: z.object({
    key: z.string(),
    label: z.string(),
    unit: unit.nullable().optional(),
    subject: subject.nullable().optional(),
  }),
  component: part,
})

const LinkedTable = defineComponent({
  name: 'LinkedTable',
  description:
    'Rows of values. Given the same $region as a Plot and the column key the region ranges over, it marks the rows inside the selected range. Selecting a row asks about it.',
  props: z.object({
    columns: z.array(Column.ref),
    rows: z.array(
      z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    ),
    region: reactive(region.nullable().optional()),
    by: z.string().nullable().optional(),
  }),
  component: function LinkedTableBlock({ props: p }) {
    const field = useStateField('region', p.region)
    return (
      <LinkedTableView
        columns={props(p.columns)}
        rows={p.rows}
        region={field.value}
        by={p.by}
      />
    )
  },
})

// Explanations

const Step = defineComponent({
  name: 'Step',
  description: 'One step of a Sequence: its title, its blocks, an optional note.',
  props: z.object({
    title: z.string(),
    children,
    note: z.string().nullable().optional(),
  }),
  component: part,
})

const Sequence = defineComponent({
  name: 'Sequence',
  description:
    'Steps the reader moves through one at a time. Bind the current step (from 0) to a $variable so other blocks can follow it.',
  props: z.object({
    steps: z.array(Step.ref),
    current: reactive(z.number().optional()),
  }),
  component: function SequenceBlock({ props: p, renderNode }) {
    const field = useStateField('current', p.current)
    return (
      <SequenceView
        steps={props(p.steps)}
        current={typeof field.value === 'number' ? field.value : 0}
        setCurrent={field.setValue}
        renderNode={renderNode}
      />
    )
  },
})

const Experiment = defineComponent({
  name: 'Experiment',
  description:
    'A question answered by a model the reader can move: controls bound to $variables, results that are expressions over them (they recompute locally), and the assumptions the model rests on. Illustrative unless its numbers are measured.',
  props: z.object({
    question: z.string(),
    controls: children,
    results: children,
    assumptions: z.array(z.string()),
    illustrative: z.boolean().optional(),
  }),
  component: ({ props: p, renderNode }) => (
    <ExperimentView
      question={p.question}
      controls={p.controls}
      results={p.results}
      assumptions={p.assumptions}
      illustrative={p.illustrative !== false}
      renderNode={renderNode}
    />
  ),
})

/** The most numbers one Range makes; a chart or table never needs more. */
export const RANGE_LIMIT = 1000

const Range = defineFunction({
  name: 'Range',
  description: `count numbers (at most ${RANGE_LIMIT}) from \`from\` to \`to\`, evenly spaced, or evenly spaced in orders of magnitude with "log".`,
  params: z.object({
    from: z.number(),
    to: z.number(),
    count: z.number(),
    scale: z.enum(['linear', 'log']).optional(),
  }),
  returns: z.array(z.number()),
  fn: ({ from, to, count, scale }) => {
    const n = Math.max(2, Math.round(count))
    // OpenUI reports a throw against the statement, so it comes back as a repair hint.
    if (n > RANGE_LIMIT)
      throw new Error(
        `count ${n} is more than Range makes (at most ${RANGE_LIMIT}); a chart or table reads well with far fewer.`,
      )
    const log = scale === 'log' && from > 0 && to > 0
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1)
      return log ? Number((from * (to / from) ** t).toPrecision(6)) : from + (to - from) * t
    })
  },
})

export const artifactLibrary = createLibrary({
  id: LIBRARY_ID,
  root: 'Stack',
  components: [
    Stack,
    Section,
    Text,
    Callout,
    Stat,
    Slider,
    Toggle,
    Comparison,
    Measure,
    Timeline,
    Lane,
    Stage,
    Plot,
    Axis,
    Series,
    Mark,
    LinkedTable,
    Column,
    Sequence,
    Step,
    Experiment,
  ],
  componentGroups: [
    {
      name: 'Layout and prose',
      components: ['Stack', 'Section', 'Text', 'Callout'],
      notes: [
        'The conversation shows the artifact\'s title; start with the content, not a heading.',
      ],
    },
    { name: 'Values', components: ['Stat', 'Comparison', 'Measure'] },
    {
      name: 'Controls',
      components: ['Slider', 'Toggle'],
      notes: [
        'A control binds a $variable; declare it with its initial value, e.g. `$items = 1000000`.',
      ],
    },
    {
      name: 'Charts',
      components: ['Timeline', 'Lane', 'Stage', 'Plot', 'Axis', 'Series', 'Mark'],
    },
    { name: 'Tables', components: ['LinkedTable', 'Column'] },
    { name: 'Explanations', components: ['Experiment', 'Sequence', 'Step'] },
  ],
  functions: [Range],
})

const PREAMBLE = `You are writing a Theorem artifact: an OpenUI Lang program against the ${LIBRARY_ID} library, version ${LIBRARY_VERSION}. It renders inline in the conversation, and its controls work there directly.
Components take meaning only: the subjects compared, values and their units, a parameter's range and initial value, which series is which subject, the current step, a warning or an annotation. Theorem owns every type size, spacing, material, control appearance and color; there is no prop for any of them.`

const RULES = [
  'Name each subject the same way everywhere ("CPU", "GPU"): its color follows the name.',
  'Declare a model as statements: constants as numbers, results as expressions over $variables. Controls change the variables and every result recomputes in the browser.',
  'Give every number its unit.',
  'Put what the numbers rest on in an Experiment\'s assumptions; leave it illustrative unless the numbers were measured.',
  'Use Callout "warning" only for a caveat that changes the answer.',
]

export function libraryPrompt() {
  return artifactLibrary.prompt({
    preamble: PREAMBLE,
    additionalRules: RULES,
    examples: [GPU_WORKLOAD],
    toolCalls: false,
    bindings: true,
    builtinFunctions: true,
  })
}

export const libraryComponents = () => Object.keys(artifactLibrary.components)

export const libraryCallables = () => Object.keys(artifactLibrary.functions)

/** Each component's and function's positional signature, as the prompt states it. */
export function librarySignatures(): Record<string, string> {
  const spec = artifactLibrary.toSpec()
  return Object.fromEntries(
    [...Object.entries(spec.components), ...Object.entries(spec.functions ?? {})].map(
      ([name, { signature }]) => [name, signature],
    ),
  )
}

async function sha256(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * What Theorem keeps about this library: the instructions, names, signatures
 * and version, and a short program known to render, which the host lints and
 * shows the model beside the prompt (the prompt already carries the GPU composite).
 */
export async function libraryRecord() {
  const prompt = libraryPrompt()
  const components = libraryComponents()
  const callables = libraryCallables()
  const signatures = librarySignatures()
  const example = EXAMPLES.Experiment
  return {
    libraryId: LIBRARY_ID,
    version: LIBRARY_VERSION,
    digest: await sha256(
      JSON.stringify({ prompt, components, callables, signatures, example }),
    ),
    prompt,
    components,
    callables,
    signatures,
    example,
  }
}

export type LibraryRecord = Awaited<ReturnType<typeof libraryRecord>>
