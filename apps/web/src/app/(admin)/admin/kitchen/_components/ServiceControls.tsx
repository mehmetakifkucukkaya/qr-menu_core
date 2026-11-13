"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Square, Volume2, VolumeX } from "lucide-react";

import {
  AlertLoop,
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
  isFullscreen,
  KeepAwake,
  type AudioContextLike,
} from "@/lib/kitchen-alert";

export interface ServiceControlsProps {
  /** A new card has not been touched yet: the bell rings while this is true. */
  alertActive: boolean;
}

function createAudioContext(): AudioContextLike | null {
  const scope = window as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  return Context ? new Context() : null;
}

const BUTTON =
  "inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-input px-4 text-lg font-semibold text-text transition active:scale-[0.98]";

/**
 * "Servisi başlat": one tap that lets the screen ring for new orders (browsers
 * only allow sound after a tap), keeps the tablet awake and goes full screen.
 * "Sessiz" silences the bell without ending the service.
 */
export function ServiceControls({ alertActive }: ServiceControlsProps) {
  const loop = useRef<AlertLoop | null>(null);
  const awake = useRef<KeepAwake | null>(null);
  const [on, setOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hasSound, setHasSound] = useState(true);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const bell = new AlertLoop({ createContext: createAudioContext });
    const keepAwake = new KeepAwake(navigator, document);
    loop.current = bell;
    awake.current = keepAwake;
    setCanFullscreen(fullscreenSupported(document, document.documentElement));

    const onFullscreenChange = () => setFullscreen(isFullscreen(document));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      bell.dispose();
      void keepAwake.stop();
      loop.current = null;
      awake.current = null;
    };
  }, []);

  // Rings while service is on and something new is waiting.
  useEffect(() => {
    loop.current?.setActive(on && alertActive);
  }, [on, alertActive]);

  function start() {
    // Everything that needs a user gesture happens inside this tap.
    setHasSound(loop.current?.unlock() ?? false);
    void awake.current?.start();
    if (canFullscreen && !isFullscreen(document)) void enterFullscreen(document.documentElement);
    setOn(true);
  }

  function stop() {
    setOn(false);
    setMuted(false);
    loop.current?.setMuted(false);
    loop.current?.dispose();
    void awake.current?.stop();
    if (isFullscreen(document)) void exitFullscreen(document);
  }

  function toggleMute() {
    loop.current?.setMuted(!muted);
    setMuted(!muted);
  }

  function toggleFullscreen() {
    if (isFullscreen(document)) void exitFullscreen(document);
    else void enterFullscreen(document.documentElement);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {on ? (
          <>
            <span className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-success-soft px-4 text-lg font-bold text-success">
              <span className="h-3 w-3 rounded-full bg-success" aria-hidden />
              Servis açık
            </span>
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              className={clsx(BUTTON, muted && "bg-surface-high")}
            >
              {muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
              Sessiz
            </button>
            {canFullscreen ? (
              <button type="button" onClick={toggleFullscreen} className={BUTTON}>
                {fullscreen ? (
                  <Minimize2 className="h-5 w-5" aria-hidden />
                ) : (
                  <Maximize2 className="h-5 w-5" aria-hidden />
                )}
                {fullscreen ? "Tam ekrandan çık" : "Tam ekran"}
              </button>
            ) : null}
            <button type="button" onClick={stop} className={BUTTON}>
              <Square className="h-5 w-5" aria-hidden />
              Servisi bitir
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={start}
            className="inline-flex min-h-14 items-center rounded-xl bg-primary px-6 text-xl font-bold text-primary-foreground transition active:scale-[0.98]"
          >
            Servisi başlat
          </button>
        )}
      </div>
      {on ? (
        hasSound ? null : (
          <p className="text-base text-warning">Bu tarayıcıda sesli uyarı kullanılamıyor.</p>
        )
      ) : (
        <p className="max-w-sm text-right text-base text-muted">
          Sesli uyarı kapalı: yeni siparişte zil çalmaz. Başlatınca zil, uyanık ekran ve tam ekran açılır.
        </p>
      )}
    </div>
  );
}
