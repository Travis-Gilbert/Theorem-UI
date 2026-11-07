import { expect, test } from 'bun:test'
import { useComposerReferences } from './composer-references'

test('selecting a newer revision of the same App replaces stale composer context',()=>{
  useComposerReferences.setState({references:[]})
  const location={resource:{kind:'graph-object' as const,objectId:'app-one',objectType:'theorem.app'}}
  useComposerReferences.getState().add({location:{...location,revision:1},excerpt:'old row'})
  useComposerReferences.getState().add({location:{...location,revision:2},excerpt:'selected row'})
  const references=useComposerReferences.getState().take()
  expect(references).toHaveLength(1)
  expect(references[0]).toMatchObject({location:{revision:2},excerpt:'selected row'})
  expect(useComposerReferences.getState().references).toHaveLength(0)
})
