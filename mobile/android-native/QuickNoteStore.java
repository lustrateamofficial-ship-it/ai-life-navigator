package app.navigator.zhizni;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

// Очередь быстрых записей, сделанных вне приложения (из шторки или с виджета).
// Хранится в памяти телефона и не зависит от интернета. Приложение забирает записи при открытии.
final class QuickNoteStore {
    private static final String PREFS = "navigator_native";
    private static final String QUEUE = "queue";
    private static final String SHADE = "shade";
    private static final Object LOCK = new Object();

    private QuickNoteStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void add(Context ctx, String text) {
        if (text == null) return;
        String t = text.trim();
        if (t.isEmpty()) return;
        if (t.length() > 20000) t = t.substring(0, 20000);
        synchronized (LOCK) {
            try {
                SharedPreferences p = prefs(ctx);
                JSONArray arr = new JSONArray(p.getString(QUEUE, "[]"));
                JSONObject o = new JSONObject();
                o.put("text", t);
                o.put("ts", System.currentTimeMillis());
                arr.put(o);
                // commit, а не apply: запись должна дойти до диска, даже если система сразу закроет процесс
                p.edit().putString(QUEUE, arr.toString()).commit();
            } catch (Exception ignored) {
            }
        }
    }

    // Забирает все записи и очищает очередь.
    static JSONArray drain(Context ctx) {
        synchronized (LOCK) {
            try {
                SharedPreferences p = prefs(ctx);
                JSONArray arr = new JSONArray(p.getString(QUEUE, "[]"));
                p.edit().putString(QUEUE, "[]").commit();
                return arr;
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    // Вернуть записи в очередь, если приложение не смогло их сохранить.
    static void putBack(Context ctx, JSONArray items) {
        synchronized (LOCK) {
            try {
                SharedPreferences p = prefs(ctx);
                JSONArray arr = new JSONArray(p.getString(QUEUE, "[]"));
                for (int i = 0; i < items.length(); i++) arr.put(items.get(i));
                p.edit().putString(QUEUE, arr.toString()).commit();
            } catch (Exception ignored) {
            }
        }
    }

    static boolean shadeEnabled(Context ctx) {
        return prefs(ctx).getBoolean(SHADE, false);
    }

    static void setShade(Context ctx, boolean on) {
        prefs(ctx).edit().putBoolean(SHADE, on).commit();
    }

    static String get(Context ctx, String key) {
        return prefs(ctx).getString(key, null);
    }

    static void put(Context ctx, String key, String value) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (value == null) e.remove(key);
        else e.putString(key, value);
        e.commit();
    }
}
