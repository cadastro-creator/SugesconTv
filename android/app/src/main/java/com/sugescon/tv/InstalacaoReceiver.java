package com.sugescon.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Recebe o andamento da instalação e abre a tela de confirmação do instalador. */
public class InstalacaoReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context contexto, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmar = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmar != null) {
                confirmar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    contexto.startActivity(confirmar);
                } catch (RuntimeException e) {
                    // sem instalador disponível
                }
            }
        }
    }
}
