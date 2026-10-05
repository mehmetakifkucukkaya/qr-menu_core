/**
 * The loop that keeps the kitchen board fresh (SPEC_PILOT_READINESS 5.5).
 *
 * - fetches at once, then every `intervalMs` (5 s);
 * - gives a request `timeoutMs` (8 s) before it counts as failed;
 * - after consecutive failures retries slower (5 s, 10 s, 20 s, then 30 s) and
 *   goes back to the normal rhythm after the first success;
 * - `refreshNow()` skips the wait (used when the device comes back online or
 *   the tab becomes visible again);
 * - `stop()` aborts the request in flight and swallows its late answer.
 *
 * Framework-free on purpose (the React hook is a thin wrapper), so the timing
 * rules are unit tested with fake timers.
 */

export interface BoardPollerOptions<T> {
  fetchBoard: (signal: AbortSignal) => Promise<T>;
  onData: (data: T, receivedAtMs: number) => void;
  /** `consecutiveFailures` counts this one. */
  onError: (error: unknown, consecutiveFailures: number) => void;
  intervalMs?: number;
  timeoutMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
}

export class BoardPoller<T> {
  #fetchBoard: BoardPollerOptions<T>["fetchBoard"];
  #onData: BoardPollerOptions<T>["onData"];
  #onError: BoardPollerOptions<T>["onError"];
  #intervalMs: number;
  #timeoutMs: number;
  #maxBackoffMs: number;
  #now: () => number;

  #running = false;
  #inFlight = false;
  #again = false;
  #failures = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #controller: AbortController | null = null;

  constructor(options: BoardPollerOptions<T>) {
    this.#fetchBoard = options.fetchBoard;
    this.#onData = options.onData;
    this.#onError = options.onError;
    this.#intervalMs = options.intervalMs ?? 5_000;
    this.#timeoutMs = options.timeoutMs ?? 8_000;
    this.#maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.#now = options.now ?? (() => Date.now());
  }

  get consecutiveFailures(): number {
    return this.#failures;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    void this.#run();
  }

  stop(): void {
    this.#running = false;
    this.#inFlight = false;
    this.#again = false;
    this.#clearTimer();
    this.#controller?.abort();
    this.#controller = null;
  }

  /** Fetch now instead of waiting; one request at a time, one follow-up at most. */
  refreshNow(): void {
    if (!this.#running) return;
    if (this.#inFlight) {
      this.#again = true;
      return;
    }
    this.#clearTimer();
    void this.#run();
  }

  #isCurrent(controller: AbortController): boolean {
    return this.#running && this.#controller === controller;
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  async #run(): Promise<void> {
    this.#inFlight = true;
    const controller = new AbortController();
    this.#controller = controller;
    const giveUp = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const data = await this.#fetchBoard(controller.signal);
      if (this.#isCurrent(controller)) {
        this.#failures = 0;
        this.#onData(data, this.#now());
      }
    } catch (error) {
      // A request that stop() cancelled is not a failure to report.
      if (this.#isCurrent(controller)) {
        this.#failures += 1;
        this.#onError(error, this.#failures);
      }
    } finally {
      clearTimeout(giveUp);
    }
    if (!this.#isCurrent(controller)) return;

    this.#inFlight = false;
    if (this.#again) {
      this.#again = false;
      void this.#run();
      return;
    }
    const delay =
      this.#failures === 0
        ? this.#intervalMs
        : Math.min(this.#maxBackoffMs, this.#intervalMs * 2 ** (this.#failures - 1));
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#run();
    }, delay);
  }
}
