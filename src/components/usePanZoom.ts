"use client";

import { useCallback, useRef, useState } from "react";
import { MAP } from "@/lib/constants";

export interface Transform {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.5;
const MAX_K = 8;
const DRAG_THRESHOLD = 10;

function viewPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewX: number = MAP.viewX,
  viewY: number = MAP.viewY,
  viewW: number = MAP.viewW,
  viewH: number = MAP.viewH,
) {
  const rect = svg.getBoundingClientRect();
  return {
    x: viewX + ((clientX - rect.left) / Math.max(rect.width, 1)) * viewW,
    y: viewY + ((clientY - rect.top) / Math.max(rect.height, 1)) * viewH,
  };
}

function isSeatTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-seat-id]"));
}

export function usePanZoom(
  initial: Transform = { x: 0, y: 0, k: 1 },
  viewRef?: { current: { x: number; y: number; w: number; h: number } },
) {
  const [transform, setTransform] = useState(initial);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(
    null,
  );
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    dist: number;
    k: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const toView = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const view = viewRef?.current;
    return viewPoint(
      svg,
      clientX,
      clientY,
      view?.x ?? MAP.viewX,
      view?.y ?? MAP.viewY,
      view?.w ?? MAP.viewW,
      view?.h ?? MAP.viewH,
    );
  };

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const view = viewRef?.current;
    const centerX = cx ?? (view?.x ?? MAP.viewX) + (view?.w ?? MAP.viewW) / 2;
    const centerY = cy ?? (view?.y ?? MAP.viewY) + (view?.h ?? MAP.viewH) / 2;
    setTransform((prev) => {
      const nextK = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      const scale = nextK / prev.k;
      if (!Number.isFinite(scale) || scale === 0) return prev;
      return {
        k: nextK,
        x: centerX - (centerX - prev.x) * scale,
        y: centerY - (centerY - prev.y) * scale,
      };
    });
  }, [viewRef]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (isSeatTarget(event.target)) return;

    const svg = event.currentTarget;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      drag.current = null;
      const pts = [...pointers.current.values()];
      const dist = Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1);
      const mid = toView(svg, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      const prev = transformRef.current;
      pinch.current = { dist, k: prev.k, x: prev.x, y: prev.y, vx: mid.x, vy: mid.y };
      suppressClick.current = true;
      try {
        svg.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    const prev = transformRef.current;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      tx: prev.x,
      ty: prev.y,
      moved: false,
    };
    suppressClick.current = false;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinch.current && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1);
      const k = Math.min(MAX_K, Math.max(MIN_K, pinch.current.k * (dist / pinch.current.dist)));
      const scale = k / pinch.current.k;
      if (!Number.isFinite(k) || !Number.isFinite(scale)) return;
      setTransform({
        k,
        x: pinch.current.vx - (pinch.current.vx - pinch.current.x) * scale,
        y: pinch.current.vy - (pinch.current.vy - pinch.current.y) * scale,
      });
      return;
    }

    if (!drag.current || pinch.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (!drag.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.current.moved) {
      drag.current.moved = true;
      suppressClick.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Algunos navegadores móviles rechazan capture si el pointer ya terminó.
      }
    }
    setTransform({
      k: transformRef.current.k,
      x: drag.current.tx + dx,
      y: drag.current.ty + dy,
    });
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
  }, []);

  const fitBounds = useCallback((minX: number, minY: number, maxX: number, maxY: number) => {
    const width = Math.max(maxX - minX, 40);
    const height = Math.max(maxY - minY, 40);
    const k = Math.min(
      MAX_K,
      Math.max(2.4, Math.min(MAP.viewW / (width * 1.12), MAP.viewH / (height * 1.16))),
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setTransform({
      k,
      x: MAP.viewX + MAP.viewW / 2 - cx * k,
      y: MAP.viewY + MAP.viewH / 2 - cy * k,
    });
  }, []);

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const view = viewRef?.current;
      const point = viewPoint(
        event.currentTarget,
        event.clientX,
        event.clientY,
        view?.x ?? MAP.viewX,
        view?.y ?? MAP.viewY,
        view?.w ?? MAP.viewW,
        view?.h ?? MAP.viewH,
      );
      zoomAt(event.deltaY > 0 ? 0.88 : 1.14, point.x, point.y);
    },
    [viewRef, zoomAt],
  );

  const reset = useCallback(() => {
    suppressClick.current = false;
    pinch.current = null;
    pointers.current.clear();
    drag.current = null;
    setTransform(initial);
  }, [initial]);

  return {
    transform,
    suppressClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    zoomAt,
    fitBounds,
    reset,
  };
}
