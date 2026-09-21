"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
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

function sameTransform(a: Transform, b: Transform) {
  return a.x === b.x && a.y === b.y && a.k === b.k;
}

function isSeatTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-seat-id]"));
}

function clientToView(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewX: number,
  viewY: number,
  viewW: number,
  viewH: number,
) {
  return {
    x: viewX + ((clientX - rect.left) / Math.max(rect.width, 1)) * viewW,
    y: viewY + ((clientY - rect.top) / Math.max(rect.height, 1)) * viewH,
  };
}

export function usePanZoom(
  initial: Transform = IDENTITY,
  viewRef?: { current: { x: number; y: number; w: number; h: number } },
) {
  const [transform, setTransform] = useState(initial);
  const transformRef = useRef(transform);
  const initialRef = useRef(initial);
  const liveGroupRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gesturingRef = useRef(false);
  const commitTimer = useRef(0);
  const rafRef = useRef(0);
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
    rect: DOMRect;
  } | null>(null);
  const suppressClick = useRef(false);

  const viewBox = () => {
    const view = viewRef?.current;
    return {
      x: view?.x ?? MAP.viewX,
      y: view?.y ?? MAP.viewY,
      w: view?.w ?? MAP.viewW,
      h: view?.h ?? MAP.viewH,
    };
  };

  const applyTransform = (next: Transform) => {
    const group = liveGroupRef.current;
    if (group) group.setAttribute("transform", `translate(${next.x} ${next.y}) scale(${next.k})`);
  };

  const paint = (next: Transform, immediate = false) => {
    transformRef.current = next;
    if (immediate) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      applyTransform(next);
      return;
    }
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyTransform(transformRef.current);
    });
  };

  const markGesturing = (svg: SVGSVGElement | null, active: boolean) => {
    gesturingRef.current = active;
    if (!svg) return;
    if (active) svg.dataset.gesturing = "1";
    else delete svg.dataset.gesturing;
  };

  const captureAll = (svg: SVGSVGElement) => {
    for (const id of pointers.current.keys()) {
      try {
        svg.setPointerCapture(id);
      } catch {
        // ignore
      }
    }
  };

  const releasePointer = (svg: SVGSVGElement, pointerId: number) => {
    try {
      if (svg.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
  };

  const commit = (next: Transform = transformRef.current) => {
    paint(next, true);
    setTransform((prev) => (sameTransform(prev, next) ? prev : { ...next }));
  };

  const commitAfterPaint = () => {
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = 0;
      commit();
    }, 0);
  };

  const endGesture = (svg: SVGSVGElement | null) => {
    drag.current = null;
    pinch.current = null;
    pointers.current.clear();
    markGesturing(svg, false);
    if (commitTimer.current) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = 0;
    }
    commit();
  };

  useLayoutEffect(() => {
    applyTransform(transformRef.current);
  }, [transform]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const box = viewBox();
    const centerX = cx ?? box.x + box.w / 2;
    const centerY = cy ?? box.y + box.h / 2;
    const prev = transformRef.current;
    const nextK = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
    const scale = nextK / prev.k;
    if (!Number.isFinite(scale) || scale === 0) return;
    paint(
      {
        k: nextK,
        x: centerX - (centerX - prev.x) * scale,
        y: centerY - (centerY - prev.y) * scale,
      },
      true,
    );
    commitAfterPaint();
  }, [viewRef]);

  const beginPinch = (svg: SVGSVGElement) => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return;
    svg.style.touchAction = "none";
    drag.current = null;
    markGesturing(svg, true);
    captureAll(svg);
    const rect = svg.getBoundingClientRect();
    const box = viewBox();
    const dist = Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1);
    const mid = clientToView(
      (pts[0].x + pts[1].x) / 2,
      (pts[0].y + pts[1].y) / 2,
      rect,
      box.x,
      box.y,
      box.w,
      box.h,
    );
    const prev = transformRef.current;
    pinch.current = { dist, k: prev.k, x: prev.x, y: prev.y, mx: mid.x, my: mid.y, rect };
    suppressClick.current = true;
  };

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;

    const svg = event.currentTarget;
    svgRef.current = svg;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      event.preventDefault();
      beginPinch(svg);
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
  }, [viewRef]);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinch.current && pointers.current.size >= 2) {
      event.preventDefault();
      const pts = [...pointers.current.values()];
      const dist = Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1);
      const box = viewBox();
      const mid = clientToView(
        (pts[0].x + pts[1].x) / 2,
        (pts[0].y + pts[1].y) / 2,
        pinch.current.rect,
        box.x,
        box.y,
        box.w,
        box.h,
      );
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
      markGesturing(event.currentTarget, true);
      suppressClick.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const box = viewBox();
    const dxView = (dx / Math.max(rect.width, 1)) * box.w;
    const dyView = (dy / Math.max(rect.height, 1)) * box.h;
    paint({
      k: transformRef.current.k,
      x: drag.current.tx + dxView,
      y: drag.current.ty + dyView,
    });
  }, [viewRef]);

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    const svg = event.currentTarget;
    releasePointer(svg, event.pointerId);

    if (pointers.current.size === 1 && pinch.current) {
      pinch.current = null;
      const remaining = [...pointers.current.values()][0];
      const prev = transformRef.current;
      drag.current = {
        x: remaining.x,
        y: remaining.y,
        tx: prev.x,
        ty: prev.y,
        moved: true,
      };
      paint(prev, true);
      return;
    }

    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      markGesturing(svg, false);
      commitAfterPaint();
    }
  }, []);

  const onLostPointerCapture = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0 && (gesturingRef.current || pinch.current || drag.current)) {
      endGesture(event.currentTarget);
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
    paint(
      {
        k,
        x: MAP.viewX + MAP.viewW / 2 - cx * k,
        y: MAP.viewY + MAP.viewH / 2 - cy * k,
      },
      true,
    );
    commitAfterPaint();
  }, []);

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      const box = viewBox();
      const rect = event.currentTarget.getBoundingClientRect();
      const point = clientToView(event.clientX, event.clientY, rect, box.x, box.y, box.w, box.h);
      const prev = transformRef.current;
      const factor = event.deltaY > 0 ? 0.9 : 1.11;
      const nextK = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      const scale = nextK / prev.k;
      if (!Number.isFinite(scale) || scale === 0) return;
      paint({
        k: nextK,
        x: point.x - (point.x - prev.x) * scale,
        y: point.y - (point.y - prev.y) * scale,
      });
      commitAfterPaint();
    },
    [viewRef],
  );

  const reset = useCallback(() => {
    suppressClick.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const svg = svgRef.current;
    if (svg) {
      for (const id of [...pointers.current.keys()]) releasePointer(svg, id);
    }
    transformRef.current = { ...initialRef.current };
    endGesture(svg);
  }, []);

  return {
    transform,
    suppressClick,
    gesturingRef,
    liveGroupRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onLostPointerCapture,
    onWheel,
    zoomAt,
    fitBounds,
    reset,
  };
}
