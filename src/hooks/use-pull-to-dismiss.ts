"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { shouldDismissSheet } from "@/lib/sheet-dismiss";

type DragState = {
  lastTime: number;
  lastY: number;
  pointerId: number;
  startY: number;
};

export function usePullToDismiss(onDismiss: () => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const drag = useRef<DragState | null>(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  function updateOffset(nextOffset: number) {
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (disabled || event.pointerType !== "touch" || (event.target as Element).closest("button")) return;

    drag.current = {
      lastTime: event.timeStamp,
      lastY: event.clientY,
      pointerId: event.pointerId,
      startY: event.clientY - offsetRef.current,
    };
    velocityRef.current = 0;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const elapsed = Math.max(1, event.timeStamp - current.lastTime);
    velocityRef.current = (event.clientY - current.lastY) / elapsed;
    current.lastTime = event.timeStamp;
    current.lastY = event.clientY;
    updateOffset(Math.max(0, event.clientY - current.startY));
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const timeSinceMove = event.timeStamp - current.lastTime;
    const releaseVelocity = timeSinceMove > 80 ? 0 : velocityRef.current;
    drag.current = null;
    setDragging(false);

    if (!cancelled && shouldDismissSheet(offsetRef.current, releaseVelocity)) {
      updateOffset(window.innerHeight);
      dismissTimer.current = setTimeout(onDismiss, 170);
      return;
    }

    updateOffset(0);
  }

  const style = { "--sheet-drag-offset": `${offset}px` } as CSSProperties;

  return {
    dragProps: {
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finishDrag(event, true),
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finishDrag(event),
    },
    dragging,
    style,
  };
}
