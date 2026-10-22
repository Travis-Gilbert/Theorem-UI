// SOURCING: plain span over the Stone surfaces; the mark itself is a Noun
// Project SVG admitted in src/assets/icons (see PROVENANCE.md)
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * A square plate that gives one mark a solid ground to read against. The Noun
 * glyphs are thin outlines, so on their own they read as a wisp at control
 * size; a plate gives them a boundary and a size to fill. The surfaces are
 * Stone tokens, so a plate reads as part of the surface rather than as a
 * colour of its own.
 */
const iconTileVariants = cva(
  'inline-flex shrink-0 items-center justify-center',
  {
    variants: {
      size: {
        sm: 'size-5 rounded-[5px]',
        md: 'size-6 rounded-md',
        lg: 'size-7 rounded-lg',
      },
      surface: {
        /** Steps up from the app and sidebar grounds. */
        raised: 'bg-raised',
        /** Steps down, for a plate that sits on a raised surface. */
        sunken: 'bg-selected',
      },
    },
    defaultVariants: {
      size: 'md',
      surface: 'raised',
    },
  },
)

function IconTile({
  className,
  size,
  surface,
  children,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof iconTileVariants>) {
  return (
    <span
      aria-hidden="true"
      className={cn(iconTileVariants({ size, surface }), className)}
      {...props}
    >
      {children}
    </span>
  )
}

export { IconTile, iconTileVariants }
