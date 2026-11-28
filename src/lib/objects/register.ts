// SOURCING: the records register's data model query (components/records/queries); the registry itself is the pure classes.ts. The standard classes are installed by Theorem with the tenant's system types (rustyred-thg-schema notes_classes.rs), never from here.
import { useMemo } from 'react'
import { useDataModel } from '@/components/records/queries'
import { classRegistry } from './classes'

/** The effective class registry: the schema register's declared types, as Notes reads them. */
export function useClassRegistry() {
  const model = useDataModel()
  const registry = useMemo(() => classRegistry(model.data), [model.data])
  return { registry, model }
}
