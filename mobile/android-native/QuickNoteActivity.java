package app.navigator.zhizni;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

// Маленькое окно быстрой записи, открывается с виджета. Работает без интернета и без запуска всего приложения.
public class QuickNoteActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Быстрая запись");

        final float d = getResources().getDisplayMetrics().density;
        int pad = (int) (16 * d);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("Что на уме?");
        title.setTextSize(18);
        root.addView(title);

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setMinLines(3);
        input.setMaxLines(8);
        input.setGravity(Gravity.TOP | Gravity.START);
        input.setHint("Одна строка тоже запись");
        root.addView(input, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.END);
        Button cancel = new Button(this);
        cancel.setText("Отмена");
        cancel.setOnClickListener(v -> finish());
        Button save = new Button(this);
        save.setText("Записать");
        save.setOnClickListener(v -> {
            String t = input.getText().toString();
            if (t.trim().isEmpty()) {
                Toast.makeText(this, "Напиши хотя бы слово", Toast.LENGTH_SHORT).show();
                return;
            }
            QuickNoteStore.add(this, t);
            Toast.makeText(this, "Записано", Toast.LENGTH_SHORT).show();
            finish();
        });
        row.addView(cancel);
        row.addView(save);
        root.addView(row);

        setContentView(root);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        input.requestFocus();
    }
}
