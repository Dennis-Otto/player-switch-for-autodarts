/**
 * One change of the accounts at a time.
 *
 * A switch, a sign-out or the background renewal each load the saved accounts, wait
 * for Autodarts or the page, and save the accounts again. Autodarts rotates the
 * refresh token, so a token works once: two of these running side by side spend the
 * same token twice, and the one that saves last writes the state it loaded over the
 * other's work, which loses a parked session. The queue runs them one after another
 * instead, and each loads the accounts only when its turn has come.
 *
 * Every change happens in the extension's one service worker (the popup only sends it
 * messages), so a chain of promises in that worker is all the lock it needs.
 */

/** Runs each task once the tasks before it have ended, and answers with its result. */
export type Queue = <T>(task: () => Promise<T>) => Promise<T>;

export function createQueue(): Queue {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const turn = last.then(() => task());
    // A task that fails reports it to its caller, and the next one runs all the same.
    last = turn.catch(() => undefined);
    return turn;
  };
}
