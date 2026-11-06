// Экспорт дневника в книгу EPUB: читается в любой читалке (Google Play Книги, Librera, Moon+ Reader и т. д.).
// Книга собирается на телефоне, без сервера: внутри обычный ZIP без сжатия, как требует формат.
import { prisma } from "./prisma";
import { ready } from "./server";

const enc = new TextEncoder();

function crcTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const TABLE = crcTable();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ZIP без сжатия. Первым должен идти файл mimetype, поэтому порядок записей сохраняется.
export function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = (1 << 5) | 1; // 1980-01-01
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // имена в UTF-8
    lh.setUint16(8, 0, true); // без сжатия
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface EpubEntry {
  createdAt: Date;
  content: string;
  isPrivate?: boolean;
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const XHTML_HEAD = '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru" lang="ru">\n';

// Собирает книгу: по одной главе на месяц, внутри записи по датам.
export function buildEpub(entries: EpubEntry[], opts: { title?: string; id?: string; now?: Date } = {}): Uint8Array {
  const title = opts.title ?? "Мой дневник";
  const now = opts.now ?? new Date();
  const id = opts.id ?? `urn:uuid:${crypto.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000"}`;
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const byMonth = new Map<string, EpubEntry[]>();
  for (const e of sorted) {
    const k = `${e.createdAt.getFullYear()}-${String(e.createdAt.getMonth() + 1).padStart(2, "0")}`;
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(e);
  }

  const chapters: Array<{ file: string; title: string; xhtml: string }> = [];
  let n = 0;
  for (const [k, list] of byMonth) {
    n++;
    const [y, m] = k.split("-").map(Number);
    const ctitle = `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
    let body = `<h1>${esc(ctitle)}</h1>\n`;
    for (const e of list) {
      const d = e.createdAt;
      const date = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
      const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      body += `<h2>${esc(date)}, ${time}${e.isPrivate ? " · личная" : ""}</h2>\n`;
      for (const line of e.content.split(/\n+/)) if (line.trim()) body += `<p>${esc(line.trim())}</p>\n`;
    }
    chapters.push({
      file: `ch${String(n).padStart(3, "0")}.xhtml`,
      title: ctitle,
      xhtml: `${XHTML_HEAD}<head><meta charset="utf-8"/><title>${esc(ctitle)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n${body}</body>\n</html>\n`,
    });
  }
  if (chapters.length === 0) {
    chapters.push({
      file: "ch001.xhtml",
      title: "Пока пусто",
      xhtml: `${XHTML_HEAD}<head><meta charset="utf-8"/><title>Пока пусто</title></head>\n<body><h1>Пока пусто</h1><p>В дневнике ещё нет записей.</p></body>\n</html>\n`,
    });
  }

  const nav =
    `${XHTML_HEAD}<head><meta charset="utf-8"/><title>${esc(title)}</title></head>\n<body>\n<nav epub:type="toc" id="toc"><h1>Оглавление</h1>\n<ol>\n` +
    chapters.map((c) => `<li><a href="${c.file}">${esc(c.title)}</a></li>`).join("\n") +
    `\n</ol></nav>\n</body>\n</html>\n`;

  const opf =
    `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ru">\n` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="bookid">${esc(id)}</dc:identifier>\n<dc:title>${esc(title)}</dc:title>\n<dc:language>ru</dc:language>\n` +
    `<meta property="dcterms:modified">${now.toISOString().replace(/\.\d+Z$/, "Z")}</meta>\n</metadata>\n<manifest>\n` +
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n<item id="css" href="style.css" media-type="text/css"/>\n` +
    chapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join("\n") +
    `\n</manifest>\n<spine>\n` +
    chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join("\n") +
    `\n</spine>\n</package>\n`;

  const css = "body{font-family:serif;line-height:1.5;margin:1em}h1{font-size:1.5em;margin:1em 0 .6em}h2{font-size:1em;margin:1.4em 0 .3em;color:#555}p{margin:.4em 0;text-indent:0}\n";
  const container =
    '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n';

  return zipStore([
    { name: "mimetype", data: enc.encode("application/epub+zip") },
    { name: "META-INF/container.xml", data: enc.encode(container) },
    { name: "OEBPS/content.opf", data: enc.encode(opf) },
    { name: "OEBPS/nav.xhtml", data: enc.encode(nav) },
    { name: "OEBPS/style.css", data: enc.encode(css) },
    ...chapters.map((c) => ({ name: `OEBPS/${c.file}`, data: enc.encode(c.xhtml) })),
  ]);
}

// Все записи дневника с телефона. Личные включаются только если человек сам это выбрал.
export async function buildDiaryEpub(includePrivate: boolean): Promise<{ bytes: Uint8Array; count: number }> {
  await ready();
  const rows = (await prisma.journalEntry.findMany({ orderBy: { createdAt: "asc" } })) as Array<{ createdAt: Date | string; content: string; isPrivate?: boolean }>;
  const entries = rows
    .filter((r) => includePrivate || !r.isPrivate)
    .map((r) => ({ createdAt: new Date(r.createdAt), content: String(r.content ?? ""), isPrivate: !!r.isPrivate }));
  return { bytes: buildEpub(entries), count: entries.length };
}
