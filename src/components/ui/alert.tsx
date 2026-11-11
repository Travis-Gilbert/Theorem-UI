// SOURCING: the neobrutalism Alert (neobrutalism.dev, ekmas/neobrutalism-components, MIT) in the revision the owner supplied; its structure is kept and only its theme classes are mapped to Theorem's palette tokens (docs/plans/evidence/ledger.md lists each)
import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl shadow-[3px_3px_0_0_var(--alert-edge)] font-heading border-2 border-(--alert-edge) p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "[--alert-edge:var(--color-ochre-ink)] bg-ochre-container text-ink [&>svg]:text-ochre-ink",
        destructive:
          "[--alert-edge:var(--color-error-ink)] bg-error-container text-ink [&>svg]:text-error-ink",
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
