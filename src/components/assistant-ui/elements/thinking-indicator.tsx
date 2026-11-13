"use client";

// SOURCING: thinking-orbs (ThinkingOrb, the 20px inline preset)
import type { ComponentProps } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { OrbState } from "thinking-orbs";
import { cn } from "@/lib/utils";
import { appearancePair } from "@/lib/appearance-policy";

export function ThinkingIndicator({
  label,
  orb = "working",
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "label"> & {
  label: string;
  /** Which thought the orb beside the label draws. */
  orb?: OrbState;
}) {
  return (
    <div
      data-slot="thinking-indicator"
      className={cn(
        "text-muted-foreground flex items-center gap-2.5 text-sm",
        className,
      )}

      {...props}
    >
      <ThinkingOrb aria-hidden state={orb} size={20} className="shrink-0" />
      <span
        data-slot="thinking-label"
        data-appearance-recipe="metadata"
        {...appearancePair("secondary", "assistant-reading")}
        className="relative inline-block min-w-0 truncate text-ink-muted"
      >
        {label}
      </span>
    </div>
  );
}
