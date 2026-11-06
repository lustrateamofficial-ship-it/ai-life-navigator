// Значки приложения: компас на бирюзовом фоне. Нужен sharp (только при подготовке значков).
const sharp = require("sharp");
const path = require("path");
const out = (n) => path.join(__dirname, "../public", n);
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0e7c7b"/>
<g transform="translate(256 256) scale(${pad}) translate(-256 -256)"><circle cx="256" cy="256" r="150" fill="none" stroke="#fff" stroke-width="22"/>
<path d="M256 120l44 136-44 136-44-136z" fill="#fff" transform="rotate(35 256 256)"/><circle cx="256" cy="256" r="16" fill="#0e7c7b"/></g></svg>`;
(async () => {
  await sharp(Buffer.from(svg(1))).resize(192, 192).png().toFile(out("icon-192.png"));
  await sharp(Buffer.from(svg(1))).resize(512, 512).png().toFile(out("icon-512.png"));
  await sharp(Buffer.from(svg(0.78))).resize(512, 512).png().toFile(out("icon-maskable-512.png"));
  console.log("значки готовы");
})();
