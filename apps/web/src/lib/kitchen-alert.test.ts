/**
 * Unit tests for `lib/kitchen-alert.ts`: the bell that rings until a new order
 * is touched, the screen wake lock and full screen - all with fakes, because
 * browsers only allow them after a tap.
 *
 * Run via: cd apps/web && npm run test:kitchen-alert
 */
import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import {
  AlertLoop,
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
  isFullscreen,
  KeepAwake,
  playChime,
  type AudioContextLike,
} from "./kitchen-alert.ts";

// ------------------------------------------------------------------ fakes

function fakeAudio() {
  const oscillators: Array<{ frequency: { value: number }; started: number[]; stopped: number[]; connected: unknown[] }> = [];
  const gains: Array<{ connected: unknown[] }> = [];
  const context = {
    currentTime: 10,
    destination: { name: "speakers" },
    state: "suspended",
    resumed: 0,
    closed: 0,
    async resume() {
      this.resumed += 1;
      this.state = "running";
    },
    async close() {
      this.closed += 1;
    },
    createOscillator() {
      const osc = {
        type: "square",
        frequency: { value: 0 },
        started: [] as number[],
        stopped: [] as number[],
        connected: [] as unknown[],
        connect(node: unknown) {
          this.connected.push(node);
        },
        start(t: number) {
          this.started.push(t);
        },
        stop(t: number) {
          this.stopped.push(t);
        },
      };
      oscillators.push(osc);
      return osc;
    },
    createGain() {
      const gain = {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connected: [] as unknown[],
        connect(node: unknown) {
          this.connected.push(node);
        },
      };
      gains.push(gain);
      return gain;
    },
  };
  return { context: context as unknown as AudioContextLike & typeof context, oscillators, gains };
}

async function settle() {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

beforeEach(() => mock.timers.enable({ apis: ["setInterval", "setTimeout"] }));
afterEach(() => mock.timers.reset());

// ------------------------------------------------------------------ the chime

test("a chime is two sine tones through a gain to the speakers", () => {
  const { context, oscillators, gains } = fakeAudio();

  playChime(context);

  assert.deepEqual(oscillators.map((o) => o.frequency.value), [880, 1175]);
  assert.ok(oscillators.every((o) => o.started.length === 1 && o.stopped.length === 1));
  assert.ok(oscillators[1].started[0] > oscillators[0].started[0], "the second note follows the first");
  assert.equal(gains.length, 2);
  assert.ok(gains.every((g) => g.connected[0] === context.destination));
  assert.ok(oscillators.every((o) => o.connected[0] === gains[oscillators.indexOf(o)]));
});

// ------------------------------------------------------------------ the loop

test("it stays silent until a tap unlocks the sound", () => {
  const audio = fakeAudio();
  const loop = new AlertLoop({ createContext: () => audio.context });

  loop.setActive(true);

  assert.equal(audio.oscillators.length, 0);
  assert.equal(loop.unlocked, false);
});

test("unlocking creates and resumes the audio context once", async () => {
  let created = 0;
  const audio = fakeAudio();
  const loop = new AlertLoop({
    createContext: () => {
      created += 1;
      return audio.context;
    },
  });

  assert.equal(loop.unlock(), true);
  assert.equal(loop.unlock(), true);
  await settle();

  assert.equal(created, 1);
  assert.equal(audio.context.resumed >= 1, true);
  assert.equal(loop.unlocked, true);
});

test("a browser without Web Audio simply has no sound", () => {
  const loop = new AlertLoop({ createContext: () => null });
  assert.equal(loop.unlock(), false);
  loop.setActive(true);
  assert.equal(loop.unlocked, false);
});

test("it rings at once and every 4 seconds while something needs attention", () => {
  const audio = fakeAudio();
  const loop = new AlertLoop({ createContext: () => audio.context });
  loop.unlock();

  loop.setActive(true);
  assert.equal(audio.oscillators.length, 2, "one chime now");

  mock.timers.tick(3_999);
  assert.equal(audio.oscillators.length, 2);
  mock.timers.tick(1);
  assert.equal(audio.oscillators.length, 4);
  mock.timers.tick(4_000);
  assert.equal(audio.oscillators.length, 6);

  loop.setActive(false);
  mock.timers.tick(20_000);
  assert.equal(audio.oscillators.length, 6, "touching the card ends it");
});

test("mute silences it and unmuting rings again if something still needs attention", () => {
  const audio = fakeAudio();
  const loop = new AlertLoop({ createContext: () => audio.context });
  loop.unlock();
  loop.setActive(true);
  loop.setMuted(true);
  const rung = audio.oscillators.length;

  mock.timers.tick(30_000);
  assert.equal(audio.oscillators.length, rung);

  loop.setMuted(false);
  assert.equal(audio.oscillators.length, rung + 2);
  loop.dispose();
});

test("dispose stops the loop and releases the audio context", async () => {
  const audio = fakeAudio();
  const loop = new AlertLoop({ createContext: () => audio.context });
  loop.unlock();
  loop.setActive(true);

  loop.dispose();
  await settle();
  const rung = audio.oscillators.length;
  mock.timers.tick(30_000);

  assert.equal(audio.oscillators.length, rung);
  assert.equal(audio.context.closed, 1);
});

// ------------------------------------------------------------------ wake lock

function fakeScreen() {
  const sentinels: Array<{ released: boolean; listeners: Array<() => void>; release(): Promise<void> }> = [];
  const doc = {
    visibilityState: "visible" as "visible" | "hidden",
    listeners: new Map<string, Array<() => void>>(),
    addEventListener(type: string, fn: () => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    },
    removeEventListener(type: string, fn: () => void) {
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
    },
    fire(type: string) {
      for (const fn of this.listeners.get(type) ?? []) fn();
    },
  };
  const nav = {
    requests: 0,
    failNext: false,
    wakeLock: {
      async request(kind: string) {
        assert.equal(kind, "screen");
        nav.requests += 1;
        if (nav.failNext) {
          nav.failNext = false;
          throw new Error("NotAllowedError");
        }
        const sentinel = {
          released: false,
          listeners: [] as Array<() => void>,
          async release() {
            this.released = true;
          },
          addEventListener(_: string, fn: () => void) {
            this.listeners.push(fn);
          },
        };
        sentinels.push(sentinel);
        return sentinel;
      },
    },
  };
  return { nav, doc, sentinels };
}

test("the screen is kept awake, and again when the page comes back into view", async () => {
  const { nav, doc, sentinels } = fakeScreen();
  const keepAwake = new KeepAwake(nav, doc);

  assert.equal(await keepAwake.start(), true);
  assert.equal(nav.requests, 1);

  // The browser drops the lock when the page is hidden.
  sentinels[0].released = true;
  doc.visibilityState = "hidden";
  doc.fire("visibilitychange");
  await settle();
  assert.equal(nav.requests, 1, "nothing to do while hidden");

  doc.visibilityState = "visible";
  doc.fire("visibilitychange");
  await settle();
  assert.equal(nav.requests, 2);

  await keepAwake.stop();
  assert.equal(sentinels[1].released, true);
  doc.fire("visibilitychange");
  await settle();
  assert.equal(nav.requests, 2, "stopped: no more requests");
});

test("a browser without a wake lock, or one that refuses it, is not an error", async () => {
  const { doc } = fakeScreen();
  assert.equal(await new KeepAwake({}, doc).start(), false);

  const refusing = fakeScreen();
  refusing.nav.failNext = true;
  assert.equal(await new KeepAwake(refusing.nav, refusing.doc).start(), false);
});

// ------------------------------------------------------------------ full screen

test("full screen works where the browser has it and is simply absent where it does not", async () => {
  const calls: string[] = [];
  const element = { requestFullscreen: async () => void calls.push("enter") };
  const doc = {
    fullscreenElement: null as unknown,
    exitFullscreen: async () => void calls.push("exit"),
  };

  assert.equal(fullscreenSupported(doc, element), true);
  assert.equal(isFullscreen(doc), false);
  await enterFullscreen(element);
  doc.fullscreenElement = element;
  assert.equal(isFullscreen(doc), true);
  await exitFullscreen(doc);
  assert.deepEqual(calls, ["enter", "exit"]);

  // iPad Safari: no full screen for ordinary elements.
  assert.equal(fullscreenSupported({}, {}), false);
  await enterFullscreen({});
  await exitFullscreen({});
});

test("the WebKit-prefixed full screen is used when that is all there is", async () => {
  const calls: string[] = [];
  const element = { webkitRequestFullscreen: () => void calls.push("webkit-enter") };
  const doc = { webkitFullscreenElement: element, webkitExitFullscreen: () => void calls.push("webkit-exit") };

  assert.equal(fullscreenSupported(doc, element), true);
  assert.equal(isFullscreen(doc), true);
  await enterFullscreen(element);
  await exitFullscreen(doc);
  assert.deepEqual(calls, ["webkit-enter", "webkit-exit"]);
});
