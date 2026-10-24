"use client";

import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsomorphicLayoutEffect } from "../utils/useIsomorphicLayoutEffect";

export const paper = "bg-background border border-border/60 dark:bg-popover";

export const floating = "bg-background border border-border/60 dark:bg-popover";

export const field =
  "bg-foreground/[0.04] forced-colors:border dark:bg-foreground/[0.06]";

export const fieldInteractive =
  "bg-foreground/[0.04] transition-colors hover:bg-foreground/[0.07] forced-colors:border dark:bg-foreground/[0.06] dark:hover:bg-foreground/[0.09]";

export const ghostButton =
  "flex items-center justify-center rounded-full text-muted-foreground outline-hidden transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:ring-1 focus-visible:ring-foreground/20 motion-reduce:transition-none dark:hover:bg-foreground/[0.09]";

export const inkButton =
  "bg-foreground text-background transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 motion-reduce:transition-none forced-colors:border";

export const iconSwap =
  "[grid-area:1/1] transition-[opacity,scale,filter] duration-(--duration-snap) ease-snap motion-reduce:transition-none";

export const iconSwapIn = "scale-100 opacity-100 blur-none";

export const iconSwapOut = "scale-[0.25] opacity-0 blur-[4px]";

export const labelSwap =
  "col-start-1 row-start-1 flex w-max items-center gap-1.5 leading-none transition-[opacity,filter] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none";

export const labelSwapIn = "opacity-100 blur-none";

export const labelSwapOut =
  "pointer-events-none select-none opacity-0 blur-[2px]";

export const collapsePanel =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--duration-glide) ease-glide data-[ending-style]:duration-(--duration-exit) data-[ending-style]:ease-exit data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none";

export const live = "text-redwood-ink";

/**
 * Pops a part in when its message arrived live (the assistant message root
 * carries data-live); parts of messages loaded with history render still.
 */
export const liveEnter =
  "in-data-live:animate-in in-data-live:fade-in in-data-live:zoom-in-95 in-data-live:slide-in-from-bottom-1 in-data-live:ease-settle in-data-live:duration-(--duration-settle)";

export const mono = "font-mono text-[11px] tracking-tight";

export function ShimmerLabel({
  active = true,
  className,
  ...props
}: ComponentProps<"span"> & { active?: boolean }) {
  return (
    <span
      className={cn(
        // One sweep every two beats (--beat is 1200ms), in step with the pulses.
        active &&
          "shimmer [--shimmer-duration:1800] [--shimmer-repeat-delay:600] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Scroll region for content that keeps its own whitespace. `whitespace-pre` in
 * a bounded box clips a long line with no way to reach it, so the rows scroll
 * instead.
 *
 * `codeSurface` wraps all the rows as one block, and the rows are its children.
 * It cannot go on each row: `min-width: 100%` resolves against the scroll
 * container's visible width rather than its scroll width, so a per-row width
 * leaves every row except the longest ending its background at the fold.
 */
export const codeScroll = "overflow-x-auto";

export const codeSurface = "w-max min-w-full";

export function SwapLabel({
  active,
  children,
  className,
}: {
  active: 0 | 1;
  children: [React.ReactNode, React.ReactNode];
  className?: string;
}) {
  const layers = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];
  const [width, setWidth] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const target = layers[active]?.current;
    if (!target) return undefined;
    const measure = () =>
      setWidth(Math.ceil(target.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [active]);

  return (
    <span
      style={width === null ? undefined : { width }}
      className={cn(
        "grid overflow-x-clip transition-[width] duration-(--duration-glide) ease-glide motion-reduce:transition-none",
        className,
      )}
    >
      {children.map((layer, index) => (
        <span
          key={index}
          ref={layers[index]}
          aria-hidden={active !== index}
          className={cn(
            labelSwap,
            active === index ? labelSwapIn : labelSwapOut,
          )}
        >
          {layer}
        </span>
      ))}
    </span>
  );
}
