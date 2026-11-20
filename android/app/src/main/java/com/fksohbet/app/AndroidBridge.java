package com.fksohbet.app;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/* JADX INFO: loaded from: classes.dex */
public class AndroidBridge {
    private final MainActivity act;

    AndroidBridge(MainActivity mainActivity) {
        this.act = mainActivity;
    }

    @JavascriptInterface
    public void setCallActive(final boolean z) {
        this.act.runOnUiThread(new Runnable() { // from class: com.fksohbet.app.AndroidBridge$$ExternalSyntheticLambda0
            @Override // java.lang.Runnable
            public final void run() {
                AndroidBridge.this.m2lambda$setCallActive$0$comfksohbetappAndroidBridge(z);
            }
        });
    }

    /* JADX INFO: renamed from: lambda$setCallActive$0$com-fksohbet-app-AndroidBridge, reason: not valid java name */
    /* synthetic */ void m2lambda$setCallActive$0$comfksohbetappAndroidBridge(boolean z) {
        try {
            if (z) {
                Intent intent = new Intent(this.act, (Class<?>) CallService.class);
                intent.setAction("com.fksohbet.app.CALL_START");
                if (Build.VERSION.SDK_INT >= 26) {
                    this.act.startForegroundService(intent);
                } else {
                    this.act.startService(intent);
                }
                return;
            }
            this.act.stopService(new Intent(this.act, (Class<?>) CallService.class));
        } catch (Exception e) {
        }
    }

    @JavascriptInterface
    public String version() {
        return "1.0.0 (Android)";
    }

    @JavascriptInterface
    public void toast(final String str) {
        this.act.runOnUiThread(new Runnable() { // from class: com.fksohbet.app.AndroidBridge$$ExternalSyntheticLambda2
            @Override // java.lang.Runnable
            public final void run() {
                AndroidBridge.this.m3lambda$toast$1$comfksohbetappAndroidBridge(str);
            }
        });
    }

    /* JADX INFO: renamed from: lambda$toast$1$com-fksohbet-app-AndroidBridge, reason: not valid java name */
    /* synthetic */ void m3lambda$toast$1$comfksohbetappAndroidBridge(String str) {
        try {
            Toast.makeText(this.act, str, 0).show();
        } catch (Exception e) {
        }
    }

    @JavascriptInterface
    public void saveFile(String str, String data, String mime) {
        final String str2 = data == null ? "" : data;
        final String str3 = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        final String strSanitize = sanitize(str);
        new Thread(new Runnable() { // from class: com.fksohbet.app.AndroidBridge$$ExternalSyntheticLambda3
            @Override // java.lang.Runnable
            public final void run() {
                AndroidBridge.this.m1lambda$saveFile$3$comfksohbetappAndroidBridge(str2, strSanitize, str3);
            }
        }).start();
    }

    /* JADX INFO: renamed from: lambda$saveFile$3$com-fksohbet-app-AndroidBridge, reason: not valid java name */
    /* synthetic */ void m1lambda$saveFile$3$comfksohbetappAndroidBridge(String str, String str2, String str3) {
        String str4;
        try {
            int r1 = str.indexOf(44);
            if (str.startsWith("data:") && r1 > 0) {
                str = str.substring(r1 + 1);
            }
            byte[] bArrDecode = Base64.decode(str, 0);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues contentValues = new ContentValues();
                contentValues.put("_display_name", str2);
                contentValues.put("mime_type", str3);
                contentValues.put("is_pending", (Integer) 1);
                Uri uriInsert = this.act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                if (uriInsert == null) {
                    throw new Exception("hedef açılamadı");
                }
                OutputStream outputStreamOpenOutputStream = this.act.getContentResolver().openOutputStream(uriInsert);
                try {
                    if (outputStreamOpenOutputStream == null) {
                        throw new Exception("akış yok");
                    }
                    outputStreamOpenOutputStream.write(bArrDecode);
                    if (outputStreamOpenOutputStream != null) {
                        outputStreamOpenOutputStream.close();
                    }
                    contentValues.clear();
                    contentValues.put("is_pending", (Integer) 0);
                    this.act.getContentResolver().update(uriInsert, contentValues, null, null);
                    str4 = "İndirilenler/" + str2 + " kaydedildi";
                } catch (Throwable th) {
                    if (outputStreamOpenOutputStream != null) {
                        try {
                            outputStreamOpenOutputStream.close();
                        } catch (Throwable th2) {
                            th.addSuppressed(th2);
                        }
                    }
                    throw th;
                }
            } else {
                try {
                    File externalStoragePublicDirectory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (externalStoragePublicDirectory != null && !externalStoragePublicDirectory.exists()) {
                        externalStoragePublicDirectory.mkdirs();
                    }
                    FileOutputStream fileOutputStream = new FileOutputStream(new File(externalStoragePublicDirectory, str2));
                    try {
                        fileOutputStream.write(bArrDecode);
                        fileOutputStream.close();
                        str4 = "İndirilenler/" + str2 + " kaydedildi";
                    } catch (Throwable th3) {
                        try {
                            fileOutputStream.close();
                        } catch (Throwable th4) {
                            th3.addSuppressed(th4);
                        }
                        throw th3;
                    }
                } catch (Throwable th5) {
                    File externalFilesDir = this.act.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (externalFilesDir == null) {
                        throw th5;
                    }
                    if (!externalFilesDir.exists()) {
                        externalFilesDir.mkdirs();
                    }
                    File file = new File(externalFilesDir, str2);
                    FileOutputStream fileOutputStream2 = new FileOutputStream(file);
                    try {
                        fileOutputStream2.write(bArrDecode);
                        fileOutputStream2.close();
                        str4 = "Kaydedildi: " + file.getAbsolutePath();
                    } catch (Throwable th6) {
                        try {
                            fileOutputStream2.close();
                        } catch (Throwable th7) {
                            th6.addSuppressed(th7);
                        }
                        throw th6;
                    }
                    final String fallbackMessage = str4;
                    this.act.runOnUiThread(new Runnable() { // from class: com.fksohbet.app.AndroidBridge$$ExternalSyntheticLambda1
                        @Override // java.lang.Runnable
                        public final void run() {
                            AndroidBridge.this.m0lambda$saveFile$2$comfksohbetappAndroidBridge(fallbackMessage);
                        }
                    });
                }
            }
        } catch (Throwable th8) {
            str4 = "Dosya kaydedilemedi: " + th8.getMessage();
        }
        final String resultMessage = str4;
        this.act.runOnUiThread(new Runnable() { // from class: com.fksohbet.app.AndroidBridge$$ExternalSyntheticLambda1
            @Override // java.lang.Runnable
            public final void run() {
                AndroidBridge.this.m0lambda$saveFile$2$comfksohbetappAndroidBridge(resultMessage);
            }
        });
    }

    /* JADX INFO: renamed from: lambda$saveFile$2$com-fksohbet-app-AndroidBridge, reason: not valid java name */
    /* synthetic */ void m0lambda$saveFile$2$comfksohbetappAndroidBridge(String str) {
        try {
            Toast.makeText(this.act, str, 1).show();
        } catch (Exception e) {
        }
    }

    private static String sanitize(String str) {
        String strReplaceAll = ((str == null || str.trim().isEmpty()) ? "dosya" : str.trim()).replaceAll("[\\\\/:*?\"<>|]", "_");
        if (strReplaceAll.length() > 120) {
            int r0 = strReplaceAll.lastIndexOf(46);
            String strSubstring = r0 > 0 ? strReplaceAll.substring(r0) : "";
            return strReplaceAll.substring(0, 120 - strSubstring.length()) + strSubstring;
        }
        return strReplaceAll;
    }
}
