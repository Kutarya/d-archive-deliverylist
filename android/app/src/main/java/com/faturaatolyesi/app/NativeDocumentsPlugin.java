package com.faturaatolyesi.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.AtomicFile;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name="NativeDocuments")
public class NativeDocumentsPlugin extends Plugin {
    private AtomicFile archive() { return new AtomicFile(new File(getContext().getFilesDir(),"archive-v1.json")); }
    @PluginMethod public void loadStore(PluginCall call) {
        getBridge().execute(() -> {
            try { JSObject result=new JSObject(); AtomicFile file=archive(); File base=file.getBaseFile();boolean recoverable=base.exists() || new File(base.getPath()+".bak").exists();result.put("data",recoverable?new String(file.readFully(),StandardCharsets.UTF_8):"");call.resolve(result); }
            catch(Exception e) { call.reject("Could not read the archive. Your data was preserved.",e); }
        });
    }
    @PluginMethod public void saveStore(PluginCall call) {
        final String data=call.getString("data","");
        getBridge().execute(() -> {
            AtomicFile file=archive();FileOutputStream stream=null;
            try {
                JSObject obj=new JSObject(data);if(obj.getInteger("version",0)!=1 || obj.optJSONArray("collections")==null || obj.optJSONArray("draft")==null)throw new Exception("Invalid archive");
                stream=file.startWrite();stream.write(data.getBytes(StandardCharsets.UTF_8));file.finishWrite(stream);call.resolve();
            } catch(Exception e) { if(stream!=null)file.failWrite(stream);call.reject("Could not save the archive.",e); }
        });
    }
    @PluginMethod public void recognize(PluginCall call) {
        getBridge().execute(() -> recognizePhoto(call));
    }
    private Bitmap enhancePhoto(Bitmap source) {
        float ratio=Math.min(1f,2000f/Math.max(source.getWidth(),source.getHeight()));
        Bitmap work=ratio<1?Bitmap.createScaledBitmap(source,Math.round(source.getWidth()*ratio),Math.round(source.getHeight()*ratio),true):source;
        int width=work.getWidth(),height=work.getHeight(),stride=width+1;
        int[] pixels=new int[width*height],integral=new int[(width+1)*(height+1)];
        work.getPixels(pixels,0,width,0,0,width,height);if(work!=source)work.recycle();
        for(int y=0;y<height;y++){
            int row=0;
            for(int x=0;x<width;x++){int color=pixels[y*width+x];row+=(((color>>16)&255)+((color>>8)&255)+(color&255))/3;integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}
        }
        for(int y=0;y<height;y++)for(int x=0;x<width;x++){
            int color=pixels[y*width+x],red=(color>>16)&255,green=(color>>8)&255,blue=color&255;
            int left=Math.max(0,x-25),right=Math.min(width,x+26),top=Math.max(0,y-25),bottom=Math.min(height,y+26);
            int mean=(integral[bottom*stride+right]-integral[bottom*stride+left]-integral[top*stride+right]+integral[top*stride+left])/((right-left)*(bottom-top));
            // A separate pass removes blue form lines and compensates for paper
            // shadows. The unchanged original reading remains a candidate too.
            int value=blue>red+12&&blue>green+3?255:Math.max(0,Math.min(255,255+(((red+green+blue)/3)-mean)*7));
            pixels[y*width+x]=0xff000000|(value<<16)|(value<<8)|value;
        }
        return Bitmap.createBitmap(pixels,width,height,Bitmap.Config.ARGB_8888);
    }
    private void recognizePhoto(PluginCall call) {
        Bitmap decoded=null;
        try {
            int rotation=call.getInt("rotation",0);
            if(rotation!=0 && rotation!=90 && rotation!=180 && rotation!=270){call.reject("Invalid photo rotation.");return;}
            String encoded=call.getString("image","");int comma=encoded.indexOf(',');
            byte[] bytes=Base64.decode(comma>=0?encoded.substring(comma+1):encoded,Base64.DEFAULT);
            BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
            BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);options.inJustDecodeBounds=false;options.inSampleSize=1;
            while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>3200)options.inSampleSize*=2;
            decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            if(decoded==null){call.reject("Could not read the photo.");return;}
            float coordinateScale=1;
            if(call.getBoolean("enhance",false)){Bitmap enhanced=enhancePhoto(decoded);coordinateScale=(float)decoded.getWidth()/enhanced.getWidth();decoded.recycle();decoded=enhanced;}
            final Bitmap bitmap=decoded;
            final float tokenScale=coordinateScale;
            TextRecognizer recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            recognizer.process(InputImage.fromBitmap(bitmap,rotation)).addOnSuccessListener(text -> {
                JSObject out=new JSObject();out.put("text",text.getText());JSArray tokens=new JSArray();float confidence=0;int count=0;double angleSin=0,angleCos=0;
                for(Text.TextBlock block:text.getTextBlocks())for(Text.Line line:block.getLines())for(Text.Element word:line.getElements()) {
                    Rect r=word.getBoundingBox();if(r==null)continue;JSObject token=new JSObject();token.put("text",word.getText());token.put("x",r.left*tokenScale);token.put("y",r.top*tokenScale);token.put("width",r.width()*tokenScale);token.put("height",r.height()*tokenScale);token.put("confidence",word.getConfidence()*100);tokens.put(token);confidence+=word.getConfidence();count++;
                    if(word.getText().length()>=3){double angle=Math.toRadians(word.getAngle());angleSin+=Math.sin(angle);angleCos+=Math.cos(angle);}
                }
                int correction=((int)Math.round(-Math.toDegrees(Math.atan2(angleSin,angleCos))/90)*90+360)%360;
                out.put("lines",tokens);out.put("confidence",count==0?0:confidence*100/count);out.put("suggestedRotation",correction);call.resolve(out);
            }).addOnFailureListener(e -> call.reject("Could not read the text. Try a clearer photo.",e))
              .addOnCompleteListener(task -> {recognizer.close();bitmap.recycle();});
        } catch(Exception e){if(decoded!=null&&!decoded.isRecycled())decoded.recycle();call.reject("Could not decode the photo.",e);}
    }
    @PluginMethod public void saveFile(PluginCall call) {
        String name=call.getString("name","document"),mime=call.getString("mime","application/octet-stream");
        if(call.getString("base64","").length()>250*1024*1024){call.reject("The file is too large.");return;}
        getBridge().execute(() -> {
            try {
                // Keep the payload on disk while Android's document picker is foreground.
                // A restored activity can finish the write even if Android reclaimed the WebView.
                try(FileOutputStream stream=new FileOutputStream(new File(getContext().getFilesDir(),"pending-export.bin"))) {
                    stream.write(Base64.decode(call.getString("base64",""),Base64.DEFAULT));stream.getFD().sync();
                }
                call.getData().remove("base64");
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(mime);intent.putExtra(Intent.EXTRA_TITLE,name);
                getActivity().runOnUiThread(() -> startActivityForResult(call,intent,"fileCreated"));
            }catch(Exception e){call.reject("Could not prepare the file.",e);}
        });
    }
    @ActivityCallback private void fileCreated(PluginCall call, ActivityResult result) {
        File pending=new File(getContext().getFilesDir(),"pending-export.bin");
        if(result.getResultCode()!=Activity.RESULT_OK || result.getData()==null || result.getData().getData()==null){pending.delete();JSObject out=new JSObject();out.put("cancelled",true);if(call!=null)call.resolve(out);return;}
        final android.net.Uri uri=result.getData().getData();
        getBridge().execute(() -> {
            try(OutputStream stream=getContext().getContentResolver().openOutputStream(uri,"wt");FileInputStream input=new FileInputStream(pending)) {
                if(stream==null)throw new Exception("Could not open the file");byte[] buffer=new byte[32768];int length;while((length=input.read(buffer))!=-1)stream.write(buffer,0,length);stream.flush();JSObject out=new JSObject();out.put("path",uri.toString());if(call!=null)call.resolve(out);pending.delete();
            }catch(Exception e){if(call!=null)call.reject("Could not save the file.",e);}
        });
    }
}
