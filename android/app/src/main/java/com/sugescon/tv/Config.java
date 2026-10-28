package com.sugescon.tv;

import android.content.Context;
import android.content.SharedPreferences;

/** Endereço do site e código da tela, guardados no aparelho. */
final class Config {
    private static final String ARQUIVO = "sugescontv";

    private Config() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE);
    }

    static String site(Context c) {
        String s = prefs(c).getString("site", "");
        return s.isEmpty() ? BuildConfig.SITE_PADRAO : s;
    }

    static String codigo(Context c) {
        return prefs(c).getString("codigo", "");
    }

    static boolean configurado(Context c) {
        return site(c).startsWith("https://") && codigo(c).length() > 0;
    }

    static void salvar(Context c, String site, String codigo) {
        prefs(c).edit().putString("site", site).putString("codigo", codigo).apply();
    }

    /** Identificar como navegador de computador (padrão: sim). Sites do Google tratam o
     *  navegador embutido ("wv", "Mobile") de forma diferente e podem não mostrar gráficos. */
    static boolean comoComputador(Context c) {
        return prefs(c).getBoolean("comoComputador", true);
    }

    static void salvarComoComputador(Context c, boolean ligado) {
        prefs(c).edit().putBoolean("comoComputador", ligado).apply();
    }

    /** Compatibilidade de vídeo: desenha sem aceleração (para TVs que não pintam gráficos). */
    static boolean compatibilidade(Context c) {
        return prefs(c).getBoolean("compatibilidade", false);
    }

    static void salvarCompatibilidade(Context c, boolean ligado) {
        prefs(c).edit().putBoolean("compatibilidade", ligado).apply();
    }

    static String urlTv(Context c) {
        return site(c) + "/tv?tela=" + codigo(c);
    }

    /** Aceita "meusite.pages.dev" ou "https://meusite.pages.dev/qualquer"; devolve "https://host" ou null. */
    static String normalizarSite(String texto) {
        String s = texto == null ? "" : texto.trim();
        if (s.isEmpty()) return null;
        if (s.toLowerCase().startsWith("http://")) return null;
        if (!s.toLowerCase().startsWith("https://")) s = "https://" + s;
        try {
            java.net.URL u = new java.net.URL(s);
            String host = u.getHost();
            if (host == null || !host.contains(".") || u.getPort() != -1) return null;
            return "https://" + host.toLowerCase();
        } catch (java.net.MalformedURLException e) {
            return null;
        }
    }

    static String normalizarCodigo(String texto) {
        return texto == null ? "" : texto.toUpperCase().replaceAll("[^A-Z0-9]", "");
    }
}
