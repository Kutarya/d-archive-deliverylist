package com.faturaatolyesi.app;

import static org.junit.Assert.*;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PhotoAccessTest {
    private static class RecordingCall extends PluginCall {
        JSObject result; String code;
        RecordingCall(JSObject data) { super(null,"PhotoAccess","qa","pickFiles",data); }
        @Override public void resolve(JSObject data) { result=data; }
        @Override public void resolve() { result=new JSObject(); }
        @Override public void reject(String message,String errorCode,Exception cause,JSObject data) { code=errorCode; }
    }
    private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final PhotoAccessPlugin plugin=new PhotoAccessPlugin(){@Override public Context getContext(){return context;}};
    private void result(RecordingCall call,ActivityResult result)throws Exception{
        Method method=PhotoAccessPlugin.class.getDeclaredMethod("filesSelected",PluginCall.class,ActivityResult.class);method.setAccessible(true);method.invoke(plugin,call,result);
    }
    @Test public void cancellingWithoutAnIntentReturnsQuietly()throws Exception{
        RecordingCall call=new RecordingCall(new JSObject());result(call,new ActivityResult(Activity.RESULT_CANCELED,null));
        assertNull(call.code);assertTrue(call.result.getBoolean("cancelled"));assertEquals(0,call.result.getJSONArray("files").length());
    }
    @Test public void successfulButEmptyPickerResultRejectsWithoutCrashing()throws Exception{
        for(Intent intent:new Intent[]{null,new Intent()}){RecordingCall call=new RecordingCall(new JSObject());result(call,new ActivityResult(Activity.RESULT_OK,intent));assertEquals("PHOTO_READ_FAILED",call.code);}
    }
    @Test public void nonUriClipDataRejectsWithoutCrashing()throws Exception{
        RecordingCall call=new RecordingCall(new JSObject());Intent intent=new Intent();intent.setClipData(ClipData.newPlainText("empty","no photo"));
        result(call,new ActivityResult(Activity.RESULT_OK,intent));assertEquals("PHOTO_READ_FAILED",call.code);
    }
    @Test public void singleAndMultipleSelectionLimitsAreCheckedBeforeReading()throws Exception{
        for(int limit:new int[]{1,20}){
            JSObject options=new JSObject();options.put("multiple",limit>1);RecordingCall call=new RecordingCall(options);
            ClipData clips=new ClipData("photos",new String[]{"image/png"},new ClipData.Item(Uri.parse("content://qa/photo/0")));
            for(int n=1;n<=limit;n++)clips.addItem(new ClipData.Item(Uri.parse("content://qa/photo/"+n)));
            Intent intent=new Intent();intent.setClipData(clips);result(call,new ActivityResult(Activity.RESULT_OK,intent));assertEquals("PHOTO_SELECTION_LIMIT",call.code);
        }
    }
    @Test public void restoredResultWithoutACallerDoesNotCrash()throws Exception{result(null,new ActivityResult(Activity.RESULT_OK,null));}
    @Test public void deniedContentProviderAccessIsReportedWithoutCrashing()throws Exception{
        RecordingCall call=new RecordingCall(new JSObject());Method method=PhotoAccessPlugin.class.getDeclaredMethod("copySelection",PluginCall.class,Iterable.class);method.setAccessible(true);
        method.invoke(plugin,call,List.of(Uri.parse("content://com.android.contacts/contacts")));assertEquals("PHOTO_PERMISSION_DENIED",call.code);
    }
    @Test public void temporaryCleanupPreservesFilesOutsideTheSelectionDirectory()throws Exception{
        File original=File.createTempFile("qa-original-",".png",context.getCacheDir());
        try{JSObject options=new JSObject();options.put("paths",new com.getcapacitor.JSArray().put(original.getAbsolutePath()));RecordingCall call=new RecordingCall(options);plugin.releaseFiles(call);assertNotNull(call.result);assertTrue(original.isFile());}
        finally{original.delete();}
    }
}
