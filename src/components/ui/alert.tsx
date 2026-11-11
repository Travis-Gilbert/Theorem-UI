// SOURCING: the neobrutalism Alert (neobrutalism.dev, ekmas/neobrutalism-components, MIT) in the revision the owner supplied; its structure is kept and only its theme classes are mapped to Theorem's palette tokens (docs/plans/evidence/ledger.md lists each)
import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  // The edge and the fill are the variant's ink and container, each taken a
  // third of the way toward what it sits on, so the prompt is quieter than a
  // full container. A painted mark (icons.tsx) is placed like the <svg> and
  // drawn in the variant's own ink over its fill.
  "relative w-full rounded-xl shadow-[3px_3px_0_0_var(--alert-edge)] font-heading border-2 border-(--alert-edge) bg-(--alert-fill) text-ink p-4 [--alert-edge:color-mix(in_oklab,var(--alert-ink)_65%,var(--alert-tone))] [--alert-fill:color-mix(in_oklab,var(--alert-tone)_65%,var(--sheet-from))] [&>:is(svg,.rail-mark)~*]:pl-7 [&>:is(svg,.rail-mark)+div]:translate-y-[-3px] [&>:is(svg,.rail-mark)]:absolute [&>:is(svg,.rail-mark)]:left-4 [&>:is(svg,.rail-mark)]:top-4 [&>:is(svg,.rail-mark)]:size-4 [&>svg]:text-(--alert-ink) [&>.rail-mark]:[--redwood:var(--alert-ink)] [&>.rail-mark]:[--rail-ground:var(--alert-fill)]",
  {
    variants: {
      variant: {
        default:
          "[--alert-ink:var(--color-ochre-ink)] [--alert-tone:var(--color-ochre-container)]",
        destructive:
          "[--alert-ink:var(--color-error-ink)] [--alert-tone:var(--color-error-container)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm font-normal [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
