"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  phase: number;
  brightness: number;
  parallax: number;
};

type Meteor = {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  opacity: number;
  trail: { x: number; y: number; opacity: number }[];
};

const STAR = "255,255,255";
const NEBULA = "142,100,255";
const NEBULA2 = "0,160,255";
const METEOR = "160,220,255";

export default function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    let frame = 0;
    let scroll = 0;
    let reduced = false;
    let raf: number | null = null;

    const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color}, ${alpha})`);
      g.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const buildStars = () => {
      const count = Math.min(300, Math.floor((w * h) / 5500));
      stars = Array.from({ length: count }, (_, i) => {
        const layer = i % 3;
        const parallax = layer === 0 ? 0.03 : layer === 1 ? 0.08 : 0.16;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          radius: Math.random() * 1.4 + 0.4,
          speed: Math.random() * 0.02 + 0.005,
          phase: Math.random() * Math.PI * 2,
          brightness: Math.random() < 0.08 ? 0.9 : 0.35,
          parallax,
        };
      });
    };

    const spawnMeteor = (): Meteor => ({
      x: Math.random() * w * 0.8 + w * 0.1,
      y: Math.random() * h * 0.4,
      length: Math.random() * 130 + 80,
      speed: Math.random() * 9 + 4,
      angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.7 + 0.3,
      trail: [],
    });

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    };

    const onScroll = () => {
      scroll = window.scrollY || window.pageYOffset || 0;
    };

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, w, h);

      const drift = scroll * 0.02;
      glow(w * 0.75, h * 0.72 - drift, Math.min(w, h) * 0.5, NEBULA, 0.05);
      glow(w * 0.2, h * 0.18 - drift, Math.min(w, h) * 0.4, NEBULA2, 0.04);

      for (const s of stars) {
        const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s.phase + frame * s.speed));
        const alpha = s.brightness * twinkle;
        const y = s.y - scroll * s.parallax;
        const wrapped = y < -10 ? h + 10 : y > h + 10 ? -10 : y;
        ctx.fillStyle = `rgba(${STAR}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, wrapped, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (Math.random() < 0.008 && meteors.length < 4) {
        meteors.push(spawnMeteor());
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.trail.unshift({ x: m.x, y: m.y, opacity: m.opacity });
        if (m.trail.length > 20) m.trail.pop();

        for (let j = 0; j < m.trail.length; j++) {
          const t = m.trail[j];
          const fade = 1 - j / m.trail.length;
          ctx.lineWidth = 2 * fade;
          ctx.strokeStyle = `rgba(${METEOR}, ${fade * m.opacity * 0.7})`;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(t.x + Math.cos(m.angle) * 4, t.y + Math.sin(m.angle) * 4);
          ctx.stroke();
        }

        glow(m.x, m.y, m.length * 0.045, METEOR, m.opacity * 0.35);
        ctx.fillStyle = `rgba(${METEOR}, ${m.opacity})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
        ctx.fill();

        if (m.x > w + 120 || m.y > h + 120) meteors.splice(i, 1);
      }
    };

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };

    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (reduced) draw();
    else raf = requestAnimationFrame(loop);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="starfield"
    />
  );
}