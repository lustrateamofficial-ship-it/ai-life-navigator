package app.navigator.zhizni;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(NavigatorNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
