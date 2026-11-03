// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/main.tsx, its DebouncedInput; imports point at this app), debounced with @tanstack/react-pacer
import * as React from 'react'
import { useDebouncedCallback } from '@tanstack/react-pacer/debouncer'
import { Input } from '@/components/ui/input'

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 300,
  ...props
}: {
  value: string | number
  onChange: (value: string | number) => void
  debounce?: number
} & Omit<React.ComponentProps<typeof Input>, 'onChange'>) {
  const [value, setValue] = React.useState(initialValue)

  // Adapted: follow the outside value by adjusting state during render rather
  // than in an effect (react.dev, "storing information from previous renders").
  const [previous, setPrevious] = React.useState(initialValue)
  if (previous !== initialValue) {
    setPrevious(initialValue)
    setValue(initialValue)
  }

  const debouncedOnChange = useDebouncedCallback(onChange, { wait: debounce })

  return (
    <Input
      {...props}
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        debouncedOnChange(e.target.value)
      }}
    />
  )
}
