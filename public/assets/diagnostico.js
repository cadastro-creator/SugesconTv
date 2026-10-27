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
  // Teste 3: cada tipo de forma separado, numerado, para descobrir o que a TV não pinta.
  function forma(numero, nome, desenhar, canvas) {
    var caixa = document.createElement('div');
    caixa.className = 'diag-forma';
    var alvo;
    if (canvas) {
      alvo = document.createElement('canvas');
      alvo.width = 100;
      alvo.height = 100;
    } else {
      alvo = svg('svg', { viewBox: '0 0 100 100' });
    }
    caixa.appendChild(alvo);
    caixa.appendChild(document.createTextNode(numero + '. ' + nome));
    document.getElementById('formas').appendChild(caixa);
    try {
      desenhar(alvo);
    } catch (e) {
      caixa.appendChild(document.createTextNode(' (erro)'));
    }
  }
  forma(1, 'Quadrado', function (s) {
    s.appendChild(svg('rect', { x: 15, y: 15, width: 70, height: 70, fill: '#f39c12' }));
  });
  forma(2, 'Círculo', function (s) {
    s.appendChild(svg('circle', { cx: 50, cy: 50, r: 38, fill: '#3498db' }));
  });
  forma(3, 'Fatia (arco)', function (s) {
    s.appendChild(svg('path', { d: 'M50 50 L50 10 A40 40 0 0 1 90 50 Z', fill: '#e67e22' }));
  });
  forma(4, 'Curva', function (s) {
    s.appendChild(svg('path', { d: 'M10 80 C30 0 70 0 90 80 Z', fill: '#2ecc71' }));
  });
  forma(5, 'Contorno', function (s) {
    s.appendChild(svg('circle', { cx: 50, cy: 50, r: 36, fill: 'none', stroke: '#f5d58c', 'stroke-width': 10 }));
  });
  forma(6, 'Transparente', function (s) {
    s.appendChild(svg('rect', { x: 15, y: 15, width: 70, height: 70, fill: '#e74c3c', 'fill-opacity': 0.6 }));
  });
  forma(7, 'Canvas círculo', function (c) {
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#9b59b6';
    ctx.beginPath();
    ctx.arc(50, 50, 38, 0, Math.PI * 2);
    ctx.fill();
  }, true);
  forma(8, 'Animado', function (s) {
    var r = svg('rect', { x: 15, y: 85, width: 70, height: 0, fill: '#1abc9c' });
    s.appendChild(r);
    var inicio = null;
    function passo(t) {
      if (!inicio) inicio = t;
      var k = Math.min(1, (t - inicio) / 1500);
      r.setAttribute('height', 70 * k);
      r.setAttribute('y', 85 - 70 * k);
      if (k < 1) window.requestAnimationFrame(passo);
    }
    if (window.requestAnimationFrame) window.requestAnimationFrame(passo);
  });

  setTimeout(function () {
    window.location.reload();
  }, 60000);
})();
