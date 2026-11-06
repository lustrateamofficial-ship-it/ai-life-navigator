package app.navigator.zhizni;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Обновление приложения изнутри: скачать новый установочный файл и передать его системе Android.
// Android сам покажет окно «Обновить это приложение?» и поставит новую версию поверх старой, данные остаются.
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "update");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, "navigator.apk");
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("allowed", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Не удалось открыть настройки: " + e.getMessage());
        }
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String address = call.getString("url");
        if (address == null || !address.startsWith("https://")) {
            call.reject("Адрес обновления должен начинаться с https://");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            File tmp = new File(apkFile().getParentFile(), "navigator.apk.part");
            try {
                conn = (HttpURLConnection) new URL(address).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                int code = conn.getResponseCode();
                if (code != 200) {
                    call.reject("Сервер ответил " + code + ". Попробуй позже.");
                    return;
                }
                long total = conn.getContentLengthLong();
                long received = 0;
                long lastEmit = 0;
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[32768];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        received += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 150) {
                            lastEmit = now;
                            JSObject p = new JSObject();
                            p.put("received", received);
                            p.put("total", total);
                            notifyListeners("progress", p);
                        }
                    }
                }
                File dest = apkFile();
                if (dest.exists() && !dest.delete()) {
                    call.reject("Не удалось заменить старый файл обновления.");
                    return;
                }
                if (!tmp.renameTo(dest)) {
                    call.reject("Не удалось сохранить файл обновления.");
                    return;
                }
                JSObject p = new JSObject();
                p.put("received", received);
                p.put("total", total);
                notifyListeners("progress", p);
                JSObject r = new JSObject();
                r.put("size", received);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Не удалось скачать обновление: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                if (tmp.exists()) //noinspection ResultOfMethodCallIgnored
                    tmp.delete();
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            File f = apkFile();
            if (!f.exists()) {
                call.reject("Файл обновления не найден. Скачай его ещё раз.");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Не удалось запустить установку: " + e.getMessage());
        }
    }
}
