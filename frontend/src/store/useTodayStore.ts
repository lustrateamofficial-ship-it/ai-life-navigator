import { create } from "zustand";
import { api } from "../api/client";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
}

interface DirectionScore {
  overall: number;
  goalsScore: number;
  healthScore: number;
  financeScore: number;
  habitsScore: number;
  timeScore: number;
}

interface TodayState {
  tasks: Task[];
  currentWeight: number | null;
  score: DirectionScore | null;
  driftMessage: string | null;
  loading: boolean;
  fetchToday: () => Promise<void>;
  toggleTask: (id: string, done: boolean) => Promise<void>;
}

export const useTodayStore = create<TodayState>((set, get) => ({
  tasks: [],
  currentWeight: null,
  score: null,
  driftMessage: null,
  loading: false,

  fetchToday: async () => {
    set({ loading: true });
    try {
      const [tasks, weight, analytics] = await Promise.all([
        api.get<Task[]>("/tasks?range=today"),
        api.get<{ current: number | null }>("/health/weight"),
        api.get<{ score: DirectionScore; drift: { driftDetected: boolean; message: string | null } }>(
          "/analytics"
        ),
      ]);
      set({
        tasks,
        currentWeight: weight.current,
        score: analytics.score,
        driftMessage: analytics.drift.driftDetected ? analytics.drift.message : null,
      });
    } finally {
      set({ loading: false });
    }
  },

  toggleTask: async (id, done) => {
    await api.put(`/tasks/${id}`, { status: done ? "done" : "todo" });
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, status: done ? "done" : "todo" } : t)) });
  },
}));
