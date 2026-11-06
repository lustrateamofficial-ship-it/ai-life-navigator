package app.navigator.zhizni;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;

// Постоянная плашка в шторке уведомлений с полем «Записать»: набрал строку, и она уходит в очередь записей.
final class QuickNoteNotifier {
    static final String ACTION_REPLY = "app.navigator.zhizni.QUICK_REPLY";
    static final String KEY_TEXT = "note";
    private static final String CHANNEL = "quick_note";
    private static final int ID = 2_100_000_001;

    private QuickNoteNotifier() {}

    static void show(Context ctx) {
        // Поле ответа в уведомлениях появилось в Android 7 (API 24)
        if (Build.VERSION.SDK_INT < 24) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Быстрая запись", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Поле для записи мысли в шторке уведомлений");
            nm.createNotificationChannel(ch);
        }
        Intent reply = new Intent(ctx, QuickNoteReceiver.class).setAction(ACTION_REPLY);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent replyPi = PendingIntent.getBroadcast(ctx, 1, reply, flags);
        RemoteInput input = new RemoteInput.Builder(KEY_TEXT).setLabel("Что на уме?").build();
        Notification.Action action = new Notification.Action.Builder(
                Icon.createWithResource(ctx, android.R.drawable.ic_menu_edit), "Записать", replyPi)
                .addRemoteInput(input)
                .build();

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent openPi = open == null ? null
                : PendingIntent.getActivity(ctx, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(android.R.drawable.ic_menu_edit)
                .setContentTitle("Навигатор Жизни")
                .setContentText("Запиши мысль, не открывая приложение")
                .setOngoing(true)
                .setShowWhen(false)
                .addAction(action);
        if (openPi != null) b.setContentIntent(openPi);
        nm.notify(ID, b.build());
    }

    static void hide(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID);
    }
}
