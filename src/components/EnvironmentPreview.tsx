import { useEffect, useRef } from "react";
import type { EnvironmentMode } from "../game/storage";

interface EnvironmentPreviewProps {
  mode: EnvironmentMode;
  locked?: boolean;
  className?: string;
}

/**
 * Animated procedural key-art canvas previewing either Sea Mode or Enchanted Mangrove.
 * Runs cleanly offline with zero external assets and scales smoothly to devicePixelRatio.
 */
export function EnvironmentPreview({ mode, locked = false, className = "" }: EnvironmentPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 480;
    let h = 240;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = Math.round(rect.width);
        h = Math.round(rect.height);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();

    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    obs?.observe(canvas);

    const drawSea = (t: number) => {
      const hy = h * 0.62;

      // 1. Dusk sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, "#10273b");
      sky.addColorStop(0.38, "#334d66");
      sky.addColorStop(0.72, "#9b6465");
      sky.addColorStop(1, "#ee9251");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hy + 2);

      // 2. Subtle high-sky stars
      for (let i = 0; i < 24; i++) {
        const sx = ((Math.sin(i * 19.7) * 0.5 + 0.5) * 0.94 + 0.03) * w;
        const sy = (Math.sin(i * 43.1) * 0.5 + 0.5) * hy * 0.48;
        const tw = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.8 + i * 2.1));
        ctx.fillStyle = `rgba(220, 238, 255, ${tw})`;
        ctx.beginPath();
        ctx.arc(sx, sy, (i % 3 === 0 ? 1.2 : 0.8), 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Dusk sunset sun orb & warm corona
      const sunX = w * 0.56;
      const sunY = hy - h * 0.05;
      const corona = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, h * 0.48);
      corona.addColorStop(0, "rgba(255, 240, 200, 0.96)");
      corona.addColorStop(0.14, "rgba(255, 198, 122, 0.72)");
      corona.addColorStop(0.45, "rgba(232, 132, 72, 0.22)");
      corona.addColorStop(1, "rgba(232, 132, 72, 0)");
      ctx.fillStyle = corona;
      ctx.fillRect(0, 0, w, hy + 10);

      // Crisp sun core
      ctx.fillStyle = "rgba(255, 244, 214, 0.92)";
      ctx.beginPath();
      ctx.arc(sunX, sunY, Math.min(w, h) * 0.085, 0, Math.PI * 2);
      ctx.fill();

      // 4. Layered backlit dusk clouds
      const cloudPass = (cy: number, drift: number, col: string, alpha: number) => {
        ctx.fillStyle = col;
        ctx.globalAlpha = alpha;
        for (let i = 0; i < 6; i++) {
          const cx = ((i * 0.22 + t * drift) % 1.25 - 0.12) * w;
          const cw = w * (0.22 + (i % 3) * 0.08);
          const ch = h * 0.045;
          ctx.beginPath();
          ctx.ellipse(cx, cy + (i % 2) * 5, cw, ch, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      cloudPass(hy * 0.34, 0.004, "#24344a", 0.45);
      cloudPass(hy * 0.54, 0.007, "#d98862", 0.26);

      // 5. Distant pine-topped coastal mountain silhouettes
      ctx.fillStyle = "#182b38";
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(0, hy - h * 0.14);
      ctx.lineTo(w * 0.12, hy - h * 0.22);
      ctx.lineTo(w * 0.24, hy - h * 0.11);
      ctx.lineTo(w * 0.34, hy - h * 0.02);
      ctx.lineTo(w * 0.36, hy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#1d2c36";
      ctx.beginPath();
      ctx.moveTo(w * 0.68, hy);
      ctx.lineTo(w * 0.77, hy - h * 0.09);
      ctx.lineTo(w * 0.89, hy - h * 0.19);
      ctx.lineTo(w, hy - h * 0.10);
      ctx.lineTo(w, hy);
      ctx.closePath();
      ctx.fill();

      // Horizon atmospheric mist band
      const hMist = ctx.createLinearGradient(0, hy - 14, 0, hy + 8);
      hMist.addColorStop(0, "rgba(244, 173, 108, 0)");
      hMist.addColorStop(0.65, "rgba(244, 173, 108, 0.28)");
      hMist.addColorStop(1, "rgba(244, 173, 108, 0)");
      ctx.fillStyle = hMist;
      ctx.fillRect(0, hy - 14, w, 22);

      // 6. Ocean water body
      const sea = ctx.createLinearGradient(0, hy, 0, h);
      sea.addColorStop(0, "#104552");
      sea.addColorStop(0.42, "#08303b");
      sea.addColorStop(1, "#04161e");
      ctx.fillStyle = sea;
      ctx.fillRect(0, hy, w, h - hy);

      // 7. Sun glitter reflection column across ripples
      for (let r = 0; r < 22; r++) {
        const p = r / 21;
        const ry = hy + 3 + Math.pow(p, 1.35) * (h - hy - 6);
        const rw = (18 + p * 115) * (0.65 + 0.35 * Math.sin(t * 2.2 + r * 1.7));
        const rx = sunX + Math.sin(t * 1.4 + r * 2.3) * (3 + p * 14);
        const alpha = (1 - p * 0.68) * (0.22 + 0.18 * Math.sin(t * 3 + r));
        ctx.fillStyle = `rgba(255, 206, 134, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw * 0.5, 1.1 + p * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle teal ocean swell lines
      ctx.strokeStyle = "rgba(30, 164, 156, 0.22)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const y0 = hy + (i + 1) * ((h - hy) / 7);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const wy = y0 + Math.sin(x * 0.025 + t * (1.1 + i * 0.15) + i) * (1.2 + i * 0.3);
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }

      // 8. SeaDrift wooden sailboat silhouette with warm bow lantern
      const bx = w * 0.38;
      const by = hy + (h - hy) * 0.46 + Math.sin(t * 1.6) * 2.2;
      const tilt = Math.sin(t * 1.3) * 0.04;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(tilt);

      // Hull
      ctx.fillStyle = "#16100b";
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.quadraticCurveTo(0, 7, 26, -1);
      ctx.lineTo(20, 7);
      ctx.quadraticCurveTo(0, 11, -18, 7);
      ctx.closePath();
      ctx.fill();

      // Lateen sails catching dusk warm rim
      ctx.fillStyle = "#221b18";
      ctx.beginPath();
      ctx.moveTo(-2, -3);
      ctx.lineTo(-2, -38);
      ctx.quadraticCurveTo(13, -24, 18, -5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 190, 118, 0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(-4, -31);
      ctx.quadraticCurveTo(-15, -18, -19, -4);
      ctx.closePath();
      ctx.fill();

      // Glowing golden bow lantern (#FFB85C)
      const lx = 24;
      const ly = -6;
      const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 26);
      lg.addColorStop(0, "rgba(255, 232, 175, 0.98)");
      lg.addColorStop(0.28, "rgba(255, 184, 92, 0.55)");
      lg.addColorStop(1, "rgba(255, 184, 92, 0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, ly, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff0c4";
      ctx.beginPath();
      ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Water reflection of lantern
      const lRef = ctx.createRadialGradient(bx + 24, by + 13, 1, bx + 24, by + 13, 28);
      lRef.addColorStop(0, "rgba(255, 184, 92, 0.42)");
      lRef.addColorStop(1, "rgba(255, 184, 92, 0)");
      ctx.fillStyle = lRef;
      ctx.beginPath();
      ctx.ellipse(bx + 24, by + 13, 28, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 9. Floating collectible wisps over the sea
      const wisps = [
        { x: 0.72, y: 0.78, col: "255, 184, 92", ph: 0.4 },
        { x: 0.80, y: 0.86, col: "63, 217, 192", ph: 2.1 },
        { x: 0.20, y: 0.83, col: "255, 184, 92", ph: 4.0 },
      ];
      for (const wp of wisps) {
        const wx = wp.x * w + Math.sin(t * 0.9 + wp.ph) * 4;
        const wy = wp.y * h + Math.cos(t * 1.4 + wp.ph) * 3;
        const g = ctx.createRadialGradient(wx, wy, 1, wx, wy, 16);
        g.addColorStop(0, `rgba(${wp.col}, 0.95)`);
        g.addColorStop(0.35, `rgba(${wp.col}, 0.35)`);
        g.addColorStop(1, `rgba(${wp.col}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(wx, wy, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawMangrove = (t: number) => {
      const hy = h * 0.56;

      // 1. Midnight blue-green atmosphere (#071C25)
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, "#020910");
      sky.addColorStop(0.55, "#071C25");
      sky.addColorStop(1, "#0a2a2e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hy + 2);

      // Sparse subtle stars through canopy opening
      for (let i = 0; i < 14; i++) {
        const sx = (0.30 + ((Math.sin(i * 29.3) * 0.5 + 0.5) * 0.4)) * w;
        const sy = (Math.sin(i * 17.7) * 0.5 + 0.5) * hy * 0.72;
        const tw = 0.2 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + i));
        ctx.fillStyle = `rgba(185, 220, 230, ${tw})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Cool Moonlight orb (#A8C9D2) in upper center canopy gap
      const moonX = w * 0.48;
      const moonY = h * 0.22;
      const mGlow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, h * 0.36);
      mGlow.addColorStop(0, "rgba(226, 243, 247, 0.95)");
      mGlow.addColorStop(0.2, "rgba(168, 201, 210, 0.55)");
      mGlow.addColorStop(0.55, "rgba(67, 140, 145, 0.14)");
      mGlow.addColorStop(1, "rgba(7, 28, 37, 0)");
      ctx.fillStyle = mGlow;
      ctx.fillRect(0, 0, w, hy + 15);

      ctx.fillStyle = "#e3f2f6";
      ctx.beginPath();
      ctx.arc(moonX, moonY, Math.min(w, h) * 0.068, 0, Math.PI * 2);
      ctx.fill();

      // 3. Far background mangrove tree silhouettes veiled in mist
      ctx.fillStyle = "rgba(8, 32, 34, 0.75)";
      for (let i = 0; i < 9; i++) {
        const tx = (i / 8) * w;
        const gap = Math.abs(tx - w * 0.5) < w * 0.14;
        if (gap) continue;
        ctx.fillRect(tx - 6, hy * 0.22, 12, hy * 0.8);
        ctx.beginPath();
        ctx.ellipse(tx, hy * 0.25, 28, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Calm dark emerald mangrove river (#062D2B -> #155D55)
      const water = ctx.createLinearGradient(0, hy, 0, h);
      water.addColorStop(0, "#0b3835");
      water.addColorStop(0.45, "#062D2B");
      water.addColorStop(1, "#031616");
      ctx.fillStyle = water;
      ctx.fillRect(0, hy, w, h - hy);

      // Cool moonlight trail shimmering down center river channel
      for (let r = 0; r < 18; r++) {
        const p = r / 17;
        const ry = hy + 4 + Math.pow(p, 1.3) * (h - hy - 8);
        const rw = (14 + p * 68) * (0.7 + 0.3 * Math.sin(t * 1.5 + r));
        const rx = moonX + Math.sin(t * 0.9 + r * 1.9) * (2 + p * 7);
        const alpha = (1 - p * 0.65) * 0.24;
        ctx.fillStyle = `rgba(168, 201, 210, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw * 0.5, 1 + p, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Layered water-surface fog
      const fog = ctx.createLinearGradient(0, hy - 18, 0, hy + 26);
      fog.addColorStop(0, "rgba(18, 55, 62, 0)");
      fog.addColorStop(0.5, "rgba(21, 78, 76, 0.34)");
      fog.addColorStop(1, "rgba(6, 45, 43, 0)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, hy - 18, w, 44);

      // 5. Distant golden lantern boat silhouette contrasting cool forest
      const bx = w * 0.51;
      const by = hy + (h - hy) * 0.36 + Math.sin(t * 1.3) * 1.2;
      ctx.fillStyle = "#101210";
      ctx.beginPath();
      ctx.moveTo(bx - 14, by);
      ctx.quadraticCurveTo(bx, by + 5, bx + 15, by - 1);
      ctx.lineTo(bx + 11, by + 5);
      ctx.lineTo(bx - 10, by + 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - 1, by - 2);
      ctx.lineTo(bx - 1, by - 24);
      ctx.quadraticCurveTo(bx + 8, by - 15, bx + 11, by - 3);
      ctx.closePath();
      ctx.fill();

      // Golden lantern (#FFB85C) & water reflection
      const lg = ctx.createRadialGradient(bx + 13, by - 3, 1, bx + 13, by - 3, 24);
      lg.addColorStop(0, "rgba(255, 235, 180, 0.98)");
      lg.addColorStop(0.3, "rgba(255, 184, 92, 0.55)");
      lg.addColorStop(1, "rgba(255, 184, 92, 0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(bx + 13, by - 3, 24, 0, Math.PI * 2);
      ctx.fill();

      const lWater = ctx.createRadialGradient(bx + 13, by + 9, 1, bx + 13, by + 9, 26);
      lWater.addColorStop(0, "rgba(255, 184, 92, 0.36)");
      lWater.addColorStop(1, "rgba(255, 184, 92, 0)");
      ctx.fillStyle = lWater;
      ctx.beginPath();
      ctx.ellipse(bx + 13, by + 9, 24, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // 6. Foreground Mangrove Trees, Prop Roots & Hanging Vines on Left & Right Banks
      const drawBank = (dir: 1 | -1) => {
        const edgeX = dir === 1 ? 0 : w;
        ctx.save();

        // Main gnarled trunk leaning over waterway
        ctx.strokeStyle = "#1c1814";
        ctx.lineCap = "round";
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.moveTo(edgeX + dir * w * 0.06, hy + h * 0.14);
        ctx.quadraticCurveTo(edgeX + dir * w * 0.14, hy * 0.55, edgeX + dir * w * 0.25, 4);
        ctx.stroke();

        // Subtle cool moonlight edge rim on bark
        ctx.strokeStyle = "rgba(168, 201, 210, 0.16)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Arching prop roots plunging into dark water (#49372B darkened in night shadow)
        const roots = [
          { sy: hy * 0.58, ex: w * 0.16, ey: hy + h * 0.28, lw: 4.5 },
          { sy: hy * 0.65, ex: w * 0.22, ey: hy + h * 0.24, lw: 3.8 },
          { sy: hy * 0.74, ex: w * 0.28, ey: hy + h * 0.21, lw: 3.0 },
          { sy: hy * 0.78, ex: w * 0.11, ey: hy + h * 0.36, lw: 4.0 },
        ];
        for (const rt of roots) {
          ctx.strokeStyle = "#261d17";
          ctx.lineWidth = rt.lw;
          ctx.beginPath();
          ctx.moveTo(edgeX + dir * w * 0.09, rt.sy);
          ctx.quadraticCurveTo(edgeX + dir * (rt.ex * 0.85), rt.sy + 12, edgeX + dir * rt.ex, rt.ey);
          ctx.stroke();
        }

        // Dense tropical foliage canopy (#123D2A -> #092217)
        const foliagePuffs = [
          { x: 0.06, y: 0.10, rx: 0.18, ry: 0.14, col: "#0a2419" },
          { x: 0.20, y: 0.07, rx: 0.15, ry: 0.11, col: "#123D2A" },
          { x: 0.12, y: 0.24, rx: 0.14, ry: 0.11, col: "#0d2e20" },
          { x: 0.28, y: 0.16, rx: 0.11, ry: 0.09, col: "#14422e" },
        ];
        for (const pf of foliagePuffs) {
          ctx.fillStyle = pf.col;
          ctx.beginPath();
          ctx.ellipse(edgeX + dir * w * pf.x, h * pf.y, w * pf.rx, h * pf.ry, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Swaying hanging vines
        ctx.strokeStyle = "rgba(22, 58, 38, 0.8)";
        ctx.lineWidth = 1.6;
        for (let v = 0; v < 3; v++) {
          const vx = edgeX + dir * w * (0.14 + v * 0.065);
          const sway = Math.sin(t * 1.1 + v * 1.5 + dir) * 3.5;
          const vLen = h * (0.24 + (v % 2) * 0.12);
          ctx.beginPath();
          ctx.moveTo(vx, h * 0.14);
          ctx.quadraticCurveTo(vx + sway * 0.5, h * 0.14 + vLen * 0.5, vx + sway, h * 0.14 + vLen);
          ctx.stroke();
        }
        ctx.restore();
      };

      drawBank(1);
      drawBank(-1);

      // 7. Bioluminescent cyan-turquoise riverbank plants (#43E6C1) + water glow pools
      const bioSpots = [
        { x: w * 0.17, y: hy + h * 0.20 },
        { x: w * 0.83, y: hy + h * 0.22 },
      ];
      for (let i = 0; i < bioSpots.length; i++) {
        const bp = bioSpots[i];
        const pulse = 0.72 + 0.28 * Math.sin(t * 2.0 + i * 2.4);
        const glow = ctx.createRadialGradient(bp.x, bp.y, 1, bp.x, bp.y, 26);
        glow.addColorStop(0, `rgba(67, 230, 193, ${0.75 * pulse})`);
        glow.addColorStop(0.45, `rgba(67, 230, 193, ${0.22 * pulse})`);
        glow.addColorStop(1, "rgba(67, 230, 193, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(bp.x, bp.y + 4, 28, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Delicate leaf blades
        ctx.fillStyle = "#43E6C1";
        for (let b = -2; b <= 2; b++) {
          ctx.beginPath();
          ctx.ellipse(bp.x + b * 3, bp.y - 3, 1.8, 6, b * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 8. Drifting yellow-green Fireflies (#C9E88B)
      for (let i = 0; i < 18; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const baseX = side === 1 ? w * (0.08 + ((i * 7) % 24) * 0.012) : w * (0.92 - ((i * 7) % 24) * 0.012);
        const baseY = h * (0.24 + ((i * 13) % 58) * 0.01);
        const fx = baseX + Math.sin(t * (0.7 + (i % 4) * 0.2) + i * 1.9) * 8;
        const fy = baseY + Math.cos(t * (0.9 + (i % 3) * 0.25) + i * 2.7) * 6;
        const alpha = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.8 + (i % 3) * 0.5) + i * 3.1), 2);
        const fg = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, 7.5);
        fg.addColorStop(0, `rgba(240, 255, 200, ${alpha})`);
        fg.addColorStop(0.4, `rgba(201, 232, 139, ${alpha * 0.6})`);
        fg.addColorStop(1, "rgba(201, 232, 139, 0)");
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(fx, fy, 7.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle atmospheric dim if locked
      if (locked) {
        ctx.fillStyle = "rgba(3, 12, 16, 0.22)";
        ctx.fillRect(0, 0, w, h);
      }
    };

    const start = performance.now();
    const render = (now: number) => {
      const t = (now - start) / 1000;
      if (mode === "sea") drawSea(t);
      else drawMangrove(t);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      obs?.disconnect();
    };
  }, [mode, locked]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} />;
}
