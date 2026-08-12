// lib/http/bounded-fetch.ts
//
// Shared helpers to keep outbound HTTP from wedging the single-vCPU VM.
// Root cause of the Aug 2026 outages: outbound fetches with no timeout (and
// unconsumed response bodies) pile up during upstream blips until sockets/
// event loop are saturated and even the '/' healthcheck stalls.
//
// Rules:
// - Every outbound fetch to an external service must have a hard timeout.
// - Every response body must be consumed or cancelled (undici holds the
//   connection open until the body is drained).
// - Long-lived streams (video proxies) must be bounded in count and lifetime,
//   and must propagate client disconnects upstream.

export const DEFAULT_TIMEOUT_MS = 15_000;

/** fetch with a hard timeout. Caller-provided signal is combined with the timeout. */
export function boundedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}

/**
 * Drain a response body we don't need, so undici can release the socket.
 * Safe to call unconditionally; errors are swallowed.
 */
export async function drainBody(res: Response): Promise<void> {
  try {
    if (res.body && !res.bodyUsed) await res.arrayBuffer();
  } catch {
    /* ignore */
  }
}

/**
 * Simple process-wide semaphore for long-lived proxied streams.
 * On a 1 vCPU / 4 GiB VM, unbounded concurrent video streams can exhaust
 * sockets and memory. Callers must release() in a finally block.
 */
class StreamSemaphore {
  private active = 0;
  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.max) return false;
    this.active++;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }

  get count(): number {
    return this.active;
  }
}

// Max concurrent proxied media streams across the whole process.
export const videoStreamSemaphore = new StreamSemaphore(24);

// Hard ceiling on how long a single proxied stream may stay open. Browsers
// use short-lived range requests for video, so a legitimate stream rarely
// lives more than a couple of minutes; a 10-minute cap only kills stalls.
export const STREAM_LIFETIME_MS = 10 * 60_000;

/**
 * Wrap an upstream body so the upstream connection is cancelled when the
 * client disconnects or the lifetime cap fires, and the semaphore slot is
 * always released when the stream ends for any reason.
 */
export function guardedStream(
  upstreamBody: ReadableStream<Uint8Array>,
  opts: { signal: AbortSignal; onDone: () => void }
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader();
  let finished = false;
  const finish = (cancelUpstream: boolean) => {
    if (finished) return;
    finished = true;
    if (cancelUpstream) reader.cancel().catch(() => {});
    opts.onDone();
  };
  opts.signal.addEventListener("abort", () => finish(true), { once: true });

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done || opts.signal.aborted) {
          controller.close();
          finish(done ? false : true);
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
        finish(true);
      }
    },
    cancel() {
      finish(true);
    },
  });
}
