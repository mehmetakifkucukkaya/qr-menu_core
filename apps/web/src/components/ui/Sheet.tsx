"use client";

import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

import { Button } from "./Button";

/**
 * Sheet — the one modal surface (item detail, cart, checkout).
 *
 * Built on the native <dialog> opened with `showModal()`, so the browser —
 * not hand-written code — provides what the earlier per-component drawers got
 * wrong or skipped: a real focus trap, `inert` for the page behind, Escape to
 * close, focus restored to the trigger, and a place in the top layer (no
 * z-index wars with the sticky header or the bottom dock).
 *
 * Layouts
 *   variant="sheet"   bottom sheet on phones, centered modal from `sm`
 *   variant="drawer"  bottom sheet on phones, right-hand drawer from `sm`
 *   variant="left"    navigation drawer sliding in from the left at every size
 *
 * Phones: a grab handle at the top; dragging it (or the header) down past
 * ~110 px dismisses the sheet. Everything else — tap on the dimmed area,
 * Escape, the close button — also closes it.
 *
 * `open` is the single source of truth. Escape and the native `close` event
 * are routed back through `onClose`, so the dialog can never be closed behind
 * React's back.
 */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Visible heading; also the dialog's accessible name. */
  title?: string;
  /** Use instead of `title` when the heading lives in `children`. */
  ariaLabelledBy?: string;
  /** Use when there is no visible heading at all. */
  ariaLabel?: string;
  /** Rendered next to the title (a count badge, a status chip). */
  headerExtra?: ReactNode;
  /** Replaces the title in the header (e.g. a brand block). Pair it with
   *  `ariaLabel`, since there is no heading to name the dialog. */
  headerSlot?: ReactNode;
  /** Replace the standard header with a floating close button (photo sheets). */
  floatingClose?: boolean;
  variant?: "sheet" | "drawer" | "left";
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

const DISMISS_DISTANCE = 110;

// useLayoutEffect warns during server rendering in React 18; this is the usual
// isomorphic stand-in (the dialog is only ever opened on the client anyway).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Sheet({
  open,
  onClose,
  title,
  ariaLabelledBy,
  ariaLabel,
  headerExtra,
  headerSlot,
  floatingClose = false,
  variant = "sheet",
  footer,
  children,
  className,
  bodyClassName,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  const titleId = useId();
  const drag = useRef<{ startY: number; dy: number } | null>(null);

  openRef.current = open;

  // Open / close the native dialog to match `open`.
  useIsoLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", ""); // very old browsers: non-modal fallback
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  // If the component unmounts while open the node leaves the DOM (and the top
  // layer) with it; nothing else to clean up.

  // Escape: keep React's state authoritative instead of letting the browser
  // close the dialog on its own.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      onClose();
    },
    [onClose],
  );

  // Safety net: the browser can still close the dialog without a cancel event
  // (e.g. a second Escape in a row). Sync the state back.
  const handleNativeClose = useCallback(() => {
    if (openRef.current) onClose();
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  // Reset any half-finished drag when the sheet closes.
  useEffect(() => {
    if (!open && panelRef.current) panelRef.current.style.transform = "";
  }, [open]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return;
    drag.current = { startY: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (panelRef.current) panelRef.current.style.transition = "none";
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || !panelRef.current) return;
    state.dy = Math.max(0, event.clientY - state.startY);
    panelRef.current.style.transform = `translateY(${state.dy}px)`;
  };
  const endDrag = () => {
    const state = drag.current;
    drag.current = null;
    const panel = panelRef.current;
    if (!state || !panel) return;
    panel.style.transition = "";
    panel.style.transform = "";
    if (state.dy > DISMISS_DISTANCE) onClose();
  };
  const dragProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  const labelledBy = ariaLabelledBy ?? (title ? titleId : undefined);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : ariaLabel}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      className={clsx(
        "m-0 h-full max-h-none w-full max-w-none overflow-visible bg-transparent p-0 text-text",
        "backdrop:bg-text/45 backdrop:backdrop-blur-[3px] open:flex",
        variant === "sheet" && "items-end justify-center sm:items-center",
        variant === "drawer" &&
          "items-end justify-center sm:items-stretch sm:justify-end",
        variant === "left" && "items-stretch justify-start",
      )}
    >
      <div
        ref={panelRef}
        className={clsx(
          "relative flex flex-col overflow-hidden bg-surface text-text shadow-xl transition-transform duration-200 ease-out-expo",
          variant === "sheet" &&
            "w-full max-h-[92dvh] rounded-t-[1.75rem] animate-sheet-up sm:max-h-[88dvh] sm:max-w-lg sm:animate-pop sm:rounded-3xl",
          variant === "drawer" &&
            "w-full max-h-[92dvh] rounded-t-[1.75rem] animate-sheet-up sm:h-full sm:max-h-none sm:w-[26rem] sm:animate-sheet-right sm:rounded-none sm:rounded-l-[1.75rem]",
          variant === "left" &&
            "h-full max-h-none w-[86vw] max-w-[20rem] rounded-r-[1.75rem] animate-sheet-left",
          className,
        )}
      >
        {/* Grab handle — bottom sheets on phones only. */}
        {variant !== "left" ? (
          <div
            {...dragProps}
            className="absolute inset-x-0 top-0 z-raised flex h-6 touch-none justify-center sm:hidden"
          >
            <span
              aria-hidden
              className={clsx(
                "mt-2 h-1.5 w-10 rounded-full",
                floatingClose ? "bg-white/70 shadow-sm" : "bg-border-strong",
              )}
            />
          </div>
        ) : null}

        {floatingClose ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Kapat"
            className="absolute right-3 top-3 z-raised bg-surface/90 shadow-md backdrop-blur hover:bg-surface"
          >
            <X className="h-5 w-5" aria-hidden />
          </Button>
        ) : (
          <header
            {...(variant === "left" ? {} : dragProps)}
            className={clsx(
              "flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 pb-3",
              variant === "left"
                ? "pt-4"
                : "touch-none pt-6 sm:touch-auto sm:pt-4",
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {headerSlot ??
                (title ? (
                  <h2
                    id={titleId}
                    className="truncate font-heading text-xl font-semibold text-text"
                  >
                    {title}
                  </h2>
                ) : null)}
              {headerExtra}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Kapat"
              className="-mr-2 shrink-0"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </header>
        )}

        <div
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            bodyClassName ?? "px-5 py-4",
          )}
        >
          {children}
        </div>

        {footer ? (
          <footer className="shrink-0 border-t border-border bg-surface px-5 pb-[max(env(safe-area-inset-bottom),0.875rem)] pt-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
