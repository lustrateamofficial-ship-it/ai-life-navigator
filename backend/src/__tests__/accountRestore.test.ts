import { describe, it, expect } from "vitest";
import { validateExportShape } from "../services/accountRestore.js";

// Полноценный round-trip тест (export → restore → сравнение) требует реальной БД
// (restoreUserExport оборачивает все операции в prisma.$transaction) — в этом
// окружении без доступа к Postgres такой тест писать бессмысленно, он либо не
// запустится вообще, либо будет мокать Prisma целиком, что проверяет мок, а не
// реальное поведение. Это честно задокументированное ограничение (см. README),
// а не забытый пункт. Здесь тестируется то, что действительно можно проверить без
// БД — валидацию формы файла, которая защищает restore от мусора ДО того, как он
// дойдёт до транзакции.
describe("validateExportShape", () => {
  it("принимает валидный объект экспорта с exportVersion", () => {
    expect(() => validateExportShape({ exportVersion: 1, exportedAt: "2026-01-01T00:00:00.000Z" })).not.toThrow();
  });

  it("принимает старые экспорты без поля exportVersion (появилось позже, по умолчанию версия 1)", () => {
    expect(() => validateExportShape({ exportedAt: "2026-01-01T00:00:00.000Z" })).not.toThrow();
  });

  it("отклоняет не-объект (строку, число, null)", () => {
    expect(() => validateExportShape("не json")).toThrow();
    expect(() => validateExportShape(42)).toThrow();
    expect(() => validateExportShape(null)).toThrow();
  });

  it("отклоняет массив", () => {
    expect(() => validateExportShape([1, 2, 3])).toThrow();
  });

  it("отклоняет объект без exportedAt — не похоже на файл экспорта приложения", () => {
    expect(() => validateExportShape({ profile: {} })).toThrow();
  });

  it("отклоняет неизвестную/будущую версию формата", () => {
    expect(() => validateExportShape({ exportVersion: 999, exportedAt: "2026-01-01T00:00:00.000Z" })).toThrow();
  });
});
