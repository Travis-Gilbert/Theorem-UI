"use client";

import { useRef } from "react";
import type { ComponentProps } from "react";
import { useWordsIn } from "@/components/motion";
import { cn } from "@/lib/utils";
import { mono, ShimmerLabel } from "./surfaces";

export function ThinkingIndicator({
  label,
  elapsed,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "label" | "elapsed"> & {
  label: string;
  elapsed?: string;
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
      <span
        aria-hidden
        className="size-1.5 shrink-0 animate-heartbeat rounded-full bg-redwood motion-reduce:animate-none"
      />
      <ThinkingLabel key={label} label={label} />
      {elapsed !== undefined && (
        <span
          className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
        >
          {elapsed}
        </span>
      )}
    </div>
  );
}

/** Each new label rises in word by word; the key above gives every label its own element. */
function ThinkingLabel({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useWordsIn(ref, { gap: 35, y: 8 });
  return (
    <ShimmerLabel
      ref={ref}
      className="relative inline-block min-w-0 truncate leading-tight"
    >
      {label}
    </ShimmerLabel>
  );
}
