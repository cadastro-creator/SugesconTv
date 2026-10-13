package com.sugescon.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Abre o SugesconTv ao ligar a TV e depois de uma atualização. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context contexto, Intent intent) {
        Intent abrir = new Intent(contexto, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            contexto.startActivity(abrir);
        } catch (RuntimeException e) {
            // Alguns aparelhos bloqueiam abrir telas em segundo plano; nesse caso,
            // defina o SugesconTv como tela inicial (HOME).
        }
    }
}
