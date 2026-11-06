// Экспорт дневника в PDF для печати и архива. Страницы рисуются на холсте шрифтом телефона
// (кириллица и эмодзи работают без встраивания шрифтов) и складываются в PDF как картинки.
// Минус: текст в таком PDF нельзя выделить и найти поиском. Для поиска и чтения с экрана лучше EPUB.
import { prisma } from "./prisma";
import { ready } from "./server";
import type { EpubEntry } from "./epub";

export interface PdfPage {
  w: number;
  h: number;
  jpeg: Uint8Array;
}

const enc = new TextEncoder();
const A4 = { w: 595.28, h: 841.89 }; // страница в пунктах

// Собирает PDF из готовых JPEG-страниц. Чистая функция, проверяется отдельно от холста.
export function buildPdf(pages: PdfPage[], title = "Мой дневник"): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    chunks.push(u);
    len += u.length;
  };
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = len;
    push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body);
    else for (const b of body) push(b);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = pages.length;
  // 1 — каталог, 2 — список страниц, 3 — сведения; далее на каждую страницу: страница, содержимое, картинка
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${4 + i * 3} 0 R`).join(" ");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  // Название в формате PDF: UTF-16 со знаком порядка байтов
  const t16 = "﻿" + title;
  let hex = "";
  for (const ch of t16) hex += ch.charCodeAt(0).toString(16).padStart(4, "0");
  obj(3, `<< /Title <${hex}> /Producer (Navigator) >>`);
  pages.forEach((p, i) => {
    const pageId = 4 + i * 3;
    const contentId = pageId + 1;
    const imgId = pageId + 2;
    obj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    const content = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`;
    obj(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(imgId, [enc.encode(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`), p.jpeg, enc.encode("\nendstream")]);
  });
  const total = 4 + n * 3;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// ── Вёрстка страниц ──
const PW = 1000; // ширина страницы в пикселях (A4 примерно 120 точек на дюйм)
const PH = Math.round(PW * (A4.h / A4.w));
const MARGIN = 80;
const BODY = 25;
const LINE = 36;
const MAX_PAGES = 400;

type Block = { kind: "month" | "date" | "text"; text: string };

function toBlocks(entries: EpubEntry[]): Block[] {
  const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const out: Block[] = [];
  let month = "";
  for (const e of [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const m = `${MONTHS[e.createdAt.getMonth()]} ${e.createdAt.getFullYear()}`;
    if (m !== month) {
      out.push({ kind: "month", text: m });
      month = m;
    }
    const date = e.createdAt.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    const time = e.createdAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    out.push({ kind: "date", text: `${date}, ${time}${e.isPrivate ? " · личная" : ""}` });
    for (const para of e.content.split(/\n+/)) if (para.trim()) out.push({ kind: "text", text: para.trim() });
  }
  return out;
}

const FONT = '"Roboto","Noto Sans","Segoe UI",Arial,sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    let w = word;
    // очень длинное слово без пробелов режем по символам
    while (ctx.measureText(w).width > width) {
      let cut = w.length - 1;
      while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > width) cut--;
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const trial = line ? `${line} ${w}` : w;
    if (ctx.measureText(trial).width <= width) line = trial;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      async (b) => {
        if (!b) return reject(new Error("Не удалось нарисовать страницу"));
        resolve(new Uint8Array(await b.arrayBuffer()));
      },
      "image/jpeg",
      0.6
    )
  );
}

export class TooManyPagesError extends Error {}

export async function renderDiaryPdf(entries: EpubEntry[], onProgress?: (page: number) => void): Promise<{ bytes: Uint8Array; pages: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = PW;
  canvas.height = PH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Холст недоступен");
  const pages: PdfPage[] = [];
  const width = PW - MARGIN * 2;
  let y = 0;
  let open = false;

  const newPage = () => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PW, PH);
    ctx.fillStyle = "#111111";
    ctx.textBaseline = "alphabetic";
    y = MARGIN + LINE;
    open = true;
  };
  const closePage = async () => {
    if (!open) return;
    ctx.font = `20px ${FONT}`;
    ctx.fillStyle = "#888888";
    ctx.textAlign = "center";
    ctx.fillText(String(pages.length + 1), PW / 2, PH - 40);
    ctx.textAlign = "left";
    pages.push({ w: PW, h: PH, jpeg: await canvasToJpeg(canvas) });
    open = false;
    onProgress?.(pages.length);
    if (pages.length > MAX_PAGES) throw new TooManyPagesError();
  };
  const need = async (h: number) => {
    if (!open) newPage();
    if (y + h > PH - MARGIN) {
      await closePage();
      newPage();
    }
  };

  // Титульная страница
  newPage();
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillText("Мой дневник", MARGIN, PH / 3);
  ctx.font = `28px ${FONT}`;
  ctx.fillStyle = "#555555";
  const first = entries.length ? entries.reduce((a, e) => (e.createdAt < a ? e.createdAt : a), entries[0].createdAt) : null;
  const last = entries.length ? entries.reduce((a, e) => (e.createdAt > a ? e.createdAt : a), entries[0].createdAt) : null;
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillText(first && last ? `${fmt(first)} — ${fmt(last)}` : "Записей пока нет", MARGIN, PH / 3 + 60);
  ctx.fillText(`Записей: ${entries.length}`, MARGIN, PH / 3 + 104);
  await closePage();

  for (const b of toBlocks(entries)) {
    if (b.kind === "month") {
      await closePage(); // каждый месяц с новой страницы
      newPage();
      ctx.font = `bold 40px ${FONT}`;
      ctx.fillStyle = "#111111";
      ctx.fillText(b.text, MARGIN, y);
      y += 64;
    } else if (b.kind === "date") {
      await need(LINE * 3 + 20); // заголовок не остаётся один внизу страницы
      y += 14;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillStyle = "#666666";
      ctx.fillText(b.text, MARGIN, y);
      y += LINE;
    } else {
      ctx.font = `${BODY}px ${FONT}`;
      ctx.fillStyle = "#111111";
      for (const line of wrap(ctx, b.text, width)) {
        await need(LINE);
        // шрифт мог сброситься при смене страницы
        ctx.font = `${BODY}px ${FONT}`;
        ctx.fillStyle = "#111111";
        ctx.fillText(line, MARGIN, y);
        y += LINE;
      }
      y += 6;
    }
  }
  await closePage();
  return { bytes: buildPdf(pages), pages: pages.length };
}

export type PdfPeriod = "all" | "365" | "90";

export async function buildDiaryPdf(includePrivate: boolean, period: PdfPeriod, onProgress?: (page: number) => void) {
  await ready();
  const rows = (await prisma.journalEntry.findMany({ orderBy: { createdAt: "asc" } })) as Array<{ createdAt: Date | string; content: string; isPrivate?: boolean }>;
  const since = period === "all" ? 0 : Date.now() - Number(period) * 86_400_000;
  const entries = rows
    .filter((r) => (includePrivate || !r.isPrivate) && new Date(r.createdAt).getTime() >= since)
    .map((r) => ({ createdAt: new Date(r.createdAt), content: String(r.content ?? ""), isPrivate: !!r.isPrivate }));
  const res = await renderDiaryPdf(entries, onProgress);
  return { ...res, count: entries.length };
}
