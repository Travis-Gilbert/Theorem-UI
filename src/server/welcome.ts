// SOURCING: openai (OpenAI-compatible client, pointed at OpenRouter as its docs describe), zod via the SDK's zodResponseFormat for structured output
//
// The new-chat view's headline and two suggestions, written by a small fast
// model from what the person has been doing. The front model is too slow and
// costly to run before every new chat, so this goes straight to OpenRouter.
// The route answers only a signed-in person (the proxy's own gate), and the
// key stays on the server.
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { Welcome, WelcomeContext } from '@/lib/theorem/welcome-schema'
import { bearer, problem } from './theorem-proxy'

const MODEL = 'qwen/qwen3.8-omni-flash'

const INSTRUCTIONS = `You write the opening of a new chat in Theorem, a workspace where a person talks with an AI assistant that drafts documents, writes code, makes diagrams and remembers past conversations.

You get what the person has been doing: their recent conversations (titles, when they were last active, and the last thing they asked in the newest few), the project, and any folders they have open with the files they changed most recently.

Write:
- headline: one short line, at most eight words, that meets them where they are. Name the actual work when the context shows it, as a colleague would on sitting down beside them. A question or a statement, never a greeting or a sales line.
- suggestions: exactly two next steps they would plausibly want right now, each grounded in something specific from the context. One can pick up the most recent thread; the other should open something different but related. title is a two or three word verb phrase, label names what it acts on in a few words, and prompt is the full message the person would send, in their own voice.

The assistant can see past conversations but cannot open files in the person's local folders, so a prompt must not depend on reading one. With no recent activity, write a plain inviting headline and two broadly useful suggestions.`

export async function welcome(request: Request): Promise<Response> {
  const token = await bearer()
  if (token instanceof Response) return token
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return problem(
      503,
      'welcome_unconfigured',
      'Welcome suggestions are not configured',
      'Set OPENROUTER_API_KEY in .env (see .env.example).',
    )
  }
  const context = WelcomeContext.safeParse(
    await request.json().catch(() => null),
  )
  if (!context.success) {
    return problem(
      400,
      'welcome_invalid',
      'Invalid welcome context',
      context.error.message,
    )
  }

  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })
  try {
    const completion = await client.chat.completions.parse(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content: JSON.stringify(context.data) },
        ],
        response_format: zodResponseFormat(Welcome, 'welcome'),
        max_tokens: 600,
        // OpenRouter's reasoning control; the model takes no reasoning_effort.
        reasoning: { effort: 'low', exclude: true },
      },
      { signal: request.signal, timeout: 20_000, maxRetries: 1 },
    )
    const answer = completion.choices[0]?.message.parsed
    if (!answer) throw new Error('The model returned no welcome.')
    return Response.json({
      ...answer,
      suggestions: answer.suggestions.slice(0, 2),
    })
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 })
    return problem(
      502,
      'welcome_failed',
      'The welcome model did not answer',
      error instanceof Error ? error.message : String(error),
    )
  }
}
