// Every public word on the site lives here. The primary copy across the three
// panels is held near 180 to 250 words by hand; there is no counter in the
// build. The two reading pages sit outside that budget. Their words are the
// Marketing Brief's own, sections 4 to 7. Rights and provenance for what the
// film shows are in film/manifest.json.

export const nav = {
  wordmark: 'Theorem',
  home: 'Theorem, the user agent',
  label: 'Destinations',
  links: [
    { id: 'experience', label: 'Experience', href: '#experience' },
    { id: 'possibilities', label: 'Possibilities', href: '#possibilities' },
    { id: 'join', label: 'Join', href: '#join' },
  ],
  docs: {
    label: 'Docs',
    href: 'https://github.com/Travis-Gilbert/Theorem-UI#readme',
  },
  back: 'Back to scene',
  turn: 'Your turn',
  motionOff: 'Pause motion',
  motionOn: 'Play motion',
} as const

export const experience = {
  signature: 'The User Agent',
  heading: 'Intelligence that complements yours.',
  line: 'For the things you want to understand, try, and bring into the world.',
  watch: 'Watch & explore · 20 sec',
  watchLabel: 'Watch and explore: a 20 second film that plays with sound',
  try: 'Try Theorem',
  transcript: 'Transcript and credits',
  frameTitle: 'Theorem, the user agent',
  status: {
    preparing: 'Getting Theorem ready',
    slow: 'This is taking longer than it should.',
    retry: 'Try again',
    open: 'Open Theorem on its own',
    failed: 'Theorem could not open here.',
    failedDetail: 'The rest of this page still works.',
    absent: 'Theorem is not open to try here yet.',
    absentAction: 'Get updates',
    filmFailed: 'The film could not play.',
    filmFailedDetail: 'You can read it instead, or go straight to Theorem.',
  },
  film: {
    skip: 'Skip to Theorem',
    title: 'A twenty second introduction to Theorem',
  },
} as const

export const transcript = {
  title: 'Transcript and credits',
  description: 'What the film says and what it shows.',
  lines: [
    'Licklider imagined thinking with computers.',
    'Engelbart showed what people could do together through them.',
    'That idea still matters to me: technology that expands what we can understand, try, and create.',
    "I'm building Theorem to bring that partnership into everyday life.",
  ],
  credits: [
    'References: J. C. R. Licklider, "Man-Computer Symbiosis" (1960). Douglas Engelbart and Bill Paxton, the NLS demonstration of December 9, 1968.',
    'They are the founder\'s own inspiration. Neither they nor their institutions have any connection to Theorem.',
    'The product footage is Theorem itself, recorded for this film.',
  ],
  more: { label: 'Our thinking', href: '/our-thinking' },
  close: 'Close',
} as const

/**
 * The room. The book notes are a draft in the founder's voice, waiting on the
 * founder's own words (evidence/LEDGER.md, "study: selection and the book notes").
 */
export const study = {
  label: 'The study',
  select: {
    experience: experience.watch,
    possibilities: 'Possibilities',
    join: 'Join',
  },
  noteLabel: 'A note on',
  books: [
    {
      id: 'dream',
      title: 'The Dream Machine',
      author: 'M. Mitchell Waldrop',
      note: "Licklider's story, and the reason computers became personal. He pictured a partner you think alongside, then spent his career finding the people who could build one.",
    },
    {
      id: 'hamming',
      title: 'The Art of Doing Science and Engineering',
      author: 'Richard W. Hamming',
      note: 'Hamming asks what it takes to do work that matters, and expects you to answer for yourself. I go back to it whenever the easy problem starts to look attractive.',
    },
    {
      id: 'everyone',
      title: 'This Is for Everyone',
      author: 'Tim Berners-Lee',
      note: 'Berners-Lee on giving the web away so anyone could build on it. Theorem keeps its interface public for the same reason.',
    },
  ],
  expand: 'Expand',
  collapse: 'Back to the monitor',
} as const

export const possibilities = {
  heading: 'More of life within reach.',
  note: 'Illustrative examples',
  stepsLabel: 'How it could go',
  outcomeLabel: 'Where you end up',
  tryThis: 'Try this in Theorem',
  draftKept: 'You already have a draft in Theorem, so it was left as it is.',
  draftSet: 'It is in the message box. Change it however you like.',
  examples: [
    {
      id: 'curiosity',
      label: 'Follow a curiosity',
      intention: 'I keep coming back to this subject.',
      context:
        'A building on your street looks like it once had another life.',
      steps: [
        'See what the sources say, and where they run out.',
        'Choose the thread worth following.',
      ],
      outcome: 'An explanation you can check, and a walk you now want to take.',
      draft:
        'There is an old building on my street that looks like it once had another life. Help me find out what it was.',
    },
    {
      id: 'make',
      label: 'Make something',
      intention: 'I want to turn this idea into something real.',
      context:
        'You have always wanted to record the stories in your neighborhood.',
      steps: [
        'Narrow it to one first conversation.',
        'Draft a short interview outline.',
      ],
      outcome: 'A first interview you could hold this weekend.',
      draft:
        "I've always wanted to start a small oral-history project in my neighborhood. Help me work out a first step.",
    },
    {
      id: 'forward',
      label: 'Find a way forward',
      intention: "I'm interested, but I don't know where to begin.",
      context: 'You want to play music again, with twenty minutes a day.',
      steps: [
        'Lay out the realistic options.',
        'Pick one to try this week.',
      ],
      outcome: 'One next step that fits the life you have.',
      draft:
        'I want to start playing music again, but I only have about twenty minutes a day. Help me work out where to begin.',
    },
  ],
} as const

export const join = {
  heading: 'What would you like to explore?',
  invitation:
    'A question you keep coming back to. Something you have wanted to learn. An idea you would enjoy making real. Start there.',
  body: 'Get updates as Theorem takes shape.',
  form: {
    cta: 'Join',
    finePrint: 'Email, as the project develops.',
    emailLabel: 'Your email',
    emailPlaceholder: 'you@example.com',
    sending: 'Sending',
    joined: 'You are on the list.',
    alreadyJoined: 'You are already on the list.',
    invalid: 'That email does not look right.',
    failed: 'That did not go through. Try again.',
  },
  technical: {
    heading: 'See what it is doing. Shape what happens next.',
    body: 'How the agent works and how you stay in control are written down, and the interface is public.',
    links: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Our thinking', href: '/our-thinking' },
      {
        label: 'Documentation',
        href: 'https://github.com/Travis-Gilbert/Theorem-UI#readme',
      },
      {
        label: 'Source',
        href: 'https://github.com/Travis-Gilbert/Theorem-UI',
      },
    ],
  },
} as const

export const howItWorks = {
  title: 'How it works',
  heading: 'A personal agent for the things you want to understand, try, and bring to life.',
  sections: [
    {
      heading: 'Your interests set the direction.',
      body: 'Bring your questions, experience, and sense of what matters. Theorem can contribute another perspective, a way to investigate, or help with the practical steps. Explore together, change direction, or give it something to carry forward.',
    },
    {
      heading: 'See what it is doing. Shape what happens next.',
      body: 'The sources it used and the steps it took stay in the conversation. What it makes opens beside the conversation, where you can read it and ask for changes. Where an action needs your approval, it stops and asks.',
    },
    {
      heading: 'More ways to pursue what interests you.',
      body: 'A question can become a collection of useful knowledge. A project can become a tool you use again. As your interests develop, the aim is for your agent and workspace to become more useful to you.',
    },
  ],
} as const

export const ourThinking = {
  title: 'Our thinking',
  heading: 'Computing built around people.',
  paragraphs: [
    'Theorem begins with a person and something they want to understand, experience, or make.',
    "Its inspiration comes from a tradition of computing built around complementary abilities. J. C. R. Licklider described a computer partnership that could help while a question was still taking shape. Douglas Engelbart explored how people, tools, and ways of working could develop together, including how to improve the process of improvement.",
    'Theorem carries that ambition into a personal agent and a shared environment. The goal is to make more of life approachable, interesting, and possible.',
  ],
  quotation: {
    text: 'a colleague whose competence supplements your own',
    source: 'J. C. R. Licklider, "Man-Computer Symbiosis", 1960',
  },
  sourcesLabel: 'Sources',
  sources: [
    {
      label: 'J. C. R. Licklider, "Man-Computer Symbiosis" (1960)',
      href: 'https://groups.csail.mit.edu/medg/people/psz/Licklider.html',
    },
    {
      label: 'Doug Engelbart Institute, "A Call to Action"',
      href: 'https://www.dougengelbart.org/Call-to-Action',
    },
    {
      label: 'Douglas C. Engelbart and Christina Engelbart, "Bootstrapping Organizations Into the 21st Century" (1991)',
      href: 'https://dougengelbart.org/pubs/augment-132803-Bootstrapping.html',
    },
  ],
  note: "They are the founder's own inspiration. Neither they nor their institutions have any connection to Theorem.",
} as const
