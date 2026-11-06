// Разбирает backend/prisma/schema.prisma в schema.json — описание таблиц, связей и уникальных ключей,
// по которому лёгкая замена базы на телефоне понимает те же запросы, что и настоящий Prisma.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../../backend/prisma/schema.prisma", import.meta.url), "utf8");
const enums = {};
const models = {};

for (const m of src.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  enums[m[1]] = m[2].split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
}

for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const name = m[1];
  const fields = {};
  const uniques = [];
  for (let line of m[2].split("\n")) {
    line = line.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("@@unique")) {
      uniques.push(line.match(/\[([^\]]*)\]/)[1].split(",").map((s) => s.trim()));
      continue;
    }
    if (line.startsWith("@@")) continue;
    const parts = line.match(/^(\w+)\s+([\w]+)(\[\])?(\?)?\s*(.*)$/);
    if (!parts) continue;
    const [, fname, ftype, list, opt, rest] = parts;
    const f = { type: ftype, list: !!list, optional: !!opt };
    if (/@id\b/.test(rest)) f.id = true;
    if (/@unique\b/.test(rest)) uniques.push([fname]);
    if (/@updatedAt\b/.test(rest)) f.updatedAt = true;
    const d = rest.match(/@default\(((?:[^()]|\([^()]*\))*)\)/);
    if (d) {
      const v = d[1].trim();
      if (v === "uuid()") f.default = { kind: "uuid" };
      else if (v === "now()") f.default = { kind: "now" };
      else if (v === "true" || v === "false") f.default = { kind: "value", value: v === "true" };
      else if (/^-?\d+(\.\d+)?$/.test(v)) f.default = { kind: "value", value: Number(v) };
      else if (/^"/.test(v)) f.default = { kind: "value", value: v.replace(/"/g, "") };
      else f.default = { kind: "value", value: v }; // значение перечисления
    }
    const rel = rest.match(/@relation\(([^)]*)\)/);
    if (rel) {
      const fl = rel[1].match(/fields:\s*\[([^\]]*)\]/);
      const rf = rel[1].match(/references:\s*\[([^\]]*)\]/);
      const od = rel[1].match(/onDelete:\s*(\w+)/);
      f.relation = {
        fields: fl ? fl[1].split(",").map((s) => s.trim()) : [],
        references: rf ? rf[1].split(",").map((s) => s.trim()) : [],
        onDelete: od ? od[1] : "Restrict",
      };
    }
    fields[fname] = f;
  }
  models[name] = { fields, uniques };
}
const isModel = (t) => t in models;
for (const [mn, m] of Object.entries(models)) {
  for (const [fn, f] of Object.entries(m.fields)) {
    f.isRelation = isModel(f.type);
    f.isEnum = f.type in enums;
  }
}
writeFileSync(new URL("../shim/schema.json", import.meta.url), JSON.stringify({ enums, models }));
console.log("моделей:", Object.keys(models).length, "перечислений:", Object.keys(enums).length);
