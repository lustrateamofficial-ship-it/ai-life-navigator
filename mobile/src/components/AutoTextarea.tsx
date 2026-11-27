import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

// Поле, которое растёт вместе с текстом: при правке видно всё написанное, а не одну строку и не полоску с прокруткой.
// Очень длинный текст упирается в 60% высоты экрана и дальше прокручивается внутри поля.
export function AutoTextarea({ value, minRows = 2, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea {...rest} ref={ref} rows={minRows} value={value} className={`auto-ta ${className ?? ""}`} />;
}
