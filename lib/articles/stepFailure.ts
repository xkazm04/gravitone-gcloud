// The failure a step reports and the cost arithmetic a step carries.
// StepError is what a step throws when it fails after some of its turns already ran:
// the cost of those turns travels with the error. Its own file because the drive, the
// agent steps and the critique all throw or sum these, and none of them should own the others.



export class StepError extends Error {
  constructor(
    message: string,
    readonly costUsd?: number,
  ) {
    super(message);
  }
}

export const sumCost = (a: number | undefined, b: number | undefined) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
