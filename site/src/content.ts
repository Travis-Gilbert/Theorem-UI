// Every word on the page lives here so the copy can be rewritten without
// touching layout. Draft language, adapted from the Theorem README.

export const nav = [
  { label: 'Thesis', href: '#thesis' },
  { label: 'Propositions', href: '#propositions' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'FAQ', href: '#faq' },
]

export const hero = {
  eyebrow: 'Theorem: the user agent',
  title: ['Many models,', 'one agent.'],
  body: 'Theorem is a programmable harness that brings models, memory, tools and a shared workspace together around a persistent graph, so the work continues when a session ends or a model changes.',
  cta: 'Join the waitlist',
}

export const ticker = [
  'Persistent graph',
  'Durable runs',
  'Replay and fork',
  'Composable capabilities',
  'Skills with a lifecycle',
  'Shared workspace',
  'Many model heads',
  'Built in Rust',
]

export const thesis = {
  given: {
    label: 'Given',
    text: 'Models change. Sessions end. Context evaporates between tools.',
  },
  prove: {
    label: 'Prove',
    text: 'The work continues anyway.',
  },
  title:
    'Work becomes context. Methods become capabilities. Experience compounds.',
  body: 'Models contribute reasoning and execution. The harness carries the context, coordination, capabilities and history, so a research project, a development workspace and a tool you build for yourself all draw on the same accumulated knowledge.',
}

export type FigureName =
  | 'petersen'
  | 'konigsberg'
  | 'commutes'
  | 'fixed-point'
  | 'squared'

export const propositions: Array<{
  figure: FigureName
  title: string
  body: string
  proof: string[]
}> = [
  {
    figure: 'petersen',
    title: 'One agent across models and sessions.',
    body: 'Claude Code, Codex, ACP agents and API-backed providers enter through adapters around the same harness contracts. Changing models does not mean replacing the graph that holds the work.',
    proof: [
      'Runs, tool calls, decisions and outcomes are recorded',
      'Coordination rooms and shared plans for many model heads',
      'Persisted event logs support replay and forks',
    ],
  },
  {
    figure: 'konigsberg',
    title: 'A graph that holds the work and its evidence.',
    body: 'RustyRed is Theorem’s shared state: graph relationships, content-addressed storage and versioned snapshots, with documents kept connected to their provenance.',
    proof: [
      'Exact, lexical, semantic and structural retrieval',
      'Graph versions can be compared, branched and merged',
      'Every commit is journaled before it is acknowledged',
    ],
  },
  {
    figure: 'commutes',
    title: 'Capabilities that compose.',
    body: 'Operations carry schemas, scopes, provenance and evidence. Native providers, WASM plugins, sandboxed code and connectors contribute methods the harness can discover and combine.',
    proof: [
      'Programs connect typed inputs and outputs',
      'Lineage and execution receipts are retained',
      'Verify, activate, promote, roll back, retire',
    ],
  },
  {
    figure: 'fixed-point',
    title: 'Skills that improve with use.',
    body: 'The skill encoder turns source material into packs with an explicit directive. Components accumulate observations, can be challenged, and can be replaced while their anchors hold.',
    proof: [
      'Canonical SkillPack store with lifecycle metadata',
      'Generated Rust checkers for each pack',
      'Published states: active and retired',
    ],
  },
  {
    figure: 'squared',
    title: 'A workspace people and agents both operate.',
    body: 'TheoremWeb gives the person and the agent one place to work. Spaces arrange the same canonical objects, so a document, program or simulation appears without becoming a copy.',
    proof: [
      'A semantic contract for interface state and actions',
      'Native and browser apps on one GPU host',
      'Research and browsing flow into the same graph',
    ],
  },
]

export const architecture = {
  label: 'Architecture',
  title: 'From the graph up.',
  body: 'Five layers, each with a single owner. Product surfaces sit on the same objects the engine stores, so what you see is what the agent works with.',
  layers: [
    {
      name: 'RustyRed',
      role: 'Durable graph state, content storage, queries, versions and provenance',
    },
    {
      name: 'Harness',
      role: 'Runs, context, coordination, policy decisions, execution and replay',
    },
    {
      name: 'Capabilities',
      role: 'Typed operations, packages, scopes, connectors, skills and programs',
    },
    {
      name: 'Model heads',
      role: 'Reasoning and execution through local, hosted and external agents',
    },
    {
      name: 'Surfaces',
      role: 'TheoremWeb, the CLI and APIs over the same underlying objects',
    },
  ],
}

export const cli = {
  label: 'Corollary',
  title: 'Already in a terminal?',
  body: 'The CLI is the entry point for existing coding agents. It serves the harness over MCP and ACP, so the tools you use today can work against the same graph.',
  lines: [
    { prompt: true, text: 'theorem models' },
    {
      prompt: true,
      text: 'theorem exec --model rule --dry-run "Hello from Theorem"',
    },
    {
      prompt: false,
      text: '# MCP clients: command `theorem`, args `harness mcp`',
    },
    { prompt: true, text: 'theorem acp' },
  ],
}

export const faq = [
  {
    q: 'What is Theorem?',
    a: 'A persistent working environment for a person and their agent. Models do the reasoning; the harness keeps the context, capabilities and history in a graph that outlives any one session.',
  },
  {
    q: 'Which models does it work with?',
    a: 'Local, hosted and external agents through adapters, including Claude Code, Codex and ACP agents. Supported operations depend on the adapter and its configuration.',
  },
  {
    q: 'Is it available today?',
    a: 'Theorem is under active development. The waitlist is how we will invite people as surfaces become ready.',
  },
  {
    q: 'Where does my data live?',
    a: 'In RustyRed, Theorem’s graph store. Durable records keep the agent’s work inspectable, with provenance attached to what it produced.',
  },
]

export const closing = {
  title: 'Q.E.D.',
  body: 'Be among the first to work in Theorem.',
  note: 'One email when your invite is ready. Nothing else.',
}

export const footer = {
  tagline: 'Many models, one agent.',
  columns: [
    { title: 'Site', links: nav },
    {
      title: 'Theorem',
      links: [
        { label: 'Open the app', href: 'https://theorem.rs' },
        { label: 'Install the CLI', href: 'https://theorem.rs/install' },
      ],
    },
  ],
}
