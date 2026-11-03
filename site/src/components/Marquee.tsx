import { marquee } from '@/content'

// A scalloped band of running phrases, after Arc's press strip.
function Scallop({ flip }: { flip?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 12"
      preserveAspectRatio="none"
      className={`block h-3 w-full text-surface ${flip ? 'rotate-180' : ''}`}
    >
      <defs>
        <pattern
          id={`scallop-${flip ? 'b' : 't'}`}
          width="24"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <path d="M0,12 Q6,0 12,6 T24,12 Z" fill="currentColor" />
        </pattern>
      </defs>
      <rect
        width="120"
        height="12"
        fill={`url(#scallop-${flip ? 'b' : 't'})`}
      />
    </svg>
  )
}

export function Marquee() {
  const run = (hidden: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center">
      {marquee.map((item) => (
        <li key={item} className="flex items-center gap-7 pr-7">
          <span aria-hidden className="text-primary">
            ✦
          </span>
          <span className="font-serif text-[22px] whitespace-nowrap italic">
            {item}
          </span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="relative">
      <Scallop />
      <div className="overflow-hidden bg-surface py-5">
        <div className="flex w-max animate-marquee">
          {run(false)}
          {run(true)}
        </div>
      </div>
      <Scallop flip />
    </div>
  )
}
