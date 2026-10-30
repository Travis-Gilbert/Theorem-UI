import { Figure, Label, Patterns, dashed, ink, order } from './Figure'

// Euclid, Elements I.47, on a 3-4-5 triangle with the right angle at A. The
// hatched square on AB equals the hatched rectangle BL beneath the hypotenuse;
// the dotted square on AC equals the dotted rectangle CL. Together they fill
// the square on BC. The incircle (r = 80) is the figure's one solid mark.
const P = {
  A: [444, 328],
  B: [300, 520],
  C: [700, 520],
  D: [300, 920],
  E: [700, 920],
  F: [108, 376],
  G: [252, 184],
  H: [636, 72],
  K: [892, 264],
  L: [444, 920],
  M: [444, 520],
} as const

type Point = keyof typeof P
const pts = (...names: Point[]) => names.map((n) => P[n].join(',')).join(' ')
const seg = (a: Point, b: Point, i: number) => (
  <line
    x1={P[a][0]}
    y1={P[a][1]}
    x2={P[b][0]}
    y2={P[b][1]}
    {...ink}
    style={order(i)}
  />
)

export function Euclid({ className }: { className?: string }) {
  return (
    <Figure
      label="Euclid's proof of the Pythagorean theorem: squares on the three sides of a right triangle, with the areas that prove it hatched and dotted."
      className={className}
    >
      <svg viewBox="40 20 920 960" className="h-full w-full overflow-visible">
        <Patterns id="euclid" />

        {/* Equal areas */}
        <g className="reveal" style={order(10)}>
          <polygon points={pts('B', 'F', 'G', 'A')} fill="url(#euclid-hatch)" />
          <polygon points={pts('B', 'M', 'L', 'D')} fill="url(#euclid-hatch)" />
          <polygon
            points={pts('A', 'H', 'K', 'C')}
            fill="url(#euclid-dots)"
            opacity="0.55"
          />
          <polygon
            points={pts('M', 'C', 'E', 'L')}
            fill="url(#euclid-dots)"
            opacity="0.55"
          />
        </g>

        {/* Thales: the right angle stands on the semicircle over BC. */}
        <path
          d="M300,520 A200,200 0 0 1 700,520"
          {...dashed}
          style={order(9)}
        />
        <line x1="60" y1="520" x2="940" y2="520" {...dashed} style={order(9)} />

        <circle
          cx="460"
          cy="440"
          r="80"
          fill="var(--color-human)"
          className="reveal"
          style={order(11)}
        />

        <polygon
          points={pts('A', 'B', 'C')}
          {...ink}
          strokeWidth={1.75}
          style={order(0)}
        />
        <polygon points={pts('B', 'F', 'G', 'A')} {...ink} style={order(1)} />
        <polygon points={pts('A', 'H', 'K', 'C')} {...ink} style={order(2)} />
        <polygon points={pts('B', 'D', 'E', 'C')} {...ink} style={order(3)} />
        {seg('A', 'L', 4)}
        {seg('F', 'C', 5)}
        {seg('A', 'D', 6)}
        {seg('B', 'K', 7)}
        {seg('A', 'E', 8)}

        {/* Right angle at A */}
        <polyline
          points="430.8,345.6 448.4,358.8 461.6,341.2"
          {...ink}
          stroke="var(--color-agent)"
          strokeWidth={1.5}
          style={order(4)}
        />

        <Label x={444} y={306}>
          A
        </Label>
        <Label x={282} y={536}>
          B
        </Label>
        <Label x={718} y={536}>
          C
        </Label>
        <Label x={286} y={942}>
          D
        </Label>
        <Label x={714} y={942}>
          E
        </Label>
        <Label x={90} y={384}>
          F
        </Label>
        <Label x={240} y={166}>
          G
        </Label>
        <Label x={640} y={52}>
          H
        </Label>
        <Label x={912} y={262}>
          K
        </Label>
        <Label x={444} y={944}>
          L
        </Label>
        <Label x={458} y={538} size={16}>
          M
        </Label>

        <Label
          x={60}
          y={60}
          mono
          size={17}
          anchor="start"
          fill="var(--color-ink-muted)"
        >
          ELEMENTS I.47
        </Label>
        <Label
          x={60}
          y={88}
          mono
          size={17}
          anchor="start"
          fill="var(--color-ink-faint)"
        >
          a² + b² = c²
        </Label>
        <Label
          x={740}
          y={600}
          mono
          size={17}
          anchor="start"
          fill="var(--color-ink-faint)"
        >
          □AB = ▭BL
        </Label>
        <Label
          x={740}
          y={628}
          mono
          size={17}
          anchor="start"
          fill="var(--color-ink-faint)"
        >
          □AC = ▭CL
        </Label>
      </svg>
    </Figure>
  )
}
