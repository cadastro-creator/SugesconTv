package com.sugescon.tv;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Atualização automática: lê https://<site>/app/version.json e, se houver versão nova,
 * baixa o APK e abre o instalador. Mudanças nos dashboards não exigem atualizar o app.
 */
final class Atualizador {
    private static volatile boolean emAndamento = false;
    private static boolean pediuPermissao = false;

    private Atualizador() {}

    static void verificar(final Activity tela) {
        if (emAndamento || !Config.configurado(tela)) return;
        emAndamento = true;
        final Context app = tela.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL enderecoVersao = new URL(Config.site(app) + "/app/version.json");
                    JSONObject info = new JSONObject(new String(baixar(enderecoVersao), "UTF-8"));
                    int nova = info.optInt("versionCode", 0);
                    int atual = versaoAtual(app);
                    if (nova <= atual) {
                        avisar(tela, "O SugesconTv já está na versão mais recente.");
                        return;
                    }
                    URL apk = new URL(enderecoVersao, info.optString("apk", "sugescontv.apk"));
                    if (!"https".equals(apk.getProtocol())) return;
                    if (Build.VERSION.SDK_INT >= 26 && !app.getPackageManager().canRequestPackageInstalls()) {
                        pedirPermissao(tela);
                        return;
                    }
                    avisar(tela, "Baixando a versão " + info.optString("versionName", "") + " do SugesconTv…");
                    instalar(app, apk);
                } catch (Exception e) {
                    // sem internet ou site fora do ar: tenta de novo na próxima verificação
                    avisar(tela, "Não foi possível procurar atualização agora.");
                } finally {
                    emAndamento = false;
                }
            }
        }).start();
    }

    private static int versaoAtual(Context c) throws Exception {
        return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionCode;
    }

    private static HttpURLConnection abrir(URL url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(60000);
        con.setUseCaches(false);
        con.setRequestProperty("Cache-Control", "no-cache");
        if (con.getResponseCode() != 200) throw new Exception("HTTP " + con.getResponseCode());
        return con;
    }

    private static byte[] baixar(URL url) throws Exception {
        HttpURLConnection con = abrir(url);
        InputStream in = con.getInputStream();
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            copiar(in, out);
            return out.toByteArray();
        } finally {
            in.close();
            con.disconnect();
        }
    }

    private static void copiar(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private static void instalar(Context c, URL apk) throws Exception {
        PackageInstaller instalador = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName());
        int id = instalador.createSession(params);
        PackageInstaller.Session sessao = instalador.openSession(id);
        try {
            HttpURLConnection con = abrir(apk);
            InputStream in = con.getInputStream();
            OutputStream out = sessao.openWrite("sugescontv.apk", 0, con.getContentLength());
            try {
                copiar(in, out);
                sessao.fsync(out);
            } finally {
                out.close();
                in.close();
                con.disconnect();
            }
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            Intent retorno = new Intent(c, InstalacaoReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(c, id, retorno, flags);
            sessao.commit(pi.getIntentSender());
        } catch (Exception e) {
            sessao.abandon();
            throw e;
        } finally {
            sessao.close();
        }
    }

    private static void pedirPermissao(final Activity tela) {
        if (pediuPermissao) return;
        pediuPermissao = true;
        tela.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(tela, "Para atualizar sozinho, permita que o SugesconTv instale apps.", Toast.LENGTH_LONG).show();
                try {
                    tela.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + tela.getPackageName())));
                } catch (ActivityNotFoundException e) {
                    // aparelho sem essa tela de ajustes
                }
            }
        });
    }

    private static void avisar(final Activity tela, final String texto) {
        if (!(tela instanceof ConfigActivity)) return; // na TV, não mostra mensagens à toa
        tela.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(tela, texto, Toast.LENGTH_LONG).show();
            }
        });
    }
}
