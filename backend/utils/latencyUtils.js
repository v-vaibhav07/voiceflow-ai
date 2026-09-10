/**
 * Latency measurement utilities
 */

class LatencyTimer {
  constructor(label = 'timer') {
    this.label = label;
    this.startTime = null;
    this.marks = [];
  }

  start() {
    this.startTime = process.hrtime.bigint();
    this.marks = [{ name: 'start', time: this.startTime, elapsedMs: 0 }];
    return this;
  }

  mark(name) {
    if (!this.startTime) throw new Error('Timer not started');
    const now = process.hrtime.bigint();
    const elapsedNs = now - this.startTime;
    const elapsedMs = Number(elapsedNs) / 1_000_000;
    this.marks.push({ name, time: now, elapsedMs });
    return elapsedMs;
  }

  stop() {
    return this.mark('stop');
  }

  elapsed() {
    if (!this.startTime) return 0;
    const now = process.hrtime.bigint();
    return Number(now - this.startTime) / 1_000_000;
  }

  summary() {
    return {
      label: this.label,
      marks: this.marks.map((m) => ({ name: m.name, elapsedMs: m.elapsedMs })),
      totalMs: this.marks[this.marks.length - 1]?.elapsedMs || 0,
    };
  }
}

function measure(fn) {
  const timer = new LatencyTimer().start();
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then((r) => ({ result: r, latencyMs: timer.stop() }));
  }
  return { result, latencyMs: timer.stop() };
}

module.exports = { LatencyTimer, measure };