/* SugesconTv - tela de cotações (/cotacoes?ativos=cobre,aluminio,dolar). ES5 para TVs antigas. */
(function () {
  'use strict';

  var ATUALIZAR_MS = 10 * 60000;
  var NS = 'http://www.w3.org/2000/svg';
  var CORES = { cobre: '#f5a623', aluminio: '#7fd3ea', dolar: '#2ecc71' };
  var ultimo = null;

  function parametro(nome) {
    var m = new RegExp('[?&]' + nome + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // 14610.5 -> "14.610,50" (sem depender de Intl, que falta em TVs antigas)
  function numero(v, casas) {
    var neg = v < 0;
    var partes = Math.abs(v).toFixed(casas).split('.');
    var inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + inteiro + (partes[1] ? ',' + partes[1] : '');
  }

  function dataCurta(ms) {
    var d = new Date(ms);
    return (d.getDate() < 10 ? '0' : '') + d.getDate() + '/' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
  }

  function hora(iso) {
    var d = new Date(iso);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.appendChild(document.createTextNode(texto));
    return e;
  }

  function svg(tag, atributos) {
    var e = document.createElementNS(NS, tag);
    for (var k in atributos) if (atributos.hasOwnProperty(k)) e.setAttribute(k, atributos[k]);
    return e;
  }

  function grafico(ativo, cor) {
    var pts = ativo.historico;
    var min = Infinity;
    var max = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].v < min) min = pts[i].v;
      if (pts[i].v > max) max = pts[i].v;
    }
    var folga = (max - min) * 0.08 || max * 0.01 || 1;
    var baixo = min - folga;
    var alto = max + folga;
    var L = 1000;
    var A = 300;
    var linha = '';
    for (i = 0; i < pts.length; i++) {
      var x = pts.length > 1 ? (i / (pts.length - 1)) * L : L / 2;
      var y = A - ((pts[i].v - baixo) / (alto - baixo)) * A;
      linha += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    var raiz = svg('svg', { viewBox: '0 0 ' + L + ' ' + A, preserveAspectRatio: 'none' });
    var defs = svg('defs', {});
    var grad = svg('linearGradient', { id: 'g-' + ativo.id, x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svg('stop', { offset: '0', 'stop-color': cor, 'stop-opacity': '0.45' }));
    grad.appendChild(svg('stop', { offset: '1', 'stop-color': cor, 'stop-opacity': '0' }));
    defs.appendChild(grad);
    raiz.appendChild(defs);
    raiz.appendChild(svg('path', { d: linha + 'L' + L + ' ' + A + 'L0 ' + A + 'Z', fill: 'url(#g-' + ativo.id + ')', stroke: 'none' }));
    raiz.appendChild(
      svg('path', { d: linha, fill: 'none', stroke: cor, 'stroke-width': '3', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' })
    );
    return { svg: raiz, min: min, max: max };
  }

  function desenhar(dados) {
    var area = document.getElementById('ativos');
    while (area.firstChild) area.removeChild(area.firstChild);
    for (var i = 0; i < dados.ativos.length; i++) {
      var a = dados.ativos[i];
      var cor = CORES[a.id] || '#4f9cff';
      var metal = a.unidade === 'US$/t';
      var casas = metal ? 0 : 4;
      var linha = el('section', 'cot-linha');

      var esquerda = el('div', 'cot-grafico');
      var titulo = el('div', 'cot-titulo');
      var ponto = el('span', 'cot-ponto');
      ponto.style.backgroundColor = cor;
      titulo.appendChild(ponto);
      titulo.appendChild(document.createTextNode(a.nome + (metal ? ' (US$/t)' : ' (R$)')));
      esquerda.appendChild(titulo);
      var g = grafico(a, cor);
      var caixa = el('div', 'cot-svg');
      caixa.appendChild(g.svg);
      esquerda.appendChild(caixa);
      esquerda.appendChild(el('div', 'cot-eixo cot-max', numero(g.max, casas)));
      esquerda.appendChild(el('div', 'cot-eixo cot-min', numero(g.min, casas)));
      var datas = el('div', 'cot-datas');
      datas.appendChild(el('span', '', dataCurta(a.historico[0].t)));
      datas.appendChild(el('span', '', dataCurta(a.historico[a.historico.length - 1].t)));
      esquerda.appendChild(datas);
      linha.appendChild(esquerda);

      var direita = el('div', 'cot-valores');
      var preco = el('div', 'cot-preco', (metal ? 'US$ ' : 'R$ ') + numero(a.preco, metal ? 0 : 4));
      if (metal) preco.appendChild(el('span', 'cot-unidade', ' /t'));
      direita.appendChild(preco);
      if (metal) {
        var sec = el('div', 'cot-secundario', 'R$ ' + numero(a.brlKg, 2));
        sec.appendChild(el('span', 'cot-unidade', ' /kg'));
        direita.appendChild(sec);
      }
      var alta = a.variacao >= 0;
      direita.appendChild(el('div', 'cot-variacao ' + (alta ? 'cot-alta' : 'cot-baixa'), (alta ? '▲ ' : '▼ ') + numero(Math.abs(a.variacao), 2) + '% no dia'));
      linha.appendChild(direita);
      area.appendChild(linha);
    }
    var rodape = document.getElementById('rodape');
    while (rodape.firstChild) rodape.removeChild(rodape.firstChild);
    rodape.appendChild(
      document.createTextNode(
        'Referência: contratos futuros COMEX (cobre convertido de libra para tonelada) · dólar R$ ' +
          numero(dados.dolar, 4) +
          ' · atualizado às ' +
          hora(dados.atualizadoEm)
      )
    );
    if (dados.atrasado) rodape.appendChild(el('span', 'cot-aviso', ' · última cotação disponível'));
  }

  function aviso(texto) {
    var rodape = document.getElementById('rodape');
    if (!ultimo) {
      rodape.innerHTML = '';
      rodape.appendChild(el('span', 'cot-aviso', texto));
    }
  }

  function buscar() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/cotacoes?ativos=' + encodeURIComponent(parametro('ativos') || 'cobre,aluminio,dolar'), true);
    xhr.timeout = 20000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try {
          ultimo = JSON.parse(xhr.responseText);
          desenhar(ultimo);
          return;
        } catch (e) {
          /* resposta inválida */
        }
      }
      aviso('Cotações indisponíveis no momento. Tentando de novo…');
      setTimeout(buscar, 60000);
    };
    xhr.send();
  }

  buscar();
  setInterval(buscar, ATUALIZAR_MS);
})();
