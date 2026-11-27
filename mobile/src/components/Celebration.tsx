import { useEffect, useRef, useState } from "react";
import { CELEBRATE_EVENT, readCelebrate } from "../../phone/celebrate";
import { hapticNotification } from "../platform/sdk";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const SHOW_MS = 9000;

interface Card {
  x: number;
  y: number;
  vx: number;
  vy: number;
  label: string;
  suit: string;
}

// «Каскад карт» как при победе в косынке: карты по очереди вылетают сверху, прыгают по полу и оставляют следы.
function startCascade(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (canvas.width = Math.floor(canvas.clientWidth * dpr));
  const h = (canvas.height = Math.floor(canvas.clientHeight * dpr));
  const cw = 62 * dpr;
  const ch = 88 * dpr;
  const g = 0.55 * dpr;
  const cards: Card[] = [];
  let spawned = 0;
  let last = 0;
  let raf = 0;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  function drawCard(c: Card) {
    const x = c.x;
    const y = c.y;
    ctx!.save();
    ctx!.fillStyle = "#fff";
    ctx!.strokeStyle = "#cfd3d8";
    ctx!.lineWidth = dpr;
    ctx!.beginPath();
    ctx!.roundRect(x, y, cw, ch, 7 * dpr);
    ctx!.fill();
    ctx!.stroke();
    ctx!.fillStyle = c.suit === "♥" || c.suit === "♦" ? "#d62d3b" : "#14161a";
    ctx!.font = `700 ${17 * dpr}px sans-serif`;
    ctx!.fillText(c.label, x + 7 * dpr, y + 21 * dpr);
    ctx!.font = `${34 * dpr}px sans-serif`;
    ctx!.textAlign = "center";
    ctx!.fillText(c.suit, x + cw / 2, y + ch / 2 + 14 * dpr);
    ctx!.textAlign = "left";
    ctx!.restore();
  }

  function frame(t: number) {
    if (t - last > 380 && spawned < 26) {
      last = t;
      spawned++;
      const fromLeft = spawned % 2 === 0;
      cards.push({
        x: rand(0.1, 0.9) * w,
        y: -ch,
        vx: (fromLeft ? 1 : -1) * rand(2, 6) * dpr,
        vy: rand(-2, 2) * dpr,
        label: RANKS[Math.floor(Math.random() * RANKS.length)]!,
        suit: SUITS[Math.floor(Math.random() * SUITS.length)]!,
      });
    }
    for (const c of cards) {
      c.vy += g;
      c.x += c.vx;
      c.y += c.vy;
      if (c.y + ch > h) {
        c.y = h - ch;
        c.vy *= -0.82;
        if (Math.abs(c.vy) < 2 * dpr) c.vy = -rand(10, 16) * dpr;
      }
      if (c.x > -cw && c.x < w + cw) drawCard(c);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// Окно праздника: каскад карт на фоне, картинка по центру, музыка. Закрывается касанием или само.
export function Celebration() {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => window.removeEventListener(CELEBRATE_EVENT, on);
  }, []);

  useEffect(() => {
    if (!open) return;
    hapticNotification("success");
    let stop = () => {};
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && canvasRef.current && typeof CanvasRenderingContext2D !== "undefined" && "roundRect" in CanvasRenderingContext2D.prototype) stop = startCascade(canvasRef.current);
    if (readCelebrate().sound) {
      try {
        const a = new Audio("./celebrate.mp3");
        audioRef.current = a;
        void a.play().catch(() => {});
      } catch {
        /* звук недоступен: праздник идёт без него */
      }
    }
    const timer = window.setTimeout(() => setOpen(false), SHOW_MS);
    return () => {
      stop();
      window.clearTimeout(timer);
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label="Все задачи на сегодня выполнены" onClick={() => setOpen(false)}>
      <canvas ref={canvasRef} className="celebrate-canvas" aria-hidden="true" />
      <div className="celebrate-card" onClick={(e) => e.stopPropagation()}>
        <img src="./celebrate.gif" alt="" width="250" height="329" />
        <b>Все задачи на сегодня выполнены!</b>
        <button className="primary" onClick={() => setOpen(false)}>
          Ура!
        </button>
      </div>
    </div>
  );
}
