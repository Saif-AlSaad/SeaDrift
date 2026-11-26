import { useEffect, useRef } from "react";
import type { BoatLevel } from "../game/boatSkins";
import { previewManager } from "../game/previewRenderer";

interface BoatPreviewProps {
  level: BoatLevel;
  locked?: boolean;
  className?: string;
}

/**
 * Interactive 3D WebGL turntable preview of a boat vessel (Level 1, 2, or 3).
 * Supports horizontal pointer dragging to inspect hulls, rigs, and deck details.
 */
export function BoatPreview({ level, locked = false, className = "" }: BoatPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const yawRef = useRef(0);
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(8, Math.round(rect.width * dpr));
        const h = Math.max(8, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    };
    resize();

    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    obs?.observe(canvas);

    previewManager.registerBoat(canvas, level, locked, yawRef.current);

    return () => {
      obs?.disconnect();
      previewManager.unregister(canvas);
    };
  }, [level, locked]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`Level ${level} 3D Boat Preview`}
      onPointerDown={(e) => {
        dragRef.current = { active: true, lastX: e.clientX };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragRef.current.active || !canvasRef.current) return;
        const dx = e.clientX - dragRef.current.lastX;
        dragRef.current.lastX = e.clientX;
        yawRef.current += dx * 0.012;
        previewManager.setBoatYaw(canvasRef.current, yawRef.current);
      }}
      onPointerUp={(e) => {
        dragRef.current.active = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragRef.current.active = false;
      }}
      className={`block h-full w-full touch-pan-y cursor-grab active:cursor-grabbing ${className}`}
    />
  );
}
