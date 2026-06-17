// sleep(ms): Promise-based delay
// chunk<T>(arr, size): Split array into chunks
// retry<T>(fn, maxRetries, delayMs): Retry with exponential backoff
// generateBatchId(): UUID v4 string

import { randomUUID } from 'crypto';

/** Promise-based delay for given milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Split array into chunks of given size */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size) as T[]);
  }
  return result;
}

/** Retry an async function with exponential backoff. Throws last error if all retries fail. */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const backoffMs = delayMs * Math.pow(2, attempt);
        await sleep(backoffMs);
      }
    }
  }
  throw lastError;
}

/** Generate a new batch ID (UUID v4) */
export function generateBatchId(): string {
  return randomUUID();
}

/**
 * Wrap any promise with a hard timeout. Rejects with `Error('timeout')` after `timeoutMs`.
 * Used in aggregators/index.ts to cap the entire aggregator call (including retries inside).
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/**
 * Fetch with a hard timeout. Aborts the request and rejects if `timeoutMs` elapses.
 * Replaces the AbortController + setTimeout boilerplate used in every bridge/aggregator fetcher.
 * The `opts` parameter must NOT include a `signal` — one is created internally.
 */
export async function fetchWithTimeout(
  url: string | URL,
  opts: Omit<RequestInit, 'signal'>,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    // AbortController fires a DOMException, not Error('timeout'). Normalize it so
    // the aggregator layer (callErr.message === 'timeout') can stop p-retry from
    // wasting 2 extra retries on an already-timed-out call.
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('timeout');
    throw e;
  }
}
