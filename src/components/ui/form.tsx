// SOURCING: coss ui Form, https://coss.com/ui/r/form.json (MIT). Uses the existing Base UI dependency.
'use client'

import { Form as FormPrimitive } from '@base-ui/react/form'
import type React from 'react'

export function Form({
  className,
  ...props
}: FormPrimitive.Props): React.ReactElement {
  return <FormPrimitive className={className} data-slot="form" {...props} />
}

export { FormPrimitive }
