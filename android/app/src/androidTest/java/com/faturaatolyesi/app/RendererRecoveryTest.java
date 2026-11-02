package com.faturaatolyesi.app;

import static org.junit.Assert.*;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 29)
public class RendererRecoveryTest {
    @Test public void terminatingRendererRecreatesTheViewAndPreservesArchive() throws Exception {
        File archive = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(), "archive-v1.json");
        byte[] before = archive.exists() ? Files.readAllBytes(archive.toPath()) : null;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> previous = new AtomicReference<>();
            CountDownLatch ready = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript("1+1", result -> ready.countDown()));
            assertTrue("Initial renderer did not start", ready.await(20, TimeUnit.SECONDS));
            scenario.onActivity(activity -> {WebView view=activity.getBridge().getWebView();previous.set(view);assertNotNull(view.getWebViewRenderProcess());assertTrue(view.getWebViewRenderProcess().terminate());});
            AtomicBoolean recovered = new AtomicBoolean();
            long deadline = SystemClock.uptimeMillis()+30000;
            while (!recovered.get() && SystemClock.uptimeMillis()<deadline) {
                SystemClock.sleep(150);
                try {scenario.onActivity(activity -> {WebView view=activity.getBridge().getWebView();if(view!=previous.get())view.evaluateJavascript("Boolean(document.querySelector('main h1'))", result -> {if("true".equals(result))recovered.set(true);});});}
                catch (IllegalStateException ignored) { /* Activity is being recreated. */ }
            }
            assertTrue("The application did not recover its rendered screen", recovered.get());
            if (before != null) assertArrayEquals("Saved archive changed during renderer recovery",before,Files.readAllBytes(archive.toPath()));
        }
    }
}
