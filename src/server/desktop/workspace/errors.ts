// SOURCING: hand-rolled. An error carrying the HTTP status and problem code a
// workspace route answers with; the shape mirrors theorem-proxy's problem().

export class WorkspaceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Extra members for the problem body, such as the current hash on a 412. */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

export const notFound = (what: string) =>
  new WorkspaceError(404, 'not_found', `${what} does not exist`)
