// SOURCING: none: a committed fixture, the eight-task plan a real chat drew as a cramped inline graph, in the shapes the draft_plan call and Theorem's /graphql `plan` query carry. It drives the plan card's tests, its stories and its browser check.
import { draftPlanView, parseLivePlan } from '@/lib/theorem/plans'
import type { PlanView } from '@/lib/theorem/plans'

const OBJECTIVE =
  "Reduce the friction an agent faces operating inside Theorem's harness: find where agents lose time, " +
  'guess at tool names, or lose their place between sessions, then fix the discovery path, the refusals ' +
  'and the continuity contract so an agent new to the harness can orient, act and resume without a person ' +
  'stepping in, and keep a check that proves the friction stays fixed.'

/** The tasks as the model wrote them: long titles, as the transcript had them. */
const TASKS = [
  {
    alias: 'audit-agent-friction',
    title:
      'Audit where agents lose time or fail when operating inside the harness today',
    goal: 'A ranked list of the friction agents actually hit, each with a transcript that shows it.',
    acceptanceCriteria: [
      'At least ten real sessions read end to end',
      'Each friction point names the tool call where it happened',
    ],
  },
  {
    alias: 'pin-scope',
    title:
      'Pin the scope of this pass to the tool surface, discovery and session continuity',
    goal: 'An agreed boundary, so the pass does not grow into a harness rewrite.',
    acceptanceCriteria: ['Out-of-scope areas listed with the reason for each'],
  },
  {
    alias: 'tool-surface-map',
    title:
      'Map every native capability an agent reaches and the name it is reached by',
    description:
      'Include the pinned front door, tool_search results and the aliases models guess at.',
    acceptanceCriteria: [
      'Every capability in the registry appears once',
      'Guessed names that miss are recorded',
    ],
    dependencies: ['audit-agent-friction', 'pin-scope'],
  },
  {
    alias: 'error-guidance',
    title:
      'Rewrite refusals and errors so each one names the next action an agent can take',
    acceptanceCriteria: ['No refusal in the audit ends without a next step'],
    dependencies: ['audit-agent-friction'],
  },
  {
    alias: 'continuity-contract',
    title:
      'Write the continuity contract for resuming a session after compaction or a restart',
    goal: 'An agent that lost its window can find its plan, its claims and its last receipt.',
    acceptanceCriteria: [
      'The contract names what survives and where to read it back',
    ],
    dependencies: ['pin-scope'],
  },
  {
    alias: 'front-door-tools',
    title:
      'Consolidate the pinned front door so discovery starts from one obvious tool',
    acceptanceCriteria: [
      'A new agent reaches the right capability in two calls or fewer',
    ],
    dependencies: ['tool-surface-map'],
  },
  {
    alias: 'agent-quickstart',
    title:
      'Publish an agent quickstart that walks through the first five minutes in the harness',
    acceptanceCriteria: [
      'A fresh agent follows it without a person stepping in',
    ],
    dependencies: ['front-door-tools', 'continuity-contract'],
  },
  {
    alias: 'friction-regression-check',
    title:
      'Add a regression check that replays the audited friction cases against the harness',
    acceptanceCriteria: [
      'Every audited case replays',
      'A reintroduced friction fails the check',
    ],
    dependencies: ['error-guidance', 'agent-quickstart'],
  },
] as const

/** The draft_plan call's arguments. */
export const PLAN_ARGS = {
  title: "Make Theorem's harness easier for agents to use",
  objective: OBJECTIVE,
  tasks: TASKS,
}

const taskId = (index: number) =>
  `task:01JH${String(index + 1).padStart(2, '0')}`

/** The draft_plan call's result: the plan id and each alias's task id. */
export const PLAN_RESULT = {
  planId: 'plan:harness-friction',
  title: PLAN_ARGS.title,
  objective: OBJECTIVE,
  tasks: TASKS.map((task, index) => ({
    alias: task.alias,
    taskId: taskId(index),
    title: task.title,
    dependencies: 'dependencies' in task ? task.dependencies : [],
  })),
}

/** The plan as the card draws it once written: 0 of 8 done, the two roots ready. */
export const PLAN_VIEW: PlanView = draftPlanView(PLAN_ARGS, PLAN_RESULT)!

const ID_OF = new Map(
  PLAN_RESULT.tasks.map((task) => [task.alias, task.taskId]),
)

/**
 * Theorem's copy of the plan as /graphql answers it, with each task's plan
 * status by alias (pending when unnamed). `status` is the task protocol's,
 * where every open task is working.
 */
export function livePlanPayload(
  statuses: Readonly<Record<string, string>> = {},
) {
  return {
    planId: PLAN_RESULT.planId,
    reason: null,
    plan: { title: PLAN_ARGS.title, objective: OBJECTIVE, status: 'active' },
    tasks: TASKS.map((task, index) => {
      const planStatus = statuses[task.alias] ?? 'pending'
      return {
        id: taskId(index),
        alias: task.alias,
        title: task.title,
        goal: 'goal' in task ? task.goal : '',
        description: 'description' in task ? task.description : '',
        acceptanceCriteria: task.acceptanceCriteria,
        status: planStatus === 'done' ? 'completed' : 'working',
        planStatus,
        dependencies: ('dependencies' in task ? task.dependencies : []).map(
          (alias) => ID_OF.get(alias)!,
        ),
      }
    }),
  }
}

/** The same plan under way: one root claimed, the other deviating, still 0 of 8 done. */
export const PLAN_UNDER_WAY: PlanView = parseLivePlan(
  livePlanPayload({
    'audit-agent-friction': 'claimed',
    'pin-scope': 'deviating',
  }),
)!
