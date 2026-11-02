package com.faturaatolyesi.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    private boolean recoveringRenderer;
    private boolean activityResumed;

    private void rebuildRendererWhenResumed() {
        if (!activityResumed || !recoveringRenderer) return;
        getWindow().getDecorView().post(() -> {
            if (activityResumed && !isFinishing() && !isDestroyed()) recreate();
        });
    }

    @Override public void onResume() {
        super.onResume();
        activityResumed = true;
        // Let the original native activity-result callback finish before replacing
        // its bridge. Recreating behind the picker can discard the pending result.
        rebuildRendererWhenResumed();
    }

    @Override public void onPause() {
        activityResumed = false;
        super.onPause();
    }
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeDocumentsPlugin.class);
        registerPlugin(PhotoAccessPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge != null) bridge.addWebViewListener(new WebViewListener() {
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (recoveringRenderer) return true;
                recoveringRenderer = true;
                // A renderer can be reclaimed while the native camera or file
                // picker is foreground. Handle it without killing the app process.
                if (view.getParent() instanceof ViewGroup) ((ViewGroup)view.getParent()).removeView(view);
                view.destroy();
                rebuildRendererWhenResumed();
                return true;
            }
        });
        getWindow().setStatusBarColor(android.graphics.Color.rgb(245,247,248));
        getWindow().setNavigationBarColor(android.graphics.Color.rgb(255,255,255));
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if(bridge==null || bridge.getWebView()==null){moveTaskToBack(true);return;}
                bridge.getWebView().evaluateJavascript(
                    "window.dispatchEvent(new Event('atelier:back',{cancelable:true}))",
                    result -> {if(!"false".equals(result) && !isFinishing() && !isDestroyed())moveTaskToBack(true);}
                );
            }
        });
    }
}
