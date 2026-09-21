"use client";

import { useCallback, useRef, useState } from "react";
import { MAP } from "@/lib/constants";

export interface Transform {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.55;
const MAX_K = 10;
const DRAG_THRESHOLD = 8;
const IDENTITY: Transform = { x: 0, y: 0, k: 1 };
const COMMIT_MS = 80;

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

function sameTransform(a: Transform, b: Transform) {
  return a.x === b.x && a.y === b.y && a.k === b.k;
}

function isSeatTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-seat-id]"));
}

export function usePanZoom(
  initial: Transform = IDENTITY,
  viewRef?: { current: { x: number; y: number; w: number; h: number } },
) {
  const [transform, setTransform] = useState(initial);
  const transformRef = useRef(transform);
  const initialRef = useRef(initial);
  const liveGroupRef = useRef<SVGGElement | null>(null);
  const gesturingRef = useRef(false);
  const commitTimer = useRef(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(
    null,
  );
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    dist: number;
    k: number;
    x: number;
    y: number;
    mx: number;
    my: number;
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

  const paint = (next: Transform) => {
    transformRef.current = next;
    const group = liveGroupRef.current;
    if (group) group.setAttribute("transform", `translate(${next.x} ${next.y}) scale(${next.k})`);
  };

  const commit = (next: Transform = transformRef.current) => {
    paint(next);
    setTransform((prev) => (sameTransform(prev, next) ? prev : { ...next }));
  };

  const scheduleCommit = () => {
    if (commitTimer.current) return;
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = 0;
      commit();
    }, COMMIT_MS);
  };

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const view = viewRef?.current;
    const centerX = cx ?? (view?.x ?? MAP.viewX) + (view?.w ?? MAP.viewW) / 2;
    const centerY = cy ?? (view?.y ?? MAP.viewY) + (view?.h ?? MAP.viewH) / 2;
    const prev = transformRef.current;
    const nextK = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
    const scale = nextK / prev.k;
    if (!Number.isFinite(scale) || scale === 0) return;
    commit({
      k: nextK,
      x: centerX - (centerX - prev.x) * scale,
      y: centerY - (centerY - prev.y) * scale,
    });
  }, [viewRef]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;

    const svg = event.currentTarget;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      drag.current = null;
      gesturingRef.current = true;
      const pts = [...pointers.current.values()];
      const dist = Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1);
      const mid = toView(svg, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      const prev = transformRef.current;
      pinch.current = { dist, k: prev.k, x: prev.x, y: prev.y, mx: mid.x, my: mid.y };
      suppressClick.current = true;
      try {
        svg.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (isSeatTarget(event.target)) return;

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
      const svg = event.currentTarget;
      const mid = toView(svg, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      const k = Math.min(MAX_K, Math.max(MIN_K, pinch.current.k * (dist / pinch.current.dist)));
      const scale = k / pinch.current.k;
      if (!Number.isFinite(k) || !Number.isFinite(scale)) return;
      paint({
        k,
        x: mid.x - (pinch.current.mx - pinch.current.x) * scale,
        y: mid.y - (pinch.current.my - pinch.current.y) * scale,
      });
      return;
    }

    if (!drag.current || pinch.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (!drag.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.current.moved) {
      drag.current.moved = true;
      gesturingRef.current = true;
      suppressClick.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Algunos navegadores móviles rechazan capture si el pointer ya terminó.
      }
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const view = viewRef?.current;
    const viewW = view?.w ?? MAP.viewW;
    const viewH = view?.h ?? MAP.viewH;
    const dxView = (dx / Math.max(rect.width, 1)) * viewW;
    const dyView = (dy / Math.max(rect.height, 1)) * viewH;
    paint({
      k: transformRef.current.k,
      x: drag.current.tx + dxView,
      y: drag.current.ty + dyView,
    });
    scheduleCommit();
  }, [viewRef]);

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      gesturingRef.current = false;
      if (commitTimer.current) {
        window.clearTimeout(commitTimer.current);
        commitTimer.current = 0;
      }
      commit();
    }
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
    commit({
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
      const prev = transformRef.current;
      const factor = event.deltaY > 0 ? 0.88 : 1.14;
      const nextK = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      const scale = nextK / prev.k;
      if (!Number.isFinite(scale) || scale === 0) return;
      paint({
        k: nextK,
        x: point.x - (point.x - prev.x) * scale,
        y: point.y - (point.y - prev.y) * scale,
      });
      scheduleCommit();
    },
    [viewRef],
  );

  const reset = useCallback(() => {
    suppressClick.current = false;
    pinch.current = null;
    pointers.current.clear();
    drag.current = null;
    gesturingRef.current = false;
    if (commitTimer.current) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = 0;
    }
    commit({ ...initialRef.current });
  }, []);

  return {
    transform,
    suppressClick,
    gesturingRef,
    liveGroupRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    zoomAt,
    fitBounds,
    reset,
  };
}
