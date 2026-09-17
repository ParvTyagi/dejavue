// Waiting, time limits and cancellation, shared by the SerpApi client, the LLM
// layer and the audit pipeline.

/** Waits `ms`, but resolves early as soon as the signal fires. */
export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** A signal that fires after `ms`, or earlier if `parent` fires. */
export function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

/**
 * Settles with `work`, or rejects with `onAbort()` the moment the signal fires,
 * even if the work itself ignores the signal.
 */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal, onAbort: () => Error): Promise<T> {
  if (signal.aborted) return Promise.reject(onAbort());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(onAbort());
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Runs `run` with a signal that is aborted after `ms`; rejects when the time is up. */
export function withTimeLimit<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (ms <= 0) return Promise.reject(new Error('No time left'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return untilAborted(run(controller.signal), controller.signal, () => new Error(`Timed out after ${ms} ms`)).finally(() =>
    clearTimeout(timer),
  );
}
