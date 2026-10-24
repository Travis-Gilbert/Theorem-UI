"use client";

// SOURCING: thinking-orbs (ThinkingOrb, the 20px inline preset), tw-shimmer through ShimmerLabel, the shared useWordsIn over anime.js
import { useRef } from "react";
import type { ComponentProps } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { OrbState } from "thinking-orbs";
import { useWordsIn } from "@/components/motion";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./surfaces";

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
      <ThinkingLabel key={label} label={label} />
    </div>
  );
}

/** Each new label rises in word by word; the key above gives every label its own element. */
function ThinkingLabel({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useWordsIn(ref, { gap: 35, y: 8 });
  return (
    // A deep band sweeping dim text, rather than the default white band,
    // which only fades a muted label toward the sheet.
    <ShimmerLabel
      ref={ref}
      className="relative inline-block min-w-0 truncate leading-tight font-semibold text-foreground/40 shimmer-color-oxblood-500"
    >
      {label}
    </ShimmerLabel>
  );
}
