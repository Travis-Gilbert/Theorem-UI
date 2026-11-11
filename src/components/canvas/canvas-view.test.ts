import { beforeEach, describe, expect, test } from 'bun:test'
import { useCanvasView } from './canvas-view'

const reset = () =>
  useCanvasView.setState({ canvas: undefined, trail: [], projectId: undefined })

describe('canvas view trail', () => {
  beforeEach(reset)

  test('a canvas entered from a note block is the one the canvas opens on', () => {
    useCanvasView.setState({
      projectId: 'project-a',
      trail: [{ spaceId: 'old', title: 'Old' }],
    })
    useCanvasView.getState().enter({ spaceId: 'embedded', title: 'Embedded' })
    // The canvas mounts afterwards and claims its project.
    useCanvasView.getState().setProject('project-a')
    expect(useCanvasView.getState().trail).toEqual([
      { spaceId: 'embedded', title: 'Embedded' },
    ])
  })

  test('the same holds on a first visit, before any project was claimed', () => {
    useCanvasView.getState().enter({ spaceId: 'embedded', title: 'Embedded' })
    useCanvasView.getState().setProject('project-a')
    expect(useCanvasView.getState().trail.at(-1)?.spaceId).toBe('embedded')
  })

  test('inside a mounted canvas, entering goes one level down or back up', () => {
    useCanvasView.setState({
      canvas: { focus: () => {} },
      projectId: 'project-a',
    })
    const { enter } = useCanvasView.getState()
    enter({ spaceId: 'one', title: 'One' })
    enter({ spaceId: 'two', title: 'Two' })
    expect(useCanvasView.getState().trail.map((c) => c.spaceId)).toEqual([
      'one',
      'two',
    ])
    enter({ spaceId: 'one', title: 'One' })
    expect(useCanvasView.getState().trail.map((c) => c.spaceId)).toEqual(['one'])
    expect(useCanvasView.getState().projectId).toBe('project-a')
  })

  test('another project starts at its own canvas', () => {
    useCanvasView.setState({
      canvas: { focus: () => {} },
      projectId: 'project-a',
      trail: [{ spaceId: 'one', title: 'One' }],
    })
    useCanvasView.getState().setProject('project-b')
    expect(useCanvasView.getState().trail).toEqual([])
  })
})
