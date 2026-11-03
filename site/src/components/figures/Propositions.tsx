import { Figure, Label, Patterns, dashed, ink, order } from './Figure'

const register = [
  'var(--color-human)',
  'var(--color-agent)',
  'var(--color-insight)',
]

// The Petersen graph with a proper 3-colouring: no edge joins two vertices of
// the same colour, and no 2-colouring exists.
export function Petersen() {
  const at = (r: number, k: number) => {
    const a = ((-90 + 72 * k) * Math.PI) / 180
    return [260 + r * Math.cos(a), 250 + r * Math.sin(a)] as const
  }
  const outer = [0, 1, 2, 3, 4].map((k) => at(190, k))
  const inner = [0, 1, 2, 3, 4].map((k) => at(88, k))
  const colour = { outer: [0, 1, 0, 1, 2], inner: [1, 2, 2, 0, 0] }
  const edges: Array<[readonly [number, number], readonly [number, number]]> =
    []
  for (let k = 0; k < 5; k++) {
    edges.push([outer[k]!, outer[(k + 1) % 5]!])
    edges.push([outer[k]!, inner[k]!])
    edges.push([inner[k]!, inner[(k + 2) % 5]!])
  }

  return (
    <Figure label="The Petersen graph: ten vertices, fifteen edges, coloured with three colours so that no edge joins two of the same.">
      <svg viewBox="0 0 520 500" className="h-full w-full overflow-visible">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            {...ink}
            style={order(i / 2)}
          />
        ))}
        {[
          ...outer.map((p, k) => [p, colour.outer[k]!] as const),
          ...inner.map((p, k) => [p, colour.inner[k]!] as const),
        ].map(([p, c], i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={9}
            fill={register[c]}
            stroke="var(--color-paper)"
            strokeWidth={3}
            className="reveal"
            style={order(8 + i * 0.3)}
          />
        ))}
        <Label x={20} y={470} mono anchor="start" fill="var(--color-ink-faint)">
          χ(P) = 3 · 10 VERTICES · 15 EDGES
        </Label>
      </svg>
    </Figure>
  )
}

// Königsberg, 1736: four land masses, seven bridges. Every vertex has odd
// degree, so no walk crosses each bridge exactly once.
export function Konigsberg() {
  const V = {
    A: [250, 70],
    B: [250, 430],
    C: [190, 250],
    D: [455, 250],
  } as const
  const arc = (a: keyof typeof V, b: keyof typeof V, cx: number, cy: number) =>
    `M${V[a][0]},${V[a][1]} Q${cx},${cy} ${V[b][0]},${V[b][1]}`
  const bridges = [
    arc('A', 'C', 150, 160),
    arc('A', 'C', 260, 170),
    arc('B', 'C', 150, 340),
    arc('B', 'C', 260, 330),
    arc('A', 'D', 400, 100),
    arc('B', 'D', 400, 400),
    arc('C', 'D', 320, 250),
  ]
  const degree = { A: 3, B: 3, C: 5, D: 3 }

  return (
    <Figure label="The seven bridges of Königsberg drawn as a graph: four land masses, seven edges, every vertex of odd degree.">
      <svg viewBox="0 0 520 500" className="h-full w-full overflow-visible">
        <Patterns id="kb" />
        <g className="reveal" style={order(0)}>
          <path
            d="M0,0 H520 V140 C440,150 380,128 300,146 S120,160 0,142 Z"
            fill="url(#kb-hatch)"
          />
          <path
            d="M0,455 H520 V362 C440,350 380,372 300,354 S120,342 0,358 Z"
            fill="url(#kb-hatch)"
          />
          <ellipse cx="190" cy="250" rx="82" ry="44" fill="url(#kb-hatch)" />
          <path
            d="M520,198 C450,196 400,214 388,250 C400,286 450,304 520,302 Z"
            fill="url(#kb-hatch)"
          />
        </g>
        <path
          d="M520,140 C440,150 380,128 300,146 S120,160 0,142"
          {...ink}
          style={order(1)}
        />
        <path
          d="M520,362 C440,350 380,372 300,354 S120,342 0,358"
          {...ink}
          style={order(1)}
        />
        <ellipse cx="190" cy="250" rx="82" ry="44" {...ink} style={order(2)} />
        <path
          d="M520,198 C450,196 400,214 388,250 C400,286 450,304 520,302"
          {...ink}
          style={order(2)}
        />

        {bridges.map((d, i) => (
          <path
            key={i}
            d={d}
            {...ink}
            stroke="var(--color-agent)"
            strokeWidth={1.75}
            style={order(4 + i)}
          />
        ))}
        {(Object.keys(V) as Array<keyof typeof V>).map((k, i) => (
          <g key={k} className="reveal" style={order(11 + i * 0.4)}>
            <circle
              cx={V[k][0]}
              cy={V[k][1]}
              r={14}
              fill="var(--color-paper)"
              stroke="var(--color-ink)"
              strokeWidth={1.25}
            />
            <text
              x={V[k][0]}
              y={V[k][1] + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fill: 'var(--color-ink)',
              }}
            >
              {degree[k]}
            </text>
          </g>
        ))}
        <circle
          cx={V.C[0]}
          cy={V.C[1]}
          r={14}
          fill="var(--color-human)"
          className="reveal"
          style={order(13)}
        />
        <Label
          x={V.C[0]}
          y={V.C[1] + 1}
          mono
          size={12}
          fill="var(--color-paper)"
          i={13}
        >
          5
        </Label>
        <Label x={20} y={485} mono anchor="start" fill="var(--color-ink-faint)">
          EULER, 1736 · deg(v) ODD ∀v → NO EULER WALK
        </Label>
      </svg>
    </Figure>
  )
}

// A commutative square: going round either way gives the same result.
export function Commutes() {
  const O = { A: [90, 90], B: [430, 90], C: [430, 400], D: [90, 400] } as const
  const arrow = (
    from: keyof typeof O,
    to: keyof typeof O,
    i: number,
    extra = {},
  ) => {
    const [x1, y1] = O[from]
    const [x2, y2] = O[to]
    const len = Math.hypot(x2 - x1, y2 - y1)
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    const pad = 34
    return (
      <line
        x1={x1 + ux * pad}
        y1={y1 + uy * pad}
        x2={x2 - ux * pad}
        y2={y2 - uy * pad}
        markerEnd="url(#cm-head)"
        {...ink}
        style={order(i)}
        {...extra}
      />
    )
  }

  return (
    <Figure label="A commutative diagram: composing f then g equals composing h then k.">
      <svg viewBox="0 0 520 500" className="h-full w-full overflow-visible">
        <defs>
          <marker
            id="cm-head"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path
              d="M1,1 L9,5 L1,9"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="1.25"
            />
          </marker>
        </defs>
        <rect
          x="150"
          y="150"
          width="220"
          height="190"
          fill="var(--color-agent-soft)"
          className="reveal"
          style={order(6)}
        />
        {arrow('A', 'B', 0)}
        {arrow('B', 'C', 1)}
        {arrow('A', 'D', 2)}
        {arrow('D', 'C', 3)}
        <line
          x1="114"
          y1="114"
          x2="404"
          y2="374"
          {...dashed}
          stroke="var(--color-human)"
          style={order(5)}
        />

        <Label x={O.A[0]} y={O.A[1]} size={30}>
          A
        </Label>
        <Label x={O.B[0]} y={O.B[1]} size={30}>
          B
        </Label>
        <Label x={O.C[0]} y={O.C[1]} size={30}>
          C
        </Label>
        <Label x={O.D[0]} y={O.D[1]} size={30}>
          D
        </Label>
        <Label x={260} y={68}>
          f
        </Label>
        <Label x={458} y={245}>
          g
        </Label>
        <Label x={62} y={245}>
          h
        </Label>
        <Label x={260} y={428}>
          k
        </Label>
        <Label x={300} y={232} fill="var(--color-human)">
          g ∘ f
        </Label>
        <Label x={260} y={300} size={28} fill="var(--color-agent)">
          ↻
        </Label>
        <Label x={20} y={485} mono anchor="start" fill="var(--color-ink-faint)">
          g ∘ f = k ∘ h
        </Label>
      </svg>
    </Figure>
  )
}

// Cobweb for x ↦ cos x: each pass lands closer to the fixed point x* ≈ 0.739.
export function FixedPoint() {
  const s = 340
  const X = (x: number) => 80 + x * s
  const Y = (y: number) => 430 - y * s
  const curve = Array.from({ length: 61 }, (_, k) => {
    const x = (k / 60) * 1.15
    return `${X(x).toFixed(1)},${Y(Math.cos(x)).toFixed(1)}`
  }).join(' ')
  let x = 0.08
  const web = [`${X(x)},${Y(0)}`]
  for (let n = 0; n < 9; n++) {
    const y = Math.cos(x)
    web.push(
      `${X(x).toFixed(1)},${Y(y).toFixed(1)}`,
      `${X(y).toFixed(1)},${Y(y).toFixed(1)}`,
    )
    x = y
  }
  const star = 0.739085

  return (
    <Figure label="A cobweb diagram of repeated cosine: each iteration moves closer to the fixed point where cos x equals x.">
      <svg viewBox="0 0 520 500" className="h-full w-full overflow-visible">
        <defs>
          <marker
            id="fp-axis"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path
              d="M1,1 L9,5 L1,9"
              fill="none"
              stroke="var(--color-ink-faint)"
              strokeWidth="1.25"
            />
          </marker>
        </defs>
        <line
          x1={X(0)}
          y1={Y(0)}
          x2={X(1.25)}
          y2={Y(0)}
          {...ink}
          stroke="var(--color-ink-faint)"
          markerEnd="url(#fp-axis)"
          style={order(0)}
        />
        <line
          x1={X(0)}
          y1={Y(0)}
          x2={X(0)}
          y2={Y(1.18)}
          {...ink}
          stroke="var(--color-ink-faint)"
          markerEnd="url(#fp-axis)"
          style={order(0)}
        />
        <line
          x1={X(0)}
          y1={Y(0)}
          x2={X(1.12)}
          y2={Y(1.12)}
          {...dashed}
          style={order(1)}
        />
        <polyline points={curve} {...ink} strokeWidth={1.75} style={order(2)} />
        <polyline
          points={web.join(' ')}
          {...ink}
          stroke="var(--color-agent)"
          style={order(4)}
        />
        <line
          x1={X(star)}
          y1={Y(0)}
          x2={X(star)}
          y2={Y(star)}
          {...dashed}
          style={order(10)}
        />
        <circle
          cx={X(star)}
          cy={Y(star)}
          r={9}
          fill="var(--color-human)"
          className="reveal"
          style={order(11)}
        />

        <Label x={X(1.13)} y={Y(Math.cos(1.13)) - 22}>
          y = cos x
        </Label>
        <Label x={X(1.06)} y={Y(1.12)}>
          y = x
        </Label>
        <Label
          x={X(star) + 18}
          y={Y(star) - 20}
          anchor="start"
          fill="var(--color-human)"
        >
          x*
        </Label>
        <Label x={X(star)} y={Y(0) + 20} mono fill="var(--color-ink-faint)">
          0.739
        </Label>
        <Label x={20} y={485} mono anchor="start" fill="var(--color-ink-faint)">
          xₙ₊₁ = cos xₙ → x* · BANACH FIXED POINT
        </Label>
      </svg>
    </Figure>
  )
}

// Moroń's squared rectangle (1925): nine unequal squares tile 33 × 32 exactly.
export function SquaredRectangle() {
  const u = 13
  const squares: Array<[size: number, x: number, y: number]> = [
    [18, 0, 0],
    [15, 18, 0],
    [7, 18, 15],
    [8, 25, 15],
    [14, 0, 18],
    [4, 14, 18],
    [10, 14, 22],
    [1, 24, 22],
    [9, 24, 23],
  ]
  const fill: Record<number, string> = {
    18: 'url(#sq-hatch)',
    4: 'var(--color-agent)',
    1: 'var(--color-human)',
    9: 'url(#sq-dots)',
  }

  return (
    <Figure label="Moroń's squared rectangle: nine squares of different sizes tiling a 33 by 32 rectangle with no gaps.">
      <svg viewBox="0 0 520 500" className="h-full w-full overflow-visible">
        <Patterns id="sq" />
        <g transform={`translate(${(520 - 33 * u) / 2}, 24)`}>
          {squares.map(([size, x, y], i) => (
            <g key={size}>
              {fill[size] && (
                <rect
                  x={x * u}
                  y={y * u}
                  width={size * u}
                  height={size * u}
                  fill={fill[size]}
                  opacity={size === 9 ? 0.55 : 1}
                  className="reveal"
                  style={order(10)}
                />
              )}
              <rect
                x={x * u}
                y={y * u}
                width={size * u}
                height={size * u}
                {...ink}
                style={order(i)}
              />
              {size > 1 && (
                <Label
                  x={x * u + (size * u) / 2}
                  y={y * u + (size * u) / 2}
                  mono
                  size={size > 6 ? 13 : 10}
                  fill={
                    size === 4 ? 'var(--color-paper)' : 'var(--color-ink-muted)'
                  }
                >
                  {size}
                </Label>
              )}
            </g>
          ))}
        </g>
        <Label x={20} y={485} mono anchor="start" fill="var(--color-ink-faint)">
          MOROŃ, 1925 · 33 × 32 = Σ s²
        </Label>
      </svg>
    </Figure>
  )
}
