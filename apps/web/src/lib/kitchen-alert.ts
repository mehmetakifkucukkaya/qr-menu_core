/**
 * What keeps a kitchen tablet useful on a busy night (SPEC_PILOT_READINESS 5.5):
 * a bell that repeats until a new order is touched, a screen that stays on, and
 * full screen. Browsers only allow the first two after a tap, which is what the
 * "Servisi başlat" button is for.
 *
 * Everything takes its browser object as an argument so it can be unit tested
 * with fakes; the React component passes the real ones.
 */

// ------------------------------------------------------------------ the bell

/** The slice of the Web Audio API a chime uses. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
  createOscillator(): {
    type: string;
    frequency: { value: number };
    connect(node: unknown): void;
    start(when: number): void;
    stop(when: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(value: number, when: number): void;
      linearRampToValueAtTime(value: number, when: number): void;
      exponentialRampToValueAtTime(value: number, when: number): void;
    };
    connect(node: unknown): void;
  };
}

/** A short two-note bell (A5, then D6), generated, so there is no file to load. */
export function playChime(context: AudioContextLike): void {
  const start = context.currentTime;
  const notes: Array<[frequency: number, offset: number]> = [
    [880, 0],
    [1175, 0.22],
  ];
  for (const [frequency, offset] of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(0.4, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.6);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.65);
  }
}

export interface AlertLoopOptions {
  /** Makes the browser's audio context; `null` where Web Audio does not exist. */
  createContext: () => AudioContextLike | null;
  intervalMs?: number;
}

/**
 * Rings every `intervalMs` while something needs attention (`setActive`) and
 * nobody muted it. Silent until `unlock()` has been called from a tap.
 */
export class AlertLoop {
  #createContext: AlertLoopOptions["createContext"];
  #intervalMs: number;
  #context: AudioContextLike | null = null;
  #active = false;
  #muted = false;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: AlertLoopOptions) {
    this.#createContext = options.createContext;
    this.#intervalMs = options.intervalMs ?? 4_000;
  }

  get unlocked(): boolean {
    return this.#context !== null;
  }

  /** Call from a tap: browsers refuse sound before a user gesture. */
  unlock(): boolean {
    if (this.#context === null) this.#context = this.#createContext();
    if (this.#context === null) return false;
    void this.#context.resume?.();
    this.#sync();
    return true;
  }

  setActive(active: boolean): void {
    this.#active = active;
    this.#sync();
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    this.#sync();
  }

  dispose(): void {
    this.#active = false;
    this.#sync();
    void this.#context?.close?.();
    this.#context = null;
  }

  #sync(): void {
    const shouldRing = this.#active && !this.#muted && this.#context !== null;
    if (shouldRing && this.#timer === null) {
      this.#ring();
      this.#timer = setInterval(() => this.#ring(), this.#intervalMs);
    } else if (!shouldRing && this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  #ring(): void {
    if (this.#context) playChime(this.#context);
  }
}

// ------------------------------------------------------------------ the screen

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface NavigatorLike {
  wakeLock?: { request(kind: "screen"): Promise<WakeLockSentinelLike> };
}
interface VisibilityDocumentLike {
  visibilityState?: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/**
 * Keeps the screen on. The browser drops the lock whenever the page is hidden,
 * so it is asked for again each time the page becomes visible.
 */
export class KeepAwake {
  #navigator: NavigatorLike;
  #document: VisibilityDocumentLike;
  #sentinel: WakeLockSentinelLike | null = null;
  #running = false;
  #onVisible = () => {
    if (this.#running && this.#document.visibilityState === "visible") void this.#acquire();
  };

  constructor(navigatorLike: NavigatorLike, documentLike: VisibilityDocumentLike) {
    this.#navigator = navigatorLike;
    this.#document = documentLike;
  }

  /** `false` where the browser has no wake lock or refuses it (never throws). */
  async start(): Promise<boolean> {
    this.#running = true;
    this.#document.addEventListener("visibilitychange", this.#onVisible);
    return this.#acquire();
  }

  async stop(): Promise<void> {
    this.#running = false;
    this.#document.removeEventListener("visibilitychange", this.#onVisible);
    const sentinel = this.#sentinel;
    this.#sentinel = null;
    await sentinel?.release().catch(() => undefined);
  }

  async #acquire(): Promise<boolean> {
    if (!this.#navigator.wakeLock) return false;
    try {
      this.#sentinel = await this.#navigator.wakeLock.request("screen");
      return true;
    } catch {
      return false;
    }
  }
}

// ------------------------------------------------------------------ full screen

interface FullscreenElementLike {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FullscreenDocumentLike {
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
}

export function fullscreenSupported(
  documentLike: FullscreenDocumentLike,
  element: FullscreenElementLike,
): boolean {
  return Boolean(
    (element.requestFullscreen || element.webkitRequestFullscreen) &&
      (documentLike.exitFullscreen || documentLike.webkitExitFullscreen),
  );
}

export function isFullscreen(documentLike: FullscreenDocumentLike): boolean {
  return Boolean(documentLike.fullscreenElement ?? documentLike.webkitFullscreenElement);
}

export async function enterFullscreen(element: FullscreenElementLike): Promise<void> {
  try {
    await (element.requestFullscreen?.() ?? element.webkitRequestFullscreen?.());
  } catch {
    // A refusal (no gesture, not allowed) leaves the page as it was.
  }
}

export async function exitFullscreen(documentLike: FullscreenDocumentLike): Promise<void> {
  try {
    await (documentLike.exitFullscreen?.() ?? documentLike.webkitExitFullscreen?.());
  } catch {
    // Already out.
  }
}
