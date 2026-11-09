// SOURCING: the rail's Streamline PNGs split into outline, accent, tint and paper masks by scripts/rail-icons.mjs, painted as CSS masks (.icon-mask) in colours the theme around them derives (.rail-mark in styles.css: CSS relative colors over the accent, no script)
import type { CSSProperties, FC } from 'react'
import { RAIL_LAYERS } from '@/assets/icons/streamline/rail/layers'
import type { RailIcon } from '@/assets/icons/streamline/rail/layers'
import { cn } from '@/lib/utils'
import { RAIL_SHIFT } from './rail-wheel'

/** Paint order: the fills first, the outline over them. */
const ORDER = ['tint', 'paper', 'accent', 'line'] as const

type Props = { className?: string }

/**
 * A rail icon as stacked masks: the outline in ink, the accent in the icon's
 * turn of the theme's accent, and the tint and paper as that colour taken
 * toward the rail's ground. It rests a little quieter and comes up to full
 * colour under the enclosing `group/rail` button's hover, current page or
 * pressed state.
 */
function railMark(name: RailIcon): FC<Props> {
  const layers = RAIL_LAYERS[name] as Partial<
    Record<(typeof ORDER)[number], string>
  >
  return function RailMark({ className }) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'rail-mark opacity-75 group-hover/rail:opacity-100 group-aria-[current=page]/rail:opacity-100 group-aria-pressed/rail:opacity-100',
          className,
        )}
        style={{ '--rail-shift': RAIL_SHIFT[name] } as CSSProperties}
      >
        {ORDER.map((layer) => {
          const src = layers[layer]
          return (
            src && (
              <span
                key={layer}
                data-layer={layer}
                className="icon-mask"
                style={{ '--icon-mask': `url("${src}")` } as CSSProperties}
              />
            )
          )
        })}
      </span>
    )
  }
}

export const RailMark = {
  Home: railMark('home'),
  Index: railMark('index'),
  Notes: railMark('notes'),
  Pages: railMark('pages'),
  Spaces: railMark('spaces'),
  Canvas: railMark('canvas'),
  Ide: railMark('ide'),
  Vault: railMark('vault'),
  Files: railMark('files'),
}
