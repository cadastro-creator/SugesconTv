/* SugesconTv - modo imagem: mostra a foto mais recente da página (/foto?c=CHAVE&u=LINK).
 * Se a foto ainda não existir, abre o link ao vivo. Troca a foto sozinha a cada minuto. (ES5) */
(function () {
  'use strict';
  function parametro(nome) {
    var m = new RegExp('[?&]' + nome + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
  var chave = parametro('c');
  var aoVivo = parametro('u');
  var img = document.getElementById('foto');
  var primeira = true;
  if (!/^[a-f0-9]{24}$/.test(chave)) return;

  function carregar() {
    // Carrega escondido e só troca quando a nova foto estiver pronta (sem piscar).
    var nova = new Image();
    nova.onload = function () {
      img.src = nova.src;
      primeira = false;
    };
    nova.onerror = function () {
      if (primeira && /^https:\/\//.test(aoVivo)) window.location.replace(aoVivo); // ainda sem foto
    };
    nova.src = '/api/foto/' + chave + '?t=' + new Date().getTime();
  }
  carregar();
  setInterval(carregar, 60000);
})();
