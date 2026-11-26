// Пустая замена серверных модулей, которые на телефоне не нужны (Node: zlib, Prisma Client).
export default {};
export const gzipSync = () => {
  throw new Error("Сжатие копий на телефоне не используется");
};
