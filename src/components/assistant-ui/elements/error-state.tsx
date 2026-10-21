"use client";

import type { ComponentProps } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./surfaces";

export interface ErrorStateProps extends Omit<
  ComponentProps<"div">,
  "children" | "role"
> {
  title: string;
  detail: string;
  retrying: boolean;
  onRetry: () => void;
}

export function ErrorState({
  title,
  detail,
  retrying,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  if (retrying) {
    return (
      <div
        data-slot="error-state"
        key="retrying"
        role="status"
        className={cn(
          "fade-in animate-in flex w-full max-w-sm items-center gap-2.5 text-sm duration-300 motion-reduce:animate-none",
          className,
        )}

        {...props}
      >
        <Icon.Reload className="text-muted-foreground size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        <ShimmerLabel className="text-muted-foreground relative inline-block">
          Retrying
        </ShimmerLabel>
      </div>
    );
  }

  return (
    <div
      data-slot="error-state"
      key="error"
      role="alert"
      className={cn(
        "fade-in animate-in flex w-full max-w-sm items-start gap-2.5 rounded-lg bg-error-container px-4 py-3 text-sm duration-300 motion-reduce:animate-none",
        className,
      )}

      {...props}
    >
      <Icon.Close className="mt-0.5 size-4 shrink-0 text-error-ink" />
      <div>
        <p className="font-medium text-error-ink">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-error-ink/75">
          {detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="ms-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-error-ink transition-colors hover:bg-error-ink/10"
      >
        <Icon.Reload className="size-3" />
        Retry
      </button>
    </div>
  );
}
