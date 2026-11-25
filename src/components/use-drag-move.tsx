"use client";

import { useCallback, useRef, useState } from "react";

export type DragState = { id: string; label: string; x: number; y: number } | null;

/**
 * Pointer-based drag and drop that works with touch and mouse. Put the returned `grip(id, label)` props on a handle,
 * and `data-day="YYYY-MM-DD"` on every drop target. Calls onDrop(id, day) when released over a different day.
 */
export function useDragMove(onDrop: (id: string, day: string) => void) {
  const [drag, setDrag] = useState<DragState>(null);
  const [over, setOver] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);

  const dayAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-day]")?.dataset.day ?? null;

  const grip = useCallback(
    (id: string, label: string, fromDay: string) => ({
      style: { touchAction: "none" as const },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ id, label, x: e.clientX, y: e.clientY });
        overRef.current = null;
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        setDrag((d) => (d && d.id === id ? { ...d, x: e.clientX, y: e.clientY } : d));
        const day = dayAt(e.clientX, e.clientY);
        const next = day && day !== fromDay ? day : null;
        if (next !== overRef.current) {
          overRef.current = next;
          setOver(next);
        }
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const day = dayAt(e.clientX, e.clientY);
        setDrag(null);
        setOver(null);
        overRef.current = null;
        if (day && day !== fromDay) onDrop(id, day);
      },
      onPointerCancel: () => {
        setDrag(null);
        setOver(null);
        overRef.current = null;
      },
    }),
    [onDrop],
  );

  const ghost = drag ? (
    <div
      className="pointer-events-none fixed z-50 max-w-48 truncate rounded-lg border border-emerald-500 bg-zinc-900 px-3 py-2 text-sm shadow-lg"
      style={{ left: drag.x + 12, top: drag.y - 20 }}
    >
      {drag.label}
    </div>
  ) : null;

  return { grip, over, dragging: drag?.id ?? null, ghost };
}
