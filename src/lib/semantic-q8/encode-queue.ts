// One inference at a time. A waiting search jumps ahead of passage indexing,
// but an ONNX call that already started cannot be interrupted.
export function createEncodeQueue<
  TJob extends { id: number; foreground: boolean },
>(run: (job: TJob, canceled: () => boolean) => Promise<void>) {
  const waiting: TJob[] = []
  let active: { id: number; canceled: boolean } | undefined

  async function drain() {
    if (active) return
    try {
      while (waiting.length > 0) {
        const foreground = waiting.findIndex((job) => job.foreground)
        const [job] = waiting.splice(Math.max(0, foreground), 1)
        if (!job) break
        const current = { id: job.id, canceled: false }
        active = current
        await run(job, () => current.canceled)
      }
    } finally {
      active = undefined
    }
  }

  return {
    add(job: TJob) {
      waiting.push(job)
      void drain()
    },
    cancel(id: number) {
      if (active?.id === id) active.canceled = true
      const index = waiting.findIndex((job) => job.id === id)
      if (index !== -1) waiting.splice(index, 1)
    },
  }
}
