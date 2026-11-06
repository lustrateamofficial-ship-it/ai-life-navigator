// Пустая замена серверных модулей, которые на телефоне не нужны.
export default {};
export const Sentry = {};
export const gzipSync = () => {
  throw new Error("Сжатие копий на телефоне не используется");
};
export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const initSentry = () => {};
export const startScheduler = () => {};
