/* SugesconTv - teste de exibição: o mesmo link em 4 iframes com configurações diferentes,
 * para descobrir qual configuração impede o site (ex.: gráficos do Looker) de desenhar.
 * Uso: /teste-iframes?url=https://lookerstudio.google.com/embed/reporting/... (ES5) */
(function () {
  'use strict';
  var m = /[?&]url=([^&]*)/.exec(window.location.search);
  var url = m ? decodeURIComponent(m[1]) : '';
  var aviso = document.getElementById('aviso');
  if (!/^https:\/\//.test(url)) {
    aviso.appendChild(document.createTextNode('Abra este teste com ?url= e o link do relatório (começando com https://).'));
    return;
  }
  var VARIANTES = [
    // 1 e 2 enviam a origem (o resto da TV não envia), para testar se o site passou a exigir isso.
    { nome: '1. Sem nenhuma configuração (envia origem)', at: { referrerpolicy: 'strict-origin-when-cross-origin' } },
    {
      nome: '2. Só sandbox (envia origem)',
      at: { sandbox: 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox', referrerpolicy: 'strict-origin-when-cross-origin' }
    },
    {
      nome: '3. Só no-referrer + allow + acessibilidade',
      at: { referrerpolicy: 'no-referrer', allow: 'autoplay; fullscreen', 'aria-hidden': 'true', tabindex: '-1' }
    },
    {
      nome: '4. Igual à TV (tudo junto)',
      at: {
        sandbox: 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox',
        referrerpolicy: 'no-referrer',
        allow: 'autoplay; fullscreen',
        'aria-hidden': 'true',
        tabindex: '-1',
        scrolling: 'no',
        frameborder: '0'
      }
    }
  ];
  var grade = document.getElementById('grade');
  for (var i = 0; i < VARIANTES.length; i++) {
    var v = VARIANTES[i];
    var celula = document.createElement('div');
    celula.className = 'ti-celula';
    celula.style.left = (i % 2) * 50 + '%';
    celula.style.top = Math.floor(i / 2) * 50 + '%';
    var rotulo = document.createElement('div');
    rotulo.className = 'ti-rotulo';
    rotulo.appendChild(document.createTextNode(v.nome));
    var f = document.createElement('iframe');
    for (var k in v.at) if (v.at.hasOwnProperty(k)) f.setAttribute(k, v.at[k]);
    f.src = url;
    celula.appendChild(rotulo);
    celula.appendChild(f);
    grade.appendChild(celula);
  }
})();
