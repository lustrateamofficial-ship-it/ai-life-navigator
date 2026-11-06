import { useEffect, useState } from "react";
import { readAppearance, type Appearance } from "../shim/appearance";

// Подписка на настройки внешнего вида: экраны перерисовываются сразу после переключения.
export function useAppearance(): Appearance {
  const [a, setA] = useState<Appearance>(readAppearance());
  useEffect(() => {
    const on = () => setA(readAppearance());
    window.addEventListener("navigator:appearance", on);
    return () => window.removeEventListener("navigator:appearance", on);
  }, []);
  return a;
}
