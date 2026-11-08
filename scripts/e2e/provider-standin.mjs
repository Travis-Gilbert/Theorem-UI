// SOURCING: node:http and fetch; a test double of OpenRouter's two routes that Theorem calls, so nothing upstream models it.
//
// OpenRouter as Theorem sees it during scripts/e2e/keys.mjs: it takes only the
// generated test key, swaps in the real one when it forwards a model call, and
// records what each call carried, so the scenario can prove whose key a turn used
// and that the model was asked as Theorem's agent. It records no key and no message
// beyond the head of the system prompt.
import { createServer } from 'node:http'
import { Readable } from 'node:stream'

const SYSTEM_HEAD_CHARS = 200
const PORT = Number(process.env.E2E_STANDIN_PORT)
const TEST_KEY = process.env.E2E_STANDIN_TEST_KEY
const REAL_KEY = process.env.E2E_STANDIN_REAL_KEY

const calls = []

const answer = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
const refuse = (res) => answer(res, 401, { error: { message: 'No auth credentials found', code: 401 } })

function describe(body) {
  try {
    const { messages = [], model, tools = [] } = JSON.parse(body.toString())
    const system = messages.find((message) => message.role === 'system')?.content
    return {
      model,
      tools: tools.map((tool) => tool.function?.name ?? tool.name),
      systemHead: typeof system === 'string' ? system.slice(0, SYSTEM_HEAD_CHARS) : null,
    }
  } catch {
    return {}
  }
}

createServer(async (req, res) => {
  if (req.url === '/__calls') return answer(res, 200, calls)

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)
  const carriedTestKey = req.headers.authorization === `Bearer ${TEST_KEY}`

  if (req.url === '/api/v1/key')
    return carriedTestKey ? answer(res, 200, { data: { label: 'e2e' } }) : refuse(res)

  calls.push({ path: req.url, carriedTestKey, ...describe(body) })
  if (!carriedTestKey) return refuse(res)

  const up = await fetch(`https://openrouter.ai${req.url}`, {
    method: req.method,
    headers: {
      authorization: `Bearer ${REAL_KEY}`,
      'content-type': req.headers['content-type'] ?? 'application/json',
      accept: req.headers.accept ?? '*/*',
    },
    body: body.length ? body : undefined,
  }).catch(() => undefined)
  if (!up) return answer(res, 502, { error: { message: 'OpenRouter did not answer', code: 502 } })
  const { 'content-encoding': _encoding, 'content-length': _length, 'transfer-encoding': _transfer, connection: _connection, ...headers } = Object.fromEntries(up.headers)
  res.writeHead(up.status, headers)
  if (up.body) Readable.fromWeb(up.body).pipe(res)
  else res.end()
}).listen(PORT, '127.0.0.1', () => console.log(`provider stand-in on ${PORT}`))
