package app.navigator.zhizni;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

// Виджет на главном экране: нажал, написал, готово. Второе нажатие открывает приложение.
public class QuickNoteWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        int imm = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent write = PendingIntent.getActivity(context, 10, new Intent(context, QuickNoteActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | imm);
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent open = launch == null ? write : PendingIntent.getActivity(context, 11, launch, PendingIntent.FLAG_UPDATE_CURRENT | imm);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_quick);
            v.setOnClickPendingIntent(R.id.widget_write, write);
            v.setOnClickPendingIntent(R.id.widget_open, open);
            manager.updateAppWidget(id, v);
        }
    }
}
