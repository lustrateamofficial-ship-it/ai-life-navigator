// Маленькая замена zustand: хранилище состояния с подпиской для React.
import { useSyncExternalStore } from "react";

export function create<T>(init: (set: (p: Partial<T> | ((s: T) => Partial<T>)) => void, get: () => T) => T) {
  let state: T;
  const listeners = new Set<() => void>();
  const set = (p: Partial<T> | ((s: T) => Partial<T>)) => {
    const patch = typeof p === "function" ? (p as any)(state) : p;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const get = () => state;
  state = init(set, get);
  function useStore(): T;
  function useStore<U>(selector: (s: T) => U): U;
  function useStore(selector?: (s: T) => any) {
    return useSyncExternalStore(
      (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => (selector ? selector(state) : state)
    );
  }
  return useStore;
}
