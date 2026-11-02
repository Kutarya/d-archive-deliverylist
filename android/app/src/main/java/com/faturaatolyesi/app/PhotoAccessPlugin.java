package com.faturaatolyesi.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.FileUtils;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@CapacitorPlugin(name="PhotoAccess")
public class PhotoAccessPlugin extends Plugin {
    private static final long MAX_BYTES = 35L * 1024 * 1024;
    private String pickingCallId;

    @PluginMethod public void pickFiles(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pickingCallId != null) { call.reject("A photo picker is already open.", "PHOTO_PICKER_BUSY"); return; }
            try {
                boolean multiple = call.getBoolean("multiple", true);
                Intent intent;
                if ("gallery".equals(call.getString("source"))) {
                    PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                        .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build();
                    // AndroidX falls back to ACTION_OPEN_DOCUMENT on older devices.
                    intent = multiple
                        ? new ActivityResultContracts.PickMultipleVisualMedia(20).createIntent(getContext(), request)
                        : new ActivityResultContracts.PickVisualMedia().createIntent(getContext(), request);
                } else {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, call.getBoolean("allowPdf", true)
                        ? new String[]{"image/jpeg", "image/png", "image/webp", "application/pdf"}
                        : new String[]{"image/jpeg", "image/png", "image/webp"});
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
                }
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                pickingCallId = call.getCallbackId();
                startActivityForResult(call, intent, "filesSelected");
            } catch (ActivityNotFoundException e) {
                pickingCallId = null;
                call.reject("No photo or file picker is available on this device.", "PHOTO_PICKER_UNAVAILABLE", e);
            } catch (SecurityException e) {
                pickingCallId = null;
                call.reject("Access to the selected photo was denied.", "PHOTO_PERMISSION_DENIED", e);
            } catch (Exception e) {
                pickingCallId = null;
                call.reject("Could not open the photo picker. Please try again.", "PHOTO_PICKER_FAILED", e);
            }
        });
    }

    @ActivityCallback private void filesSelected(PluginCall call, ActivityResult result) {
        pickingCallId = null;
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            JSObject out = new JSObject(); out.put("cancelled", true); out.put("files", new JSArray()); call.resolve(out); return;
        }
        try {
            Intent data = result.getData();
            LinkedHashSet<Uri> uris = new LinkedHashSet<>();
            if (data != null) {
                if (data.getClipData() != null) {
                    for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                        Uri uri = data.getClipData().getItemAt(i).getUri(); if (uri != null) uris.add(uri);
                    }
                }
                if (data.getData() != null) uris.add(data.getData());
            }
            if (uris.isEmpty()) { call.reject("Could not read the selected files. Please select them again.", "PHOTO_READ_FAILED"); return; }
            if (uris.size() > (call.getBoolean("multiple", true) ? 20 : 1)) {
                call.reject("Select up to 20 photos at a time.", "PHOTO_SELECTION_LIMIT"); return;
            }
            getBridge().execute(() -> copySelection(call, uris));
        } catch (Exception e) {
            call.reject("Could not read the selected files. Please select them again.", "PHOTO_READ_FAILED", e);
        }
    }

    private File selectionDirectory() { return new File(getContext().getCacheDir(), "photo-selections"); }

    private void copySelection(PluginCall call, Iterable<Uri> uris) {
        List<File> staged = new ArrayList<>();
        try {
            File folder = selectionDirectory();
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Could not create photo cache");
            JSArray files = new JSArray();
            for (Uri uri : uris) {
                String mime = getContext().getContentResolver().getType(uri);
                if (mime == null) mime = "application/octet-stream";
                String name = mime.equals("application/pdf") ? "document.pdf" : "photo.jpg";
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
                }
                File file = File.createTempFile("selected-", ".bin", folder); staged.add(file);
                long size = 0;
                // Copy original bytes without decoding a full camera bitmap or passing base64 over the bridge.
                try (InputStream input = getContext().getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(file)) {
                    if (input == null) throw new IOException("No readable photo stream");
                    byte[] buffer = new byte[32768]; int length;
                    while ((length = input.read(buffer)) != -1) {
                        size += length;
                        if (size > MAX_BYTES) throw new PhotoTooLargeException();
                        output.write(buffer, 0, length);
                    }
                }
                JSObject item = new JSObject(); item.put("name", name); item.put("mime", mime); item.put("size", size);
                item.put("path", file.getAbsolutePath());
                item.put("webPath", FileUtils.getPortablePath(getContext(), getBridge().getLocalUrl(), Uri.fromFile(file)));
                files.put(item);
            }
            JSObject out = new JSObject(); out.put("files", files); call.resolve(out);
        } catch (SecurityException e) {
            for (File file : staged) file.delete();
            call.reject("Access to the selected photo was denied.", "PHOTO_PERMISSION_DENIED", e);
        } catch (PhotoTooLargeException e) {
            for (File file : staged) file.delete();
            call.reject("The photo exceeds the 35 MB limit.", "PHOTO_TOO_LARGE", e);
        } catch (Exception e) {
            for (File file : staged) file.delete();
            call.reject("Could not read the selected files. Please select them again.", "PHOTO_READ_FAILED", e);
        }
    }

    @PluginMethod public void releaseFiles(PluginCall call) {
        try {
            File folder = selectionDirectory().getCanonicalFile();
            JSArray paths = call.getArray("paths", new JSArray());
            for (int i = 0; i < paths.length(); i++) {
                File file = new File(paths.getString(i)).getCanonicalFile();
                if (folder.equals(file.getParentFile()) && file.getName().startsWith("selected-")) file.delete();
            }
            call.resolve();
        } catch (Exception e) { call.reject("Could not clear temporary photos.", e); }
    }

    @PluginMethod public void openSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent); call.resolve();
            } catch (Exception e) { call.reject("Could not open app settings. Open Settings on your device and allow access for Invoice Atelier.", e); }
        });
    }

    private static class PhotoTooLargeException extends IOException {}
}
