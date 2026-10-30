// Every word on the page lives here so the copy can be rewritten without
// touching layout. Draft language, adapted from the Theorem README.

export const nav = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'FAQ', href: '#faq' },
]

export const hero = {
  badge: 'Early access · invites go out in waves',
  title: ['Many models,', 'one agent.'],
  body: 'Theorem is a programmable harness that keeps your context, tools and history in one persistent graph, so the work carries on when a session ends or a model changes.',
}

// The animated graph in the hero window: models on the left feed the harness,
// which writes to the graph and its capabilities on the right.
export const graphWindow = {
  title: 'theorem · run 2193',
  models: ['Claude Code', 'Codex', 'ACP agent', 'Local model'],
  hub: 'harness',
  stores: ['graph', 'skills', 'capabilities'],
  log: [
    { mark: '→', text: 'claude-code: plan the migration' },
    { mark: '⊢', text: 'run 2193 opened in the harness' },
    { mark: '∴', text: '14 objects linked in the graph' },
    { mark: '↳', text: 'fork b/plan-2 from run 2191' },
    { mark: '→', text: 'codex: continue on b/plan-2' },
    { mark: '⊢', text: 'context carried across models' },
    { mark: '✓', text: 'capability verified against schema' },
    { mark: '∎', text: 'run 2193 recorded' },
  ],
}

export const marquee = [
  'Persistent graph',
  'Durable runs',
  'Replay and fork',
  'Composable capabilities',
  'Skills with a lifecycle',
  'A shared workspace',
  'Many model heads',
  'Built in Rust',
]

// Words wrapped in *asterisks* light up in the accent colour as they fill in.
export const statement =
  'Models come and go. Sessions end. Theorem keeps the *context*, the *capabilities* and the *history* in one graph, so every model that picks up the work starts where the last one stopped.'

export type FigureName = 'konigsberg' | 'petersen' | 'commutes' | 'fixed-point'

export const how = {
  label: 'How it works',
  title: 'Four results the harness is built on.',
  steps: [
    {
      figure: 'konigsberg' as FigureName,
      label: 'The graph',
      title: 'Everything the work touches, connected.',
      body: 'RustyRed holds documents, runs and decisions as one graph with content-addressed storage and versioned snapshots. Every object keeps its provenance.',
      caption: 'Euler, 1736: four land masses, seven bridges.',
    },
    {
      figure: 'petersen' as FigureName,
      label: 'The harness',
      title: 'One agent, many model heads.',
      body: 'Claude Code, Codex, ACP agents and API models enter through adapters around the same contracts. Swap the model; the graph that holds the work stays.',
      caption: 'The Petersen graph, properly 3-coloured.',
    },
    {
      figure: 'commutes' as FigureName,
      label: 'Capabilities',
      title: 'Methods that compose and keep receipts.',
      body: 'Operations carry schemas, scopes and evidence. Native providers, WASM plugins and connectors combine into programs that record their lineage.',
      caption: 'A commutative square: either path, same result.',
    },
    {
      figure: 'fixed-point' as FigureName,
      label: 'Skills',
      title: 'Experience that converges.',
      body: 'Skills are packs with an explicit directive. Their parts collect observations, get challenged and get replaced, so each pass lands closer to what works.',
      caption: 'Iterating cos x toward its fixed point.',
    },
  ],
}

export const features = {
  title: 'Built to keep the work.',
  body: 'The parts of Theorem that make a session worth more than the chat it happened in.',
  cards: {
    models: {
      title: 'Bring any model',
      body: 'Adapters for coding agents, ACP and hosted APIs, all writing to one graph.',
      chips: ['Claude Code', 'Codex', 'ACP', 'MCP', 'Local', 'API'],
    },
    fork: {
      title: 'Replay and fork',
      body: 'Persisted event logs let you replay a run or branch it to try another path.',
    },
    durable: {
      title: 'Durable by default',
      body: 'Each write is journaled and synced before it is acknowledged.',
    },
    compose: {
      title: 'Composable capabilities',
      body: 'Small, typed methods fit together into tools built around your own data.',
    },
  },
}

export const faq = {
  title: 'Questions, briefly.',
  items: [
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
  ],
}

export const closing = {
  title: 'Q.E.D.',
  body: 'Be among the first to work in Theorem.',
  note: 'Invites go out in waves',
}

export const footer = {
  tagline:
    'Many models, one agent. A persistent graph for the work you and your agent do together.',
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
