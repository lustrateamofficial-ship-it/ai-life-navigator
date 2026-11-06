package app.navigator.zhizni;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

// Мост между приложением и возможностями Android, которых нет в обычных плагинах:
// быстрые записи вне приложения, голосовой ввод и автоматическая копия данных в выбранную папку.
@CapacitorPlugin(name = "NavigatorNative")
public class NavigatorNativePlugin extends Plugin {
    private static final String KEY_FOLDER = "backup_folder";

    // ── Быстрые записи ──

    @PluginMethod
    public void drainNotes(PluginCall call) {
        JSObject r = new JSObject();
        try {
            r.put("notes", new JSArray(QuickNoteStore.drain(getContext()).toString()));
        } catch (Exception e) {
            r.put("notes", new JSArray());
        }
        call.resolve(r);
    }

    // Если приложение не смогло сохранить записи, их можно вернуть в очередь.
    @PluginMethod
    public void putBackNotes(PluginCall call) {
        try {
            JSArray notes = call.getArray("notes");
            if (notes != null) QuickNoteStore.putBack(getContext(), new JSONArray(notes.toString()));
            call.resolve();
        } catch (Exception e) {
            call.reject("Не удалось вернуть записи в очередь");
        }
    }

    @PluginMethod
    public void setQuickNotification(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        QuickNoteStore.setShade(getContext(), on);
        if (on) QuickNoteNotifier.show(getContext());
        else QuickNoteNotifier.hide(getContext());
        JSObject r = new JSObject();
        r.put("enabled", on);
        call.resolve(r);
    }

    @PluginMethod
    public void quickNotificationState(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", QuickNoteStore.shadeEnabled(getContext()));
        call.resolve(r);
    }

    // ── Голосовой ввод: системное окно распознавания речи, отдельное разрешение на микрофон не нужно ──

    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Говори, я запишу");
        try {
            startActivityForResult(call, i, "listenResult");
        } catch (ActivityNotFoundException e) {
            call.reject("unavailable");
        }
    }

    @ActivityCallback
    private void listenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        ArrayList<String> texts = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        JSObject r = new JSObject();
        r.put("text", texts != null && !texts.isEmpty() ? texts.get(0) : "");
        call.resolve(r);
    }

    // ── Автокопия: человек один раз выбирает папку (в том числе на Google Диске), дальше файлы пишутся сами ──

    @PluginMethod
    public void pickBackupFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        try {
            startActivityForResult(call, i, "folderResult");
        } catch (ActivityNotFoundException e) {
            call.reject("unavailable");
        }
    }

    @ActivityCallback
    private void folderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri tree = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) {
            call.reject("Не удалось запомнить папку: " + e.getMessage());
            return;
        }
        QuickNoteStore.put(getContext(), KEY_FOLDER, tree.toString());
        call.resolve(folderInfoObject());
    }

    private JSObject folderInfoObject() {
        JSObject r = new JSObject();
        String s = QuickNoteStore.get(getContext(), KEY_FOLDER);
        boolean ok = false;
        String name = "";
        if (s != null) {
            Uri tree = Uri.parse(s);
            try {
                for (android.content.UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
                    if (p.getUri().equals(tree) && p.isWritePermission()) ok = true;
                }
                Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                Cursor c = getContext().getContentResolver().query(doc, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null);
                if (c != null) {
                    try {
                        if (c.moveToFirst()) name = c.getString(0);
                    } finally {
                        c.close();
                    }
                }
            } catch (Exception ignored) {
            }
        }
        r.put("configured", s != null);
        r.put("ok", ok);
        r.put("name", name == null ? "" : name);
        return r;
    }

    @PluginMethod
    public void backupFolderInfo(PluginCall call) {
        call.resolve(folderInfoObject());
    }

    @PluginMethod
    public void forgetBackupFolder(PluginCall call) {
        String s = QuickNoteStore.get(getContext(), KEY_FOLDER);
        if (s != null) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(s),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Exception ignored) {
            }
        }
        QuickNoteStore.put(getContext(), KEY_FOLDER, null);
        call.resolve();
    }

    private Uri folderDocUri() {
        String s = QuickNoteStore.get(getContext(), KEY_FOLDER);
        if (s == null) return null;
        Uri tree = Uri.parse(s);
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    // Список файлов в папке: пары (id документа, имя).
    private List<String[]> listFiles(ContentResolver cr, Uri docUri) {
        List<String[]> out = new ArrayList<>();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(docUri, DocumentsContract.getDocumentId(docUri));
        Cursor c = cr.query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null);
        if (c == null) return out;
        try {
            while (c.moveToNext()) out.add(new String[]{c.getString(0), c.getString(1)});
        } finally {
            c.close();
        }
        return out;
    }

    // Записывает копию под этим именем. Если файл с таким именем уже есть (вторая копия за день), заменяет его.
    @PluginMethod
    public void writeBackup(PluginCall call) {
        final String name = call.getString("name");
        final String data = call.getString("data");
        if (name == null || data == null) {
            call.reject("Нет имени или данных");
            return;
        }
        Uri docUri = folderDocUri();
        if (docUri == null) {
            call.reject("Папка не выбрана");
            return;
        }
        ContentResolver cr = getContext().getContentResolver();
        try {
            Uri tree = Uri.parse(QuickNoteStore.get(getContext(), KEY_FOLDER));
            for (String[] f : listFiles(cr, docUri)) {
                if (name.equals(f[1])) {
                    try {
                        DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(tree, f[0]));
                    } catch (Exception ignored) {
                    }
                }
            }
            Uri created = DocumentsContract.createDocument(cr, docUri, "application/json", name);
            if (created == null) {
                call.reject("Папка не приняла файл");
                return;
            }
            OutputStream os = cr.openOutputStream(created, "wt");
            if (os == null) {
                call.reject("Не удалось открыть файл для записи");
                return;
            }
            try {
                os.write(data.getBytes(StandardCharsets.UTF_8));
                os.flush();
            } finally {
                os.close();
            }
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Не удалось записать копию: " + e.getMessage());
        }
    }

    // Оставляет только последние keep копий с этим началом имени: самые старые удаляются.
    @PluginMethod
    public void pruneBackups(PluginCall call) {
        String prefix = call.getString("prefix", "");
        int keep = call.getInt("keep", 7);
        Uri docUri = folderDocUri();
        if (docUri == null) {
            call.resolve();
            return;
        }
        try {
            ContentResolver cr = getContext().getContentResolver();
            Uri tree = Uri.parse(QuickNoteStore.get(getContext(), KEY_FOLDER));
            List<String[]> mine = new ArrayList<>();
            for (String[] f : listFiles(cr, docUri)) if (f[1] != null && f[1].startsWith(prefix) && f[1].endsWith(".json")) mine.add(f);
            // в имени стоит дата ГГГГ-ММ-ДД, поэтому по имени от нового к старому
            Collections.sort(mine, (a, b) -> b[1].compareTo(a[1]));
            int removed = 0;
            for (int i = Math.max(0, keep); i < mine.size(); i++) {
                try {
                    DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(tree, mine.get(i)[0]));
                    removed++;
                } catch (Exception ignored) {
                }
            }
            JSObject r = new JSObject();
            r.put("removed", removed);
            call.resolve(r);
        } catch (Exception e) {
            call.resolve();
        }
    }
}
