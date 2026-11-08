// SOURCING: hand-rolled CSS (.monitor-* in styles.css). Checked first: 21st.dev "Mac" (id 1533, designali-in) is a fixed light SVG whose screen is an <image>, so it can hold neither an iframe nor a video and does not take slate. Recorded in evidence/LEDGER.md.
import type { ReactNode } from 'react'

/** A slate body with a screen in it. Only the scene shows the chin and the stand. */
export function Monitor({ children }: { children: ReactNode }) {
  return (
    <div data-tilt="monitor" className="monitor">
      <div className="monitor-body">
        <div className="monitor-screen">{children}</div>
        <div className="monitor-chin" aria-hidden>
          <span className="monitor-light" />
        </div>
      </div>
      <div className="monitor-stand" aria-hidden />
    </div>
  )
}
