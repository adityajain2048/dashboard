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
