/**
 * Tiny async mutex. Calls submitted via `run` are serialized in FIFO
 * order. Failures of one task don't poison the chain.
 *
 * We need this because every storage call does read-modify-write on a
 * JSON file. Without serialization, two async IPC handlers can each
 * read, then both write, and the second one silently drops the first
 * one's changes.
 */
export class AsyncMutex {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.tail.then(() => fn())
    // Don't propagate failures into the chain so a single bad task
    // doesn't reject every subsequent enqueued task.
    this.tail = next.catch(() => {})
    return next
  }
}
