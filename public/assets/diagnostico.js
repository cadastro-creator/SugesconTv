/* SugesconTv - diagnóstico da TV (ES5). Mostra a versão do navegador interno e testa desenho de gráficos. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var VERSAO_MINIMA = 110; // Power BI e Looker Studio pedem navegador recente

  function linha(nome, valor) {
    var tr = document.createElement('tr');
    var a = document.createElement('td');
    var b = document.createElement('td');
    a.appendChild(document.createTextNode(nome));
    b.appendChild(document.createTextNode(valor));
    tr.appendChild(a);
    tr.appendChild(b);
    document.getElementById('itens').appendChild(tr);
  }

  function svg(tag, at) {
    var e = document.createElementNS(NS, tag);
    for (var k in at) if (at.hasOwnProperty(k)) e.setAttribute(k, at[k]);
    return e;
  }

  function testeSvg() {
    var raiz = svg('svg', { viewBox: '0 0 600 260', width: '100%', height: '100%' });
    var valores = [120, 200, 90, 160];
    for (var i = 0; i < valores.length; i++) {
      raiz.appendChild(svg('rect', { x: 30 + i * 70, y: 230 - valores[i], width: 50, height: valores[i], fill: '#f39c12' }));
    }
    var fatias = [0.45, 0.3, 0.25];
    var cores = ['#f5d58c', '#e67e22', '#3498db'];
    var ang = -Math.PI / 2;
    for (i = 0; i < fatias.length; i++) {
      var a2 = ang + fatias[i] * Math.PI * 2;
      var x1 = 450 + 100 * Math.cos(ang), y1 = 130 + 100 * Math.sin(ang);
      var x2 = 450 + 100 * Math.cos(a2), y2 = 130 + 100 * Math.sin(a2);
      var grande = fatias[i] > 0.5 ? 1 : 0;
      raiz.appendChild(svg('path', { d: 'M450 130 L' + x1 + ' ' + y1 + ' A100 100 0 ' + grande + ' 1 ' + x2 + ' ' + y2 + ' Z', fill: cores[i] }));
      ang = a2;
    }
    document.getElementById('testeSvg').appendChild(raiz);
  }

  function testeCanvas() {
    var c = document.getElementById('testeCanvas');
    var ctx = c.getContext && c.getContext('2d');
    if (!ctx) return false;
    var valores = [120, 200, 90, 160];
    ctx.fillStyle = '#f39c12';
    for (var i = 0; i < valores.length; i++) ctx.fillRect(30 + i * 70, 230 - valores[i], 50, valores[i]);
    var fatias = [0.45, 0.3, 0.25];
    var cores = ['#f5d58c', '#e67e22', '#3498db'];
    var ang = -Math.PI / 2;
    for (i = 0; i < fatias.length; i++) {
      ctx.beginPath();
      ctx.moveTo(450, 130);
      ctx.arc(450, 130, 100, ang, ang + fatias[i] * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = cores[i];
      ctx.fill();
      ang += fatias[i] * Math.PI * 2;
    }
    return true;
  }

  function webgl() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) {
      return false;
    }
  }

  var ua = navigator.userAgent;
  var m = /Chrome\/(\d+)/.exec(ua);
  var versao = m ? parseInt(m[1], 10) : 0;
  var webview = /; wv\)/.test(ua) || /Version\/[\d.]+ Chrome/.test(ua);

  linha('Navegador', (webview ? 'Android System WebView (app) ' : 'Chrome ') + (versao ? 'versão ' + versao : 'desconhecido'));
  linha('Sistema', (/Android [\d.]+/.exec(ua) || ['?'])[0]);
  linha('Tela', window.innerWidth + ' × ' + window.innerHeight + ' (densidade ' + (window.devicePixelRatio || 1) + ')');
  linha('WebGL (3D)', webgl() ? 'sim' : 'não');
  linha('Recursos modernos', typeof Promise !== 'undefined' && typeof fetch !== 'undefined' && typeof IntersectionObserver !== 'undefined' && typeof ResizeObserver !== 'undefined' ? 'sim' : 'faltando');
  linha('Identificação completa', ua);

  var veredito = document.getElementById('veredito');
  if (!versao) {
    veredito.className = 'diag-veredito diag-alerta';
    veredito.appendChild(document.createTextNode('Navegador não identificado. Confira se os testes abaixo aparecem.'));
  } else if (versao < VERSAO_MINIMA || typeof ResizeObserver === 'undefined') {
    veredito.className = 'diag-veredito diag-alerta';
    veredito.appendChild(
      document.createTextNode(
        'Navegador interno DESATUALIZADO (versão ' + versao + '). Power BI e Looker podem não desenhar gráficos. ' +
          'Atualize o "Android System WebView" na Play Store (Google TV) ou o sistema (Fire TV) e reinicie a TV.'
      )
    );
  } else {
    veredito.className = 'diag-veredito diag-ok';
    veredito.appendChild(document.createTextNode('Navegador interno atualizado (versão ' + versao + '). Se os 2 testes abaixo aparecem, a TV desenha gráficos normalmente.'));
  }

  try {
    testeSvg();
  } catch (e) {
    document.getElementById('testeSvg').appendChild(document.createTextNode('Falhou: ' + e.message));
  }
  try {
    testeCanvas();
  } catch (e) {
    /* área fica vazia */
  }
  setTimeout(function () {
    window.location.reload();
  }, 60000);
})();
