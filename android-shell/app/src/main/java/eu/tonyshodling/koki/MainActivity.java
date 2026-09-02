package eu.tonyshodling.koki;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends Activity implements NfcAdapter.ReaderCallback {
    private static final String APP_URL = "https://koki.tonyshodling.eu/koki-command-center";
    private static final String TRUSTED_HOST = "koki.tonyshodling.eu";
    private static final byte[] SELECT_ICAO_APPLET = hex("00A4040C07A0000002471001");

    private WebView webView;
    private NfcAdapter nfcAdapter;
    private final AtomicBoolean waitingForCard = new AtomicBoolean(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(238, 242, 247));
        getWindow().setNavigationBarColor(Color.rgb(238, 242, 247));

        nfcAdapter = NfcAdapter.getDefaultAdapter(this);
        webView = new WebView(this);
        configureWebView(webView);
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    private void configureWebView(WebView view) {
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSafeBrowsingEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " KOKI-Android/0.1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);

        view.addJavascriptInterface(new NfcBridge(), "kokiNfcIdCard");
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (isTrusted(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                Uri uri = Uri.parse(url);
                if (isTrusted(uri)) return false;
                openExternal(uri);
                return true;
            }
        });
    }

    private boolean isTrusted(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && TRUSTED_HOST.equalsIgnoreCase(uri.getHost());
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
    }

    public final class NfcBridge {
        @JavascriptInterface
        public void capabilities() {
            runOnUiThread(() -> sendCapabilities());
        }

        @JavascriptInterface
        public void readIdentityCard(String requestJson) {
            runOnUiThread(() -> beginNfcRead());
        }
    }

    private void sendCapabilities() {
        JSONObject payload = new JSONObject();
        try {
            boolean present = nfcAdapter != null;
            boolean enabled = present && nfcAdapter.isEnabled();
            payload.put("supported", present && enabled);
            payload.put("platform", "android");
            payload.put("version", 1);
            if (!present) {
                payload.put("message", "Този Android телефон няма NFC хардуер.");
            } else if (!enabled) {
                payload.put("message", "NFC е изключен. Включи NFC от настройките на телефона и опитай отново.");
            } else {
                payload.put("message", "Android NFC четецът е готов.");
            }
        } catch (Exception ignored) {
        }
        callback("__KOKI_NFC_ID_CARD_CAPABILITY__", payload);
    }

    private void beginNfcRead() {
        if (nfcAdapter == null) {
            fail("Този Android телефон няма NFC хардуер.");
            return;
        }
        if (!nfcAdapter.isEnabled()) {
            fail("NFC е изключен. Включи NFC и опитай отново.");
            return;
        }
        waitingForCard.set(true);
        Bundle extras = new Bundle();
        extras.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 150);
        int flags = NfcAdapter.FLAG_READER_NFC_A
                | NfcAdapter.FLAG_READER_NFC_B
                | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;
        nfcAdapter.enableReaderMode(this, this, flags, extras);
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        if (!waitingForCard.compareAndSet(true, false)) return;
        IsoDep isoDep = IsoDep.get(tag);
        if (isoDep == null) {
            runOnUiThread(() -> {
                disableReaderMode();
                fail("NFC карта е открита, но не поддържа ISO-DEP (ISO 14443-4).");
            });
            return;
        }

        JSONObject payload = new JSONObject();
        JSONObject data = new JSONObject();
        try {
            isoDep.connect();
            isoDep.setTimeout(8000);
            byte[] response = isoDep.transceive(SELECT_ICAO_APPLET);
            String sw = statusWord(response);
            boolean icaoSelected = "9000".equals(sw);

            payload.put("ok", true);
            payload.put("stage", "chip_detected");
            payload.put("platform", "android");
            payload.put("version", 1);
            payload.put("message", icaoSelected
                    ? "NFC чипът е разпознат и ICAO/eMRTD приложението отговори успешно (SW 9000)."
                    : "ISO-DEP чипът е разпознат. ICAO SELECT върна SW " + sw + ".");

            data.put("authenticity", icaoSelected
                    ? "ICAO/eMRTD applet открит · SW 9000"
                    : "ISO-DEP открит · ICAO SELECT SW " + sw);
            data.put("isoDep", true);
            data.put("icaoAppletSelected", icaoSelected);
            data.put("statusWord", sw);
            data.put("maxTransceiveLength", isoDep.getMaxTransceiveLength());
            payload.put("data", data);
        } catch (Exception e) {
            try {
                payload.put("ok", false);
                payload.put("platform", "android");
                payload.put("message", readableError(e));
            } catch (Exception ignored) {
            }
        } finally {
            try {
                isoDep.close();
            } catch (IOException ignored) {
            }
        }

        JSONObject finalPayload = payload;
        runOnUiThread(() -> {
            disableReaderMode();
            callback("__KOKI_NFC_ID_CARD_RESULT__", finalPayload);
        });
    }

    private void fail(String message) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("ok", false);
            payload.put("platform", "android");
            payload.put("message", message);
        } catch (Exception ignored) {
        }
        callback("__KOKI_NFC_ID_CARD_RESULT__", payload);
    }

    private String readableError(Exception e) {
        String n = e.getClass().getSimpleName();
        String m = e.getMessage();
        if (n != null && n.toLowerCase(Locale.ROOT).contains("taglost")) {
            return "Връзката с NFC картата се прекъсна. Задръж телефона неподвижно върху картата и опитай отново.";
        }
        if (m == null || m.isBlank()) m = n;
        return "NFC комуникацията не завърши: " + m;
    }

    private void callback(String functionName, JSONObject payload) {
        if (webView == null) return;
        String script = "window." + functionName + " && window." + functionName + "(" + payload.toString() + ");";
        webView.evaluateJavascript(script, null);
    }

    private void disableReaderMode() {
        if (nfcAdapter == null) return;
        try {
            nfcAdapter.disableReaderMode(this);
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onPause() {
        disableReaderMode();
        waitingForCard.set(false);
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("kokiNfcIdCard");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private static String statusWord(byte[] response) {
        if (response == null || response.length < 2) return "NO_SW";
        int a = response[response.length - 2] & 0xFF;
        int b = response[response.length - 1] & 0xFF;
        return String.format(Locale.ROOT, "%02X%02X", a, b);
    }

    private static byte[] hex(String value) {
        int len = value.length();
        byte[] out = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            out[i / 2] = (byte) Integer.parseInt(value.substring(i, i + 2), 16);
        }
        return out;
    }
}
