/**
 * Client-side latency measurement utilities.
 */

export class ClientTimer {
  constructor(label = 'timer') {
    this.label = label;
    this.startAt = null;
    this.marks = [];
  }

  start() {
    this.startAt = performance.now();
    this.marks = [];
    return this;
  }

  mark(name) {
    if (this.startAt == null) return 0;
    const elapsed = performance.now() - this.startAt;
    this.marks.push({ name, elapsedMs: elapsed });
    return elapsed;
  }

  elapsed() {
    if (this.startAt == null) return 0;
    return performance.now() - this.startAt;
  }

  reset() {
    this.startAt = null;
    this.marks = [];
  }
}

/**
 * Compute average from an array of numbers.
 */
export function average(nums) {
  const arr = (nums || []).filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Compute percentile.
 */
export function percentile(nums, p) {
  const arr = (nums || []).filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const idx = Math.floor((p / 100) * (arr.length - 1));
  return arr[idx];
}