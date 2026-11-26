import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { finishIntro, introActive, introSteps, type IntroSteps } from "../../phone/intro";
import { toast } from "../../phone/feedback";

const STEPS: Array<{ key: keyof IntroSteps; title: string; hint: string; to: string }> = [
  { key: "write", title: "Сделай первую запись", hint: "Одна мысль или событие дня", to: "/?write=1" },
  { key: "task", title: "Добавь задачу", hint: "Что нужно сделать в ближайшее время", to: "/plans?tab=tasks&add=1" },
  { key: "weight", title: "Запиши вес", hint: "И поставь цель, если хочешь", to: "/me?weigh=1" },
];

// Карточка «Знакомство»: три первых шага. Когда все сделаны, на экране «Сегодня» открываются остальные блоки.
export function IntroCard() {
  const navigate = useNavigate();
  const [active, setActive] = useState(introActive);
  const [steps, setSteps] = useState<IntroSteps | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    introSteps().then((s) => {
      if (!alive) return;
      setSteps(s);
      if (s.write && s.task && s.weight) {
        finishIntro();
        setActive(false);
        toast("Знакомство пройдено: открыты все блоки «Сегодня»");
      }
    });
    return () => {
      alive = false;
    };
  }, [active]);

  if (!active) return null;
  const done = steps ? Object.values(steps).filter(Boolean).length : 0;

  return (
    <div className="card intro-card">
      <div className="card-title">Знакомство: {done} из 3</div>
      <p className="small">Сначала только главное. Сделай три шага, и откроются остальные блоки экрана.</p>
      <div className="intro-steps">
        {STEPS.map((s) => {
          const ok = !!steps?.[s.key];
          return (
            <button key={s.key} className={`intro-step ${ok ? "ok" : ""}`} onClick={() => navigate(s.to)} aria-label={`${s.title}${ok ? ": сделано" : ""}`}>
              <span className="intro-mark" aria-hidden="true">
                {ok ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.500l4.500 4.500L19 7.500" />
                  </svg>
                ) : null}
              </span>
              <span className="intro-text">
                <b>{s.title}</b>
                <small>{s.hint}</small>
              </span>
            </button>
          );
        })}
      </div>
      <button
        className="link-btn"
        onClick={() => {
          finishIntro();
          setActive(false);
        }}
      >
        Пропустить, покажи всё
      </button>
    </div>
  );
}
