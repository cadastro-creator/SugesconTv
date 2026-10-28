package com.sugescon.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Ajustes: endereço do site e código da tela. Aparece na primeira abertura. */
public class ConfigActivity extends Activity {
    private EditText campoSite;
    private EditText campoCodigo;
    private TextView aviso;
    private CheckBox campoCompat;
    private CheckBox campoComputador;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        int m = dp(24);

        LinearLayout caixa = new LinearLayout(this);
        caixa.setOrientation(LinearLayout.VERTICAL);
        caixa.setPadding(m * 2, m, m * 2, m);
        caixa.setBackgroundColor(Color.rgb(15, 28, 46));

        caixa.addView(texto("SugesconTv – ajustes", 28, true));
        caixa.addView(texto("Código da tela (aparece no painel de gestão, ex.: K7Q2PX)", 18, false));
        campoCodigo = campo(Config.codigo(this), InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        caixa.addView(campoCodigo);
        caixa.addView(texto("Endereço do site (já vem preenchido; só mude se usar outro endereço)", 16, false));
        campoSite = campo(Config.site(this), InputType.TYPE_TEXT_VARIATION_URI);
        caixa.addView(campoSite);

        campoComputador = new CheckBox(this);
        campoComputador.setText("Identificar como computador (recomendado): os sites mostram a versão completa, "
                + "com todos os gráficos.");
        campoComputador.setTextColor(Color.WHITE);
        campoComputador.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        campoComputador.setChecked(Config.comoComputador(this));
        caixa.addView(campoComputador);

        campoCompat = new CheckBox(this);
        campoCompat.setText("Compatibilidade de vídeo: desenhar sem aceleração. Ligue se gráficos (pizza, barras) "
                + "não aparecem nesta TV. Pode ficar mais lento e o 3D pode não funcionar.");
        campoCompat.setTextColor(Color.WHITE);
        campoCompat.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        campoCompat.setChecked(Config.compatibilidade(this));
        caixa.addView(campoCompat);

        aviso = texto("", 18, false);
        aviso.setTextColor(Color.rgb(255, 170, 160));
        caixa.addView(aviso);

        LinearLayout botoes = new LinearLayout(this);
        botoes.setOrientation(LinearLayout.HORIZONTAL);
        botoes.setGravity(Gravity.START);
        Button salvar = new Button(this);
        salvar.setText("Salvar e abrir");
        salvar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                salvar();
            }
        });
        Button atualizar = new Button(this);
        atualizar.setText("Procurar atualização");
        atualizar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                aviso.setText("Procurando atualização…");
                Atualizador.verificar(ConfigActivity.this);
            }
        });
        botoes.addView(salvar);
        botoes.addView(atualizar);
        caixa.addView(botoes);

        caixa.addView(texto(
                "Dicas: no controle, aperte VOLTAR 3 vezes para abrir estes ajustes. "
                        + "Para abrir sozinho ao ligar, escolha o SugesconTv como tela inicial quando a TV perguntar. "
                        + "Versão " + versao() + ".", 16, false));

        ScrollView rolagem = new ScrollView(this);
        rolagem.setBackgroundColor(Color.rgb(15, 28, 46));
        rolagem.addView(caixa);
        setContentView(rolagem);
        campoCodigo.requestFocus();
    }

    private void salvar() {
        String site = Config.normalizarSite(campoSite.getText().toString());
        String codigo = Config.normalizarCodigo(campoCodigo.getText().toString());
        if (site == null) {
            aviso.setText("Endereço inválido. Use o endereço do site com https://");
            campoSite.requestFocus();
            return;
        }
        if (codigo.length() < 4) {
            aviso.setText("Digite o código da tela (aparece no painel de gestão).");
            campoCodigo.requestFocus();
            return;
        }
        Config.salvar(this, site, codigo);
        Config.salvarCompatibilidade(this, campoCompat.isChecked());
        Config.salvarComoComputador(this, campoComputador.isChecked());
        Intent i = new Intent(this, MainActivity.class);
        i.putExtra("recarregar", true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(i);
        finish();
    }

    private String versao() {
        try {
            PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
            return p.versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private TextView texto(String t, int tamanho, boolean negrito) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextColor(Color.WHITE);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, tamanho);
        if (negrito) v.setTypeface(null, android.graphics.Typeface.BOLD);
        v.setPadding(0, dp(12), 0, dp(6));
        return v;
    }

    private EditText campo(String valor, int variacao) {
        EditText e = new EditText(this);
        e.setText(valor);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_TEXT | variacao);
        e.setTextColor(Color.WHITE);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        e.setSelectAllOnFocus(false);
        return e;
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }
}
