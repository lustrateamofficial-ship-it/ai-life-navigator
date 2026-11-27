// Значки приложения «Ego»: тёмный фон и слово «Ego» мятным цветом. Нужен sharp и шрифт Inter (иначе возьмётся любой жирный без засечек).
const sharp = require("sharp");
const path = require("path");
const out = (n) => path.join(__dirname, "../public", n);
// k: масштаб слова. Для «maskable» слово меньше, чтобы его не срезала круглая маска Android.
const svg = (k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0f1a17"/>
<text x="256" y="${256 + 62 * k}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="800" font-size="${200 * k}" letter-spacing="${-8 * k}" fill="#a8f0d0">Ego</text></svg>`;
(async () => {
  await sharp(Buffer.from(svg(1))).resize(192, 192).png().toFile(out("icon-192.png"));
  await sharp(Buffer.from(svg(1))).resize(512, 512).png().toFile(out("icon-512.png"));
  await sharp(Buffer.from(svg(0.78))).resize(512, 512).png().toFile(out("icon-maskable-512.png"));
  console.log("значки готовы");
})();
