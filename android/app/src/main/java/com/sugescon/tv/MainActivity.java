package com.sugescon.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** WebView em tela cheia que abre https://<site>/tv?tela=CODIGO. */
public class MainActivity extends Activity {
    private static final long SEIS_HORAS = 6L * 60 * 60 * 1000;
    private static final long JANELA_VOLTAR_MS = 2000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private final long[] toquesVoltar = new long[3];
    private int indiceVoltar = 0;

    private final Runnable verificarAtualizacao = new Runnable() {
        @Override
        public void run() {
            Atualizador.verificar(MainActivity.this);
            handler.postDelayed(this, SEIS_HORAS);
        }
    };

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        if (!Config.configurado(this)) {
            startActivity(new Intent(this, ConfigActivity.class));
            finish();
            return;
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setSupportZoom(false);
        // Cookies de terceiros: o WebView do Android bloqueia por padrão (inclusive os "isolados
        // por site" que o Chrome aceita). O Looker Studio exibido dentro da TV precisa deles para
        // buscar os dados dos gráficos; sem eles, só os números aparecem.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);
        aplicarAgente();
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
                // A página principal fica sempre no site configurado.
                return !pedido.getUrl().toString().startsWith(Config.site(MainActivity.this) + "/");
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest pedido, WebResourceError erro) {
                if (pedido.isForMainFrame()) {
                    // Sem internet ao ligar a TV: tenta de novo em 15 s.
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            web.loadUrl(Config.urlTv(MainActivity.this));
                        }
                    }, 15000);
                }
            }
        });
        setContentView(web);
        aplicarCompatibilidade();
        ocultarBarras();
        web.loadUrl(Config.urlTv(this));
        handler.postDelayed(verificarAtualizacao, 20000);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (web != null && intent.getBooleanExtra("recarregar", false)) {
            aplicarAgente();
            web.loadUrl(Config.urlTv(this));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        ocultarBarras();
        aplicarCompatibilidade();
    }

    @Override
    public void onWindowFocusChanged(boolean foco) {
        super.onWindowFocusChanged(foco);
        if (foco) ocultarBarras();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Aplica (ou desfaz) a identificação como computador, conforme os ajustes. */
    private void aplicarAgente() {
        WebSettings s = web.getSettings();
        s.setUserAgentString(Config.comoComputador(this) ? agenteComputador(WebSettings.getDefaultUserAgent(this)) : null);
    }

    /** Identificação de Chrome de computador, com a mesma versão do navegador da TV. */
    static String agenteComputador(String original) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/([\\d.]+)").matcher(original == null ? "" : original);
        String versao = m.find() ? m.group(1) : "120.0.0.0";
        return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + versao + " Safari/537.36";
    }

    /** Desenho sem aceleração de vídeo: contorna TVs cuja GPU não pinta curvas e áreas grandes. */
    private void aplicarCompatibilidade() {
        if (web == null) return;
        int tipo = Config.compatibilidade(this) ? View.LAYER_TYPE_SOFTWARE : View.LAYER_TYPE_NONE;
        if (web.getLayerType() != tipo) web.setLayerType(tipo, null);
    }

    @SuppressWarnings("deprecation")
    private void ocultarBarras() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    /** VOLTAR 3 vezes (em até 2 s) ou MENU abrem os ajustes. VOLTAR sozinho não fecha o app. */
    @Override
    public boolean onKeyDown(int codigo, KeyEvent evento) {
        if (codigo == KeyEvent.KEYCODE_MENU || codigo == KeyEvent.KEYCODE_SETTINGS) {
            abrirAjustes();
            return true;
        }
        if (codigo == KeyEvent.KEYCODE_BACK) {
            long agora = System.currentTimeMillis();
            toquesVoltar[indiceVoltar % 3] = agora;
            indiceVoltar++;
            long maisAntigo = toquesVoltar[indiceVoltar % 3];
            if (indiceVoltar >= 3 && agora - maisAntigo <= JANELA_VOLTAR_MS) {
                indiceVoltar = 0;
                abrirAjustes();
            }
            return true;
        }
        return super.onKeyDown(codigo, evento);
    }

    private void abrirAjustes() {
        startActivity(new Intent(this, ConfigActivity.class));
    }
}
