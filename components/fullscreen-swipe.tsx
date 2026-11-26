"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevron, IconClose } from "@/components/icons";
import { asset } from "@/lib/asset";
import { floorLabel, kr, rok } from "@/lib/format";
import { useStore } from "@/lib/store";
import {
  exitDocumentFullscreen,
  gestureOnRelease,
  lockAxis,
  type Axis,
} from "@/lib/swipe";
import type { Listing } from "@/lib/types";

type Direction = "yes" | "no" | "down";

export function FullscreenSwipe({
  listings,
  dialogOpen,
  rootRef,
  onClose,
  onYes,
  onApply,
  onSkip,
}: {
  listings: Listing[];
  dialogOpen: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onYes: (listing: Listing) => boolean;
  onApply: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const store = useStore();
  const top = listings[0];
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [axis, setAxis] = useState<Axis>(null);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Direction | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [seenId, setSeenId] = useState(top?.id);

  const xRef = useRef(0);
  const yRef = useRef(0);
  const axisRef = useRef<Axis>(null);
  const draggingRef = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const photoRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  const leavingRef = useRef<Direction | null>(null);
  const closing = useRef(false);
  const enteredApi = useRef(false);
  const onCloseRef = useRef(onClose);
  const dialogOpenRef = useRef(dialogOpen);
  const closeActionRef = useRef<() => void>(() => undefined);

  if (top?.id !== seenId) {
    setSeenId(top?.id);
    setPhotoIndex(0);
    setX(0);
    setY(0);
    setAxis(null);
    setLeaving(null);
  }

  function setDrag(nextX: number, nextY: number, nextAxis: Axis) {
    xRef.current = nextX;
    yRef.current = nextY;
    axisRef.current = nextAxis;
    setX(nextX);
    setY(nextY);
    setAxis(nextAxis);
  }

  function close() {
    if (closing.current) return;
    closing.current = true;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };
    exitDocumentFullscreen(doc, rootRef.current);
    onCloseRef.current();
  }

  function commit(direction: Direction) {
    if (!top || leavingRef.current) return;
    if (direction === "yes" && !onYes(top)) {
      setDrag(0, 0, null);
      return;
    }
    leavingRef.current = direction;
    setLeaving(direction);
    const distance = Math.max(560, window.innerWidth);
    if (direction === "down") setDrag(0, window.innerHeight, "y");
    else setDrag(direction === "yes" ? distance : -distance, 0, "x");
    const id = top.id;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (direction === "down") {
        closeActionRef.current();
        return;
      }
      if (direction === "yes") onApply(id);
      else onSkip(id);
      leavingRef.current = null;
      setLeaving(null);
      setDrag(0, 0, null);
    }, 240);
  }

  useEffect(() => {
    onCloseRef.current = onClose;
    dialogOpenRef.current = dialogOpen;
    closeActionRef.current = close;
  });

  useEffect(() => {
    xRef.current = 0;
    yRef.current = 0;
    axisRef.current = null;
    leavingRef.current = null;
    draggingRef.current = false;
  }, [top?.id]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      overscroll: html.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    closeRef.current?.focus();
    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      html.style.overscrollBehavior = previous.overscroll;
      if (timer.current) window.clearTimeout(timer.current);
      document.getElementById("helskarm-knapp")?.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (dialogOpenRef.current) return;
        event.preventDefault();
        closeActionRef.current();
        return;
      }
      if (dialogOpenRef.current || leaving) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "ArrowRight") commit("yes");
      if (event.key === "ArrowLeft") commit("no");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // commit reads the latest card via the render that registered this listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, leaving, onYes, onApply, onSkip]);

  useEffect(() => {
    const node = rootRef.current;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    if (node && (document.fullscreenElement === node || doc.webkitFullscreenElement === node)) {
      enteredApi.current = true;
    }
    function onChange() {
      const current = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      if (node && current === node) {
        enteredApi.current = true;
        return;
      }
      if (enteredApi.current && !dialogOpenRef.current) closeActionRef.current();
    }
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [rootRef]);

  const source = top ? store.sources.find((item) => item.id === top.sourceId) : undefined;
  const landlord = top?.sourceName || source?.name || "Hyresvärd";
  const photos = top?.photos ?? [];
  const vertical = axis === "y" || leaving === "down";
  const transform = vertical ? `translate3d(0, ${y}px, 0)` : `translate3d(${x}px, 0, 0) rotate(${x / 32}deg)`;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={top ? "helskarm-adress" : undefined}
      aria-label={top ? undefined : "Helskärm"}
      className="fixed inset-0 z-40 h-dvh w-full touch-none overflow-hidden bg-ink"
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Stäng helskärm"
        onClick={close}
        className="absolute z-30 grid h-11 w-11 place-items-center rounded-full bg-card/95 text-ink shadow-[0_8px_24px_rgba(28,25,22,0.18)]"
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          right: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        <IconClose className="h-5 w-5" />
      </button>
      {top ? (
        <article
          className={`swipe-move absolute inset-0 z-0 flex flex-col bg-ink${dragging ? " is-dragging" : ""}`}
          style={{ transform }}
          onPointerDown={(event) => {
            if (leaving || event.button !== 0) return;
            if ((event.target as HTMLElement).closest("a, button")) return;
            origin.current = { x: event.clientX, y: event.clientY };
            axisRef.current = null;
            draggingRef.current = true;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!draggingRef.current) return;
            const dx = event.clientX - origin.current.x;
            const dy = event.clientY - origin.current.y;
            const nextAxis = lockAxis(dx, dy, axisRef.current);
            if (nextAxis === "y") setDrag(0, Math.max(0, dy), "y");
            else if (nextAxis === "x") setDrag(dx, 0, "x");
            else setDrag(0, 0, null);
          }}
          onPointerUp={(event) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            setDragging(false);
            const dx = event.clientX - origin.current.x;
            const dy = event.clientY - origin.current.y;
            const rect = photoRef.current?.getBoundingClientRect() ?? null;
            const gesture = gestureOnRelease({
              dx,
              dy,
              axis: axisRef.current,
              clientX: event.clientX,
              clientY: event.clientY,
              photo: rect,
              photoIndex,
              photoCount: photos.length,
            });
            if (gesture.type === "yes" || gesture.type === "no" || gesture.type === "down") {
              commit(gesture.type);
              return;
            }
            if (gesture.type === "photo") setPhotoIndex(gesture.index);
            setDrag(0, 0, null);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
            setDragging(false);
            setDrag(0, 0, null);
          }}
        >
          <div ref={photoRef} className="relative min-h-0 flex-1 bg-paper-deep">
            <img
              src={asset(photos[photoIndex] ?? photos[0])}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div
              className="pointer-events-none absolute top-1/4 left-6 rounded-xl border-2 border-pine bg-card/90 px-3 py-1.5 text-lg font-semibold tracking-wide text-pine"
              style={{ opacity: Math.max(0, Math.min(1, x / 90)) }}
            >
              JA
            </div>
            <div
              className="pointer-events-none absolute top-1/4 right-6 rounded-xl border-2 border-clay bg-card/90 px-3 py-1.5 text-lg font-semibold tracking-wide text-clay"
              style={{ opacity: Math.max(0, Math.min(1, -x / 90)) }}
            >
              NEJ
            </div>
            {photos.length > 1 && photoIndex > 0 ? (
              <button
                type="button"
                aria-label="Föregående bild"
                onClick={() => setPhotoIndex((index) => Math.max(0, index - 1))}
                className="absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink"
                style={{ left: "max(0.75rem, env(safe-area-inset-left))" }}
              >
                <IconChevron className="h-5 w-5" />
              </button>
            ) : null}
            {photos.length > 1 && photoIndex < photos.length - 1 ? (
              <button
                type="button"
                aria-label="Nästa bild"
                onClick={() => setPhotoIndex((index) => Math.min(photos.length - 1, index + 1))}
                className="absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-ink"
                style={{ right: "max(0.75rem, env(safe-area-inset-right))" }}
              >
                <IconChevron className="h-5 w-5 rotate-180" />
              </button>
            ) : null}
            {photos.length > 1 ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {photos.map((src, index) => (
                  <span
                    key={`${src}-${index}`}
                    className={`h-1.5 rounded-full ${index === photoIndex ? "w-4 bg-card" : "w-1.5 bg-card/55"}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div
            className="shrink-0 bg-card pt-4 text-ink"
            style={{
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
              paddingRight: "max(1.25rem, env(safe-area-inset-right))",
            }}
          >
            <h2 id="helskarm-adress" className="font-serif text-3xl tracking-[-0.03em]">
              {top.address}
            </h2>
            <p className="mt-1 text-sm text-soft">
              {top.area}, {top.city}
            </p>
            <p className="num mt-2 text-2xl font-semibold tracking-tight">
              {kr(top.rent)}
              <span className="text-base font-normal text-soft"> / mån</span>
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Fact label="Rum" value={rok(top.rooms)} />
              <Fact label="Storlek" value={`${top.sqm} m²`} />
              <Fact label="Våning" value={floorLabel(top.floor, top.floors)} />
              <Fact label="Hyresvärd" value={landlord} />
            </dl>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-line text-sm font-medium"
                onClick={() => commit("no")}
                aria-label="Nej, hoppa över"
              >
                Nej
              </button>
              <p className="flex-1 text-center text-xs leading-snug text-faint">Höger ja · vänster nej · nedåt stänger</p>
              {top.manualApply ? (
                <a
                  href={top.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-16 shrink-0 items-center rounded-full border border-line px-4 text-sm font-medium"
                >
                  Ansök själv
                </a>
              ) : (
                <button
                  type="button"
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-pine text-sm font-medium text-white"
                  onClick={() => commit("yes")}
                  aria-label="Ja, ansök"
                >
                  Ja
                </button>
              )}
            </div>
          </div>
        </article>
      ) : (
        <div className="grid h-full place-items-center px-8 text-center text-paper">
          <div>
            <p className="font-serif text-3xl tracking-[-0.03em]">Du är ikapp</p>
            <p className="mt-2 text-sm text-paper/80">Inga fler bostäder just nu.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-paper px-3 py-2.5">
      <dt className="text-xs text-soft">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
