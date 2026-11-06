package app.navigator.zhizni;

import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

// Принимает текст из шторки и возвращает плашку на место после перезагрузки телефона или обновления приложения.
public class QuickNoteReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (QuickNoteNotifier.ACTION_REPLY.equals(action)) {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            CharSequence text = results == null ? null : results.getCharSequence(QuickNoteNotifier.KEY_TEXT);
            if (text != null && text.toString().trim().length() > 0) {
                QuickNoteStore.add(context, text.toString());
                try {
                    Toast.makeText(context, "Записано", Toast.LENGTH_SHORT).show();
                } catch (Exception ignored) {
                }
            }
            // Обновляем плашку: иначе под ней останется крутиться индикатор отправки
            if (QuickNoteStore.shadeEnabled(context)) QuickNoteNotifier.show(context);
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            if (QuickNoteStore.shadeEnabled(context)) QuickNoteNotifier.show(context);
        }
    }
}
