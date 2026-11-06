// Доводит проект Android после «cap add android»: права на уведомления и значки приложения.
// Запуск из папки mobile: node tools/android-prepare.cjs
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const androidDir = path.resolve(__dirname, "../android");
const manifestPath = path.join(androidDir, "app/src/main/AndroidManifest.xml");
const resDir = path.join(androidDir, "app/src/main/res");

let xml = fs.readFileSync(manifestPath, "utf8");
const perms = ["POST_NOTIFICATIONS", "SCHEDULE_EXACT_ALARM", "RECEIVE_BOOT_COMPLETED", "USE_BIOMETRIC", "REQUEST_INSTALL_PACKAGES"];
for (const p of perms) {
  const tag = `<uses-permission android:name="android.permission.${p}" />`;
  if (!xml.includes(`android.permission.${p}"`)) xml = xml.replace("</manifest>", `    ${tag}\n</manifest>`);
}
// Провайдер файлов нужен, чтобы передать скачанное обновление установщику Android.
if (!xml.includes("fileprovider")) {
  xml = xml.replace(
    "</application>",
    `    <provider android:name="androidx.core.content.FileProvider" android:authorities="\${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths" />
        </provider>
    </application>`
  );
}
// Быстрая запись: окно записи, приёмник ответов из шторки и виджет главного экрана.
if (!xml.includes("QuickNoteActivity")) {
  xml = xml.replace(
    "</application>",
    `    <activity android:name=".QuickNoteActivity" android:exported="false" android:label="Быстрая запись" android:theme="@android:style/Theme.DeviceDefault.Dialog" android:excludeFromRecents="true" android:taskAffinity="" android:windowSoftInputMode="stateVisible|adjustResize" />
        <receiver android:name=".QuickNoteReceiver" android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
        <receiver android:name=".QuickNoteWidget" android:exported="true" android:label="Навигатор: быстрая запись">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_info" />
        </receiver>
    </application>`
  );
}
fs.writeFileSync(manifestPath, xml);
fs.mkdirSync(path.join(resDir, "xml"), { recursive: true });
fs.writeFileSync(
  path.join(resDir, "xml/file_paths.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<paths>\n    <cache-path name="update_cache" path="." />\n    <files-path name="update_files" path="." />\n    <external-path name="external" path="." />\n</paths>\n`
);

// Ресурсы виджета быстрой записи.
fs.writeFileSync(
  path.join(resDir, "xml/widget_info.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"\n    android:minWidth="180dp" android:minHeight="56dp" android:targetCellWidth="3" android:targetCellHeight="1"\n    android:updatePeriodMillis="0" android:resizeMode="horizontal" android:widgetCategory="home_screen"\n    android:initialLayout="@layout/widget_quick" android:previewLayout="@layout/widget_quick" />\n`
);
fs.mkdirSync(path.join(resDir, "layout"), { recursive: true });
fs.writeFileSync(
  path.join(resDir, "layout/widget_quick.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"\n    android:layout_width="match_parent" android:layout_height="match_parent"\n    android:orientation="horizontal" android:gravity="center_vertical" android:padding="8dp"\n    android:background="@drawable/widget_bg">\n    <TextView android:id="@+id/widget_write" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1"\n        android:gravity="center_vertical" android:paddingStart="12dp" android:paddingEnd="8dp"\n        android:text="Записать мысль…" android:textColor="#FFFFFF" android:textSize="16sp" />\n    <TextView android:id="@+id/widget_open" android:layout_width="wrap_content" android:layout_height="match_parent"\n        android:gravity="center" android:paddingStart="12dp" android:paddingEnd="12dp"\n        android:text="Открыть" android:textColor="#B8C4D6" android:textSize="14sp" />\n</LinearLayout>\n`
);
fs.mkdirSync(path.join(resDir, "drawable"), { recursive: true });
fs.writeFileSync(
  path.join(resDir, "drawable/widget_bg.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n    <solid android:color="#E61F2A3A" />\n    <corners android:radius="20dp" />\n</shape>\n`
);

// Свой плагин установки обновлений и главный экран, который его регистрирует.
const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../capacitor.config.json"), "utf8"));
const javaDir = path.join(androidDir, "app/src/main/java", ...String(cfg.appId).split("."));
fs.mkdirSync(javaDir, { recursive: true });
for (const f of fs.readdirSync(path.resolve(__dirname, "../android-native")).filter((n) => n.endsWith(".java"))) fs.copyFileSync(path.resolve(__dirname, "../android-native", f), path.join(javaDir, f));

// Подпись постоянным ключом и растущий номер версии: без этого Android не ставит новую сборку поверх старой.
const gradlePath = path.join(androidDir, "app/build.gradle");
let gradle = fs.readFileSync(gradlePath, "utf8");
const keystore = path.resolve(__dirname, "../signing/navigator.jks");
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
const versionCode = parseInt(process.env.NAV_BUILD || "", 10) || Math.floor(Date.now() / 60000);
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
if (fs.existsSync(keystore)) {
  if (!gradle.includes("signingConfigs.navigator")) {
    gradle = gradle.replace(
      /android\s*\{/,
      `android {\n    signingConfigs {\n        navigator {\n            storeFile file("${keystore.replace(/\\/g, "/")}")\n            storePassword "navigator-release"\n            keyAlias "navigator"\n            keyPassword "navigator-release"\n        }\n    }`
    );
    gradle = gradle.replace(/buildTypes\s*\{/, "buildTypes {\n        debug { signingConfig signingConfigs.navigator }");
    gradle = gradle.replace(/release\s*\{/, "release {\n            signingConfig signingConfigs.navigator");
  }
  console.log(`Android: подпись постоянным ключом, versionCode ${versionCode}, versionName ${pkg.version}`);
} else {
  console.warn("ВНИМАНИЕ: нет файла signing/navigator.jks. Сборка получит случайную подпись, и Android не сможет поставить её поверх прежней версии без удаления (данные пропадут).");
}
fs.writeFileSync(gradlePath, gradle);

const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

(async () => {
  const plain = path.resolve(__dirname, "../public/icon-512.png");
  const maskable = path.resolve(__dirname, "../public/icon-maskable-512.png");
  for (const d of Object.keys(sizes)) {
    const dir = path.join(resDir, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(plain).resize(sizes[d]).toFile(path.join(dir, "ic_launcher.png"));
    await sharp(plain).resize(sizes[d]).toFile(path.join(dir, "ic_launcher_round.png"));
    await sharp(maskable).resize(fg[d]).toFile(path.join(dir, "ic_launcher_foreground.png"));
  }
  console.log("Android: права и значки готовы");
})();
