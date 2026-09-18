"use client";

import { useCallback, useRef, useState } from "react";
import { MAP } from "@/lib/constants";

export interface Transform {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.55;
const MAX_K = 14;

export function usePanZoom(initial: Transform = { x: 0, y: 0, k: 1 }) {
  const [transform, setTransform] = useState(initial);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const start = {
      x: event.clientX,
      y: event.clientY,
      tx: transform.x,
      ty: transform.y,
      moved: false,
    };
    drag.current = start;
    suppressClick.current = false;

    const onMove = (moveEvent: PointerEvent) => {
      if (!drag.current) return;
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (Math.hypot(dx, dy) > 8) {
        drag.current.moved = true;
        suppressClick.current = true;
      }
      setTransform((prev) => ({
        k: prev.k,
        x: start.tx + dx,
        y: start.ty + dy,
      }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      drag.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [transform.x, transform.y]);

  const zoomAt = useCallback((factor: number, cx = MAP.viewX + MAP.viewW / 2, cy = MAP.viewY + MAP.viewH / 2) => {
    setTransform((prev) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, prev.k * factor));
      const scale = k / prev.k;
      return {
        k,
        x: cx - (cx - prev.x) * scale,
        y: cy - (cy - prev.y) * scale,
      };
    });
  }, []);

  const fitBounds = useCallback((minX: number, minY: number, maxX: number, maxY: number) => {
    const width = Math.max(maxX - minX, 40);
    const height = Math.max(maxY - minY, 40);
    const k = Math.min(MAX_K, Math.max(2.2, Math.min(MAP.viewW / (width * 1.18), MAP.viewH / (height * 1.22))));
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
      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const cx = MAP.viewX + ((event.clientX - rect.left) / rect.width) * MAP.viewW;
      const cy = MAP.viewY + ((event.clientY - rect.top) / rect.height) * MAP.viewH;
      zoomAt(event.deltaY > 0 ? 0.88 : 1.14, cx, cy);
    },
    [zoomAt],
  );

  const reset = useCallback(() => {
    suppressClick.current = false;
    setTransform(initial);
  }, [initial]);

  return {
    transform,
    suppressClick,
    onPointerDown,
    onWheel,
    zoomAt,
    fitBounds,
    reset,
  };
}
