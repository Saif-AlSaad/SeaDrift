import { useEffect, useRef } from "react";
import { previewManager } from "../game/previewRenderer";
import type { EnvironmentMode } from "../game/storage";

interface EnvironmentPreviewProps {
  mode: EnvironmentMode;
  locked?: boolean;
  className?: string;
}

/**
 * Real-time 3D WebGL miniature preview rendering either Sea Mode or Enchanted Mangrove
 * using the game's procedural 3D meshes, Fresnel water shader, and dynamic lighting.
 */
export function EnvironmentPreview({ mode, locked = false, className = "" }: EnvironmentPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    previewManager.register(canvas, mode, locked);

    return () => {
      obs?.disconnect();
      previewManager.unregister(canvas);
    };
  }, [mode, locked]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`block h-full w-full ${className}`}
    />
  );
}
