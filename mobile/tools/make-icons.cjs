// Значки приложения: чёрный фон и знак «Выход» (кольцо с разрывом, через него выходит стрелка). Нужен sharp.
const sharp = require("sharp");
const path = require("path");
const out = (n) => path.join(__dirname, "../public", n);
const MARK = `<path d="M56 31.2 A24 24 0 1 1 32.8 8" /><path d="M28 36 L54 10 M42 10 H54 V22" />`;
const svg = (k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0a0a0a"/>
<g transform="translate(256 256) scale(${6.4 * k}) translate(-32 -32)" fill="none" stroke="#fafafa" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${MARK}</g></svg>`;
(async () => {
  await sharp(Buffer.from(svg(1))).resize(192, 192).png().toFile(out("icon-192.png"));
  await sharp(Buffer.from(svg(1))).resize(512, 512).png().toFile(out("icon-512.png"));
  await sharp(Buffer.from(svg(0.78))).resize(512, 512).png().toFile(out("icon-maskable-512.png"));
  console.log("значки готовы");
})();
