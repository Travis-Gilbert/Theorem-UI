"use client";

import { forwardRef } from "react";
import type { ComponentPropsWithRef } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
  /** How long the pointer rests before the tooltip opens, in ms. */
  delay?: number;
};

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "bottom", delay, className, ...rest }, ref) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          delay={delay}
          render={
            <Button
              variant="ghost"
              size="icon"
              {...rest}
              className={cn(
                "aui-button-icon size-6 p-1",
                className,
              )}
              ref={ref}
            />
          }
        >
          {children}
          <span className="aui-sr-only sr-only">{tooltip}</span>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

TooltipIconButton.displayName = "TooltipIconButton";
