package com.fksohbet.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;

/* JADX INFO: loaded from: classes.dex */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://fksohbet.local/";
    private static final int REQ_FILE = 1003;
    private static final int REQ_MIC = 1001;
    private static final int REQ_NOTIF = 1002;
    private static final int REQ_STORAGE = 1004;
    static final String START_URL = "https://fksohbet.local/index.html";
    private ValueCallback<Uri[]> fileCallback;
    private long lastBackAt = 0;
    private PermissionRequest pendingPermission;
    private FrameLayout root;
    private WebView web;

    @Override // android.app.Activity
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        Window window = getWindow();
        window.setStatusBarColor(-15132391);
        window.setNavigationBarColor(-15132391);
        window.setSoftInputMode(16);
        FrameLayout frameLayout = new FrameLayout(this);
        this.root = frameLayout;
        frameLayout.setBackgroundColor(-15132391);
        WebView webView = new WebView(this);
        this.web = webView;
        webView.setBackgroundColor(-15132391);
        configure(this.web);
        this.root.addView(this.web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(this.root);
        this.web.loadUrl(START_URL);
        askPermissions();
    }

    private void askPermissions() {
        if (checkSelfPermission("android.permission.RECORD_AUDIO") != 0) {
            requestPermissions(new String[]{"android.permission.RECORD_AUDIO"}, REQ_MIC);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
        }
        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission("android.permission.WRITE_EXTERNAL_STORAGE") != 0) {
            requestPermissions(new String[]{"android.permission.WRITE_EXTERNAL_STORAGE"}, REQ_STORAGE);
        }
    }

    private void configure(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(2);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(1);
        webView.setOverScrollMode(2);
        webView.addJavascriptInterface(new AndroidBridge(this), "FKNative");
        webView.setWebViewClient(new AnonymousClass1());
        webView.setWebChromeClient(new AnonymousClass2());
    }

    /* JADX INFO: renamed from: com.fksohbet.app.MainActivity$1, reason: invalid class name */
    class AnonymousClass1 extends WebViewClient {
        AnonymousClass1() {
        }

        @Override // android.webkit.WebViewClient
        public WebResourceResponse shouldInterceptRequest(WebView webView, WebResourceRequest webResourceRequest) {
            Uri url = webResourceRequest.getUrl();
            if (url == null || !"fksohbet.local".equals(url.getHost())) {
                return null;
            }
            String path = url.getPath() == null ? "/" : url.getPath();
            if (path.startsWith("/")) {
                path = path.substring(1);
            }
            if (path.isEmpty()) {
                path = "index.html";
            }
            return MainActivity.this.serveAsset(path);
        }

        @Override // android.webkit.WebViewClient
        public void onPageFinished(WebView webView, String str) {
            webView.evaluateJavascript("(function(){try{return 'FK.app=' + !!(window.FK&&window.FK.app) + ' screen=' + (document.getElementById('app')||{}).dataset.screen;}catch(e){return 'hata: '+e}})()", new ValueCallback() { // from class: com.fksohbet.app.MainActivity$1$$ExternalSyntheticLambda0
                @Override // android.webkit.ValueCallback
                public final void onReceiveValue(Object obj) {
                    Log.i("FKSohbetWeb", "yüklendi → " + ((String) obj));
                }
            });
        }

        @Override // android.webkit.WebViewClient
        public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest webResourceRequest) {
            Uri url = webResourceRequest.getUrl();
            if (url == null) {
                return false;
            }
            String scheme = url.getScheme() == null ? "" : url.getScheme();
            if ("fksohbet.local".equals(url.getHost())) {
                return false;
            }
            if (!"http".equals(scheme) && !"https".equals(scheme) && !"mailto".equals(scheme)) {
                return true;
            }
            try {
                MainActivity.this.startActivity(new Intent("android.intent.action.VIEW", url));
            } catch (Exception e) {
            }
            return true;
        }
    }

    /* JADX INFO: renamed from: com.fksohbet.app.MainActivity$2, reason: invalid class name */
    class AnonymousClass2 extends WebChromeClient {
        AnonymousClass2() {
        }

        @Override // android.webkit.WebChromeClient
        public void onPermissionRequest(final PermissionRequest permissionRequest) {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.fksohbet.app.MainActivity$2$$ExternalSyntheticLambda0
                @Override // java.lang.Runnable
                public final void run() {
                    AnonymousClass2.this.m5lambda$onPermissionRequest$0$comfksohbetappMainActivity$2(permissionRequest);
                }
            });
        }

        /* JADX INFO: renamed from: lambda$onPermissionRequest$0$com-fksohbet-app-MainActivity$2, reason: not valid java name */
        /* synthetic */ void m5lambda$onPermissionRequest$0$comfksohbetappMainActivity$2(PermissionRequest permissionRequest) {
            boolean z = false;
            for (String str : permissionRequest.getResources()) {
                if ("android.webkit.resource.AUDIO_CAPTURE".equals(str)) {
                    z = true;
                }
            }
            if (!z) {
                permissionRequest.deny();
            } else if (!MainActivity.this.hasMic()) {
                MainActivity.this.pendingPermission = permissionRequest;
                MainActivity.this.requestPermissions(new String[]{"android.permission.RECORD_AUDIO"}, MainActivity.REQ_MIC);
            } else {
                permissionRequest.grant(new String[]{"android.webkit.resource.AUDIO_CAPTURE"});
            }
        }

        @Override // android.webkit.WebChromeClient
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> valueCallback, WebChromeClient.FileChooserParams fileChooserParams) {
            if (MainActivity.this.fileCallback != null) {
                MainActivity.this.fileCallback.onReceiveValue(null);
            }
            MainActivity.this.fileCallback = valueCallback;
            try {
                Intent intent = new Intent("android.intent.action.GET_CONTENT");
                intent.addCategory("android.intent.category.OPENABLE");
                intent.setType("*/*");
                intent.putExtra("android.intent.extra.ALLOW_MULTIPLE", true);
                MainActivity.this.startActivityForResult(Intent.createChooser(intent, "Dosya seç"), MainActivity.REQ_FILE);
                return true;
            } catch (Exception e) {
                MainActivity.this.fileCallback = null;
                return false;
            }
        }

        @Override // android.webkit.WebChromeClient
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            Log.i("FKSohbetWeb", consoleMessage.message() + "  (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
            return true;
        }
    }

    /* JADX INFO: Access modifiers changed from: private */
    public boolean hasMic() {
        return checkSelfPermission("android.permission.RECORD_AUDIO") == 0;
    }

    @Override // android.app.Activity
    public void onRequestPermissionsResult(int r2, String[] strArr, int[] r4) {
        super.onRequestPermissionsResult(r2, strArr, r4);
        if (r2 == REQ_MIC) {
            boolean z = false;
            if (r4.length > 0 && r4[0] == 0) {
                z = true;
            }
            PermissionRequest permissionRequest = this.pendingPermission;
            this.pendingPermission = null;
            if (permissionRequest != null) {
                if (z) {
                    permissionRequest.grant(new String[]{"android.webkit.resource.AUDIO_CAPTURE"});
                } else {
                    permissionRequest.deny();
                }
            }
            if (!z && !isFinishing()) {
                Toast.makeText(this, "Mikrofon izni verilmedi; sesin karşı tarafa gitmez.", 1).show();
            }
        }
    }

    /* JADX WARN: Code duplicated, block: B:18:0x0043  */
    @Override // android.app.Activity
    protected void onActivityResult(int r4, int r5, Intent intent) {
        Uri[] uriArr;
        if (r4 != REQ_FILE) {
            super.onActivityResult(r4, r5, intent);
            return;
        }
        if (r5 == -1 && intent != null) {
            if (intent.getClipData() != null) {
                int itemCount = intent.getClipData().getItemCount();
                uriArr = new Uri[itemCount];
                for (int r1 = 0; r1 < itemCount; r1++) {
                    uriArr[r1] = intent.getClipData().getItemAt(r1).getUri();
                }
            } else if (intent.getData() != null) {
                uriArr = new Uri[]{intent.getData()};
            } else {
                uriArr = null;
            }
        } else {
            uriArr = null;
        }
        ValueCallback<Uri[]> valueCallback = this.fileCallback;
        if (valueCallback != null) {
            valueCallback.onReceiveValue(uriArr);
            this.fileCallback = null;
        }
    }

    /* JADX INFO: Access modifiers changed from: private */
    public WebResourceResponse serveAsset(String str) {
        if (str.contains("..")) {
            return null;
        }
        try {
            InputStream inputStreamOpen = getAssets().open("web/" + str);
            HashMap map = new HashMap();
            map.put("Access-Control-Allow-Origin", "*");
            map.put("Cache-Control", "no-cache");
            String strMimeOf = mimeOf(str);
            return new WebResourceResponse(strMimeOf, strMimeOf.startsWith("text/") ? "utf-8" : null, 200, "OK", map, inputStreamOpen);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap(), null);
        }
    }

    private static String mimeOf(String str) {
        String lowerCase = str.toLowerCase();
        if (lowerCase.endsWith(".html") || lowerCase.endsWith(".htm")) {
            return "text/html";
        }
        if (lowerCase.endsWith(".js")) {
            return "application/javascript";
        }
        if (lowerCase.endsWith(".css")) {
            return "text/css";
        }
        if (lowerCase.endsWith(".json")) {
            return "application/json";
        }
        if (lowerCase.endsWith(".png")) {
            return "image/png";
        }
        if (lowerCase.endsWith(".jpg") || lowerCase.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lowerCase.endsWith(".svg")) {
            return "image/svg+xml";
        }
        if (lowerCase.endsWith(".woff2")) {
            return "font/woff2";
        }
        return lowerCase.endsWith(".txt") ? "text/plain" : "application/octet-stream";
    }

    @Override // android.app.Activity
    public void onBackPressed() {
        WebView webView = this.web;
        if (webView == null) {
            super.onBackPressed();
        } else {
            webView.evaluateJavascript("(function(){try{return (window.__fkHandleBack&&window.__fkHandleBack())||'root'}catch(e){return 'root'}})()", new ValueCallback() { // from class: com.fksohbet.app.MainActivity$$ExternalSyntheticLambda0
                @Override // android.webkit.ValueCallback
                public final void onReceiveValue(Object obj) {
                    MainActivity.this.m4lambda$onBackPressed$0$comfksohbetappMainActivity((String) obj);
                }
            });
        }
    }

    /* JADX INFO: renamed from: lambda$onBackPressed$0$com-fksohbet-app-MainActivity, reason: not valid java name */
    /* synthetic */ void m4lambda$onBackPressed$0$comfksohbetappMainActivity(String str) {
        if ("root".equals(str != null ? str.replace("\"", "").trim() : "")) {
            moveTaskToBack(true);
        }
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        try {
            stopService(new Intent(this, (Class<?>) CallService.class));
        } catch (Exception e) {
        }
        WebView webView = this.web;
        if (webView != null) {
            webView.destroy();
            this.web = null;
        }
        super.onDestroy();
    }
}
