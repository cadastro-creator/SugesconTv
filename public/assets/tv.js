/* SugesconTv - página /tv?tela=CODIGO (JavaScript ES5 para TVs antigas). */
(function () {
  'use strict';

  var CONSULTA_MS = 60000;

  function parametro(nome) {
    var m = new RegExp('[?&]' + nome + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  function $(id) {
    return document.getElementById(id);
  }

  function mostrar(el, sim) {
    el.className = el.className.replace(/\s*pnt-oculto/g, '') + (sim ? '' : ' pnt-oculto');
  }

  function mensagem(texto) {
    var el = $('mensagem');
    while (el.firstChild) el.removeChild(el.firstChild);
    if (texto) {
      var s = document.createElement('span');
      s.appendChild(document.createTextNode(texto));
      el.appendChild(s);
    }
    mostrar(el, !!texto);
  }

  function lerCache(chave) {
    try {
      return window.localStorage.getItem(chave);
    } catch (e) {
      return null;
    }
  }

  function gravarCache(chave, valor) {
    try {
      window.localStorage.setItem(chave, valor);
    } catch (e) {
      /* sem espaço ou bloqueado: segue sem cache */
    }
  }

  // ---------- rotação (?girar=90 / 180 / 270) ----------
  var girar = parseInt(parametro('girar'), 10) || 0;
  if (girar !== 90 && girar !== 180 && girar !== 270) girar = 0;

  function ajustarRotacao() {
    var palco = $('palco');
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var t = '';
    if (girar === 90) t = 'translate(' + w + 'px,0) rotate(90deg)';
    else if (girar === 180) t = 'translate(' + w + 'px,' + h + 'px) rotate(180deg)';
    else if (girar === 270) t = 'translate(0,' + h + 'px) rotate(270deg)';
    var deitado = girar === 90 || girar === 270;
    palco.style.width = (deitado ? h : w) + 'px';
    palco.style.height = (deitado ? w : h) + 'px';
    palco.style.webkitTransform = t;
    palco.style.transform = t;
  }

  // ---------- relógio (?relogio=1) ----------
  function doisDigitos(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function atualizarRelogio() {
    var d = new Date();
    $('relogio').innerHTML = '';
    $('relogio').appendChild(document.createTextNode(doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes())));
  }

  // ---------- manter a tela acesa ----------
  var trava = null;
  function pedirWakeLock() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    try {
      navigator.wakeLock.request('screen').then(
        function (t) {
          trava = t;
        },
        function () {}
      );
    } catch (e) {
      /* não suportado */
    }
  }

  // ---------- conexão ----------
  var falhaRede = false;
  function semConexao() {
    return navigator.onLine === false || falhaRede;
  }
  function atualizarAvisoConexao() {
    mostrar($('semConexao'), semConexao());
  }

  function iniciar() {
    var codigo = (parametro('tela') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (girar) {
      ajustarRotacao();
      window.addEventListener('resize', ajustarRotacao, false);
      window.addEventListener('orientationchange', ajustarRotacao, false);
    }
    if (parametro('relogio') === '1' || parametro('relogio') === 'sim') {
      mostrar($('relogio'), true);
      atualizarRelogio();
      setInterval(atualizarRelogio, 10000);
    }
    pedirWakeLock();
    document.addEventListener(
      'visibilitychange',
      function () {
        if (!trava || trava.released) pedirWakeLock();
      },
      false
    );

    if (!codigo) {
      mensagem('Falta o código da tela. Abra o endereço no formato /tv?tela=CODIGO');
      return;
    }

    var chaveCache = 'sugescontv:' + codigo;
    var ultimaLista = null;
    var naoEncontrada = false;
    var player = new window.PainelPlayer($('palco'), {
      maxQuadros: parseInt(parametro('quadros'), 10) || 0,
      offline: semConexao,
      aoVazio: function (vazio) {
        if (vazio && naoEncontrada) mensagem('Tela "' + codigo + '" não encontrada. Confira o código no painel de gestão.');
        else mensagem(vazio ? 'Esta tela ainda não tem dashboards ativos. Adicione itens no painel de gestão.' : '');
      }
    });

    function aplicar(texto) {
      if (texto === ultimaLista) return;
      var dados;
      try {
        dados = JSON.parse(texto);
      } catch (e) {
        return;
      }
      ultimaLista = texto;
      if (dados && dados.nome) document.title = dados.nome + ' - SugesconTv';
      player.definirLista((dados && dados.itens) || []);
    }

    function buscar() {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/tv/' + codigo + '?t=' + new Date().getTime(), true);
      xhr.timeout = 15000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          falhaRede = false;
          naoEncontrada = false;
          gravarCache(chaveCache, xhr.responseText);
          aplicar(xhr.responseText);
        } else if (xhr.status === 404) {
          falhaRede = false;
          naoEncontrada = true;
          ultimaLista = null;
          player.definirLista([]);
        } else if (xhr.status === 0) {
          falhaRede = true;
        }
        atualizarAvisoConexao();
      };
      xhr.send();
    }

    var cache = lerCache(chaveCache);
    if (cache) aplicar(cache);
    player.iniciar();
    buscar();
    setInterval(buscar, CONSULTA_MS);
    window.addEventListener('online', function () {
      atualizarAvisoConexao();
      buscar();
    }, false);
    window.addEventListener('offline', atualizarAvisoConexao, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, false);
  else iniciar();
})();
