// SOURCING: coss ui fieldset (vendored as-is from https://coss.com/ui/r/fieldset.json; registry imports point at this folder)
"use client";

import { Fieldset as FieldsetPrimitive } from "@base-ui/react/fieldset";
import type React from "react";
import { cn } from "@/lib/utils";

export function Fieldset({
  className,
  ...props
}: FieldsetPrimitive.Root.Props): React.ReactElement {
  return (
    <FieldsetPrimitive.Root
      className={className}
      data-slot="fieldset"
      {...props}
    />
  );
}
export function FieldsetLegend({
  className,
  ...props
}: FieldsetPrimitive.Legend.Props): React.ReactElement {
  return (
    <FieldsetPrimitive.Legend
      className={cn("font-semibold text-foreground", className)}
      data-slot="fieldset-legend"
      {...props}
    />
  );
}

export { FieldsetPrimitive };
