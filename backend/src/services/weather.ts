import { env } from "../config/env.js";

// Погода для утреннего дайджеста (раздел 32 ТЗ упоминает погоду в дайджесте;
// WEATHER_API_KEY/WEATHER_DEFAULT_CITY существовали в .env.example с самого начала,
// но сама функция реализована не была).
//
// Используется OpenWeatherMap (openweathermap.org/current) — сырой REST-вызов без SDK,
// по той же причине, что и для Google Drive (services/googleDrive.ts): пакет ради одного
// эндпоинта не нужен. Бесплатный тариф: 1000 вызовов/день, этого с огромным запасом
// хватает на один вызов в день на пользователя.
//
// lang=ru у OpenWeatherMap отдаёт уже готовое описание погоды по-русски ("ясно",
// "облачно с прояснениями" и т.п.) — не нужно переводить самим и держать свой словарь.

export interface WeatherSnapshot {
  tempC: number;
  feelsLikeC: number;
  description: string; // уже по-русски, от самого API (lang=ru)
  city: string;
}

export function isWeatherConfigured(): boolean {
  return Boolean(env.weatherApiKey);
}

// Деградация по умолчанию — раздел 48 ("Graceful degradation"): без ключа или при
// любом сбое сети/API просто возвращаем null, а вызывающая сторона (digest.ts) тихо
// пропускает строку с погодой в дайджесте — ни ошибки пользователю, ни "N/A" на
// английском, ни краша всего дайджеста из-за одной недоступной внешней погоды.
export async function fetchWeather(city: string): Promise<WeatherSnapshot | null> {
  if (!isWeatherConfigured() || !city.trim()) return null;

  try {
    const params = new URLSearchParams({
      q: city,
      appid: env.weatherApiKey,
      units: "metric",
      lang: "ru",
    });
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`, {
      // Погода — это "приятно, но не критично": дайджест не должен зависать на
      // медленном стороннем API дольше пары секунд.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[weather] API вернул ${res.status} для города "${city}"`);
      return null;
    }
    const data = (await res.json()) as {
      main?: { temp?: number; feels_like?: number };
      weather?: { description?: string }[];
      name?: string;
    };
    if (typeof data.main?.temp !== "number") return null;

    return {
      tempC: Math.round(data.main.temp),
      feelsLikeC: Math.round(data.main.feels_like ?? data.main.temp),
      description: data.weather?.[0]?.description ?? "",
      city: data.name ?? city,
    };
  } catch (err) {
    console.warn(`[weather] не удалось получить погоду для "${city}":`, err instanceof Error ? err.message : err);
    return null;
  }
}
