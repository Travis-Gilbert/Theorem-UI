// SOURCING: the theorem-session module's computers() API (RunOutcome, HostKeyChallenge)
//
// Running a script on a saved computer, with the two answers that are not
// output turned into errors a screen can explain: a host key waiting for the
// person, and a script that failed.
import { computers, NO_NATIVE_MODULE, type HostKeyChallenge } from '../../../modules/theorem-session'

export class HostKeyError extends Error {
  constructor(
    readonly computerId: string,
    readonly challenge: HostKeyChallenge,
  ) {
    super(
      challenge.kind === 'changed'
        ? `${challenge.host} presented a different host key than the one this device trusts.`
        : `${challenge.host} has not been trusted on this device yet.`,
    )
    this.name = 'HostKeyError'
  }
}

export class RemoteError extends Error {
  constructor(
    readonly exitStatus: number,
    readonly stderr: string,
  ) {
    super(stderr.trim().split('\n').at(-1) || `The command on the computer exited with status ${exitStatus}.`)
    this.name = 'RemoteError'
  }
}

export class NoComputersError extends Error {
  constructor() {
    super(NO_NATIVE_MODULE)
    this.name = 'NoComputersError'
  }
}

export type Runner = (script: string) => Promise<string>

/** Runs scripts on one computer; resolves with stdout when the script exits 0. */
export function runnerFor(computerId: string): Runner {
  return async (script) => {
    const api = computers()
    if (!api) throw new NoComputersError()
    const outcome = await api.run(computerId, script)
    if (outcome.kind === 'host-key') throw new HostKeyError(computerId, outcome.challenge)
    if (outcome.exitStatus !== 0) throw new RemoteError(outcome.exitStatus, outcome.stderr)
    return outcome.stdout
  }
}
