// SOURCING: clsx + tailwind-merge (the shadcn cn() convention the registry elements import); lodash-es lowerCase/upperFirst for machine names
import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { lowerCase, upperFirst } from 'lodash-es'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

/** A machine name as a person reads it: "web_search" is "Web search". */
export const humanize = (name: string) => upperFirst(lowerCase(name)) || name
