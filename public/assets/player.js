/* SugesconTv - reprodutor de páginas em sequência.
 * JavaScript ES5 (funciona em navegadores de TV antigos). Usado pela TV e pela prévia do painel.
 *
 * Cada página fica carregada num iframe próprio (dados já baixados), escondido e sem
 * ser desenhado, para poupar a memória de vídeo da TV. Alguns segundos antes da vez
 * dela, a página passa a ser desenhada por trás da atual ("preparando"), para os
 * gráficos montarem; na troca, a página atual some suavemente revelando a próxima.
 * As páginas seguintes são pré-carregadas uma de cada vez, e a recarga a cada X minutos
 * é feita numa cópia escondida que só substitui a antiga quando estiver pronta.
 *
 * var p = new PainelPlayer(elemento, opcoes);
 * p.definirLista(itens);  // itens no formato da API
 * p.iniciar(); p.parar();
 *
 * opcoes:
 *   segundosFixos: número - ignora o tempo de cada página (prévia acelerada)
 *   maxQuadros: número - máximo de páginas mantidas carregadas (padrão 8, mínimo 2)
 *   offline: function() -> true quando sem conexão (só gira entre páginas já carregadas)
 *   aoMostrar: function(pagina) - chamada quando uma página aparece
 *   aoVazio: function(vazio) - chamada quando a lista fica vazia/deixa de estar
 */
(function (global) {
  'use strict';

  var TEMPO_CARGA_MS = 25000;
  var TRANSICAO_MS = 900;
  var VERIFICAR_RECARGA_MS = 30000;
  var LIMITE_PADRAO = 8;
  var PREPARO_MS = 8000; // desenha a próxima página por trás este tempo antes da troca
  var PREPARO_CURTO_MS = 2500; // quando a página acabou de carregar

  function agora() {
    return new Date().getTime();
  }

  // Cria o iframe já com o endereço, antes de entrar na página (evita o "load" do about:blank).
  function novoIframe(palco, url, aoCarregar) {
    var el = document.createElement('iframe');
    el.className = 'pnt-quadro';
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox');
    el.setAttribute('referrerpolicy', 'no-referrer');
    el.setAttribute('allow', 'autoplay; fullscreen');
    el.setAttribute('scrolling', 'no');
    el.setAttribute('frameborder', '0');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-hidden', 'true');
    el.onload = function () {
      el.onload = null;
      aoCarregar(el);
    };
    el.src = url;
    palco.appendChild(el);
    return el;
  }

  function removerIframe(el) {
    if (!el) return;
    el.onload = null;
    try {
      el.src = 'about:blank';
    } catch (e) {
      /* ignora */
    }
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  function montarSequencia(itens, segundosFixos) {
    var seq = [];
    var i, j, item, pg;
    for (i = 0; itens && i < itens.length; i++) {
      item = itens[i];
      if (!item || item.pausado || !item.paginas) continue;
      for (j = 0; j < item.paginas.length; j++) {
        pg = item.paginas[j];
        if (!pg || !pg.url) continue;
        seq.push({
          url: pg.url,
          segundos: segundosFixos || pg.segundos || 30,
          recarregarMs: (item.recarregarMin || 10) * 60000,
          item: i,
          pagina: j,
          nome: item.nome
        });
      }
    }
    return seq;
  }

  function assinatura(seq) {
    var partes = [];
    for (var i = 0; i < seq.length; i++) partes.push(seq[i].url + '|' + seq[i].segundos + '|' + seq[i].recarregarMs);
    return partes.join('\n');
  }

  function PainelPlayer(palco, opcoes) {
    this.palco = palco;
    this.op = opcoes || {};
    this.limite = Math.max(2, this.op.maxQuadros || LIMITE_PADRAO);
    this.seq = [];
    this.pendente = null;
    this.pos = -1;
    this.rodando = false;
    this.quadros = {}; // url -> { url, el, pronto, inicioCarga, carregadoEm, mostradoEm, recarregarMs, novo }
    this.visivel = null;
    this.esperando = null;
    this.timerPagina = null;
    this.timerEspera = null;
    this.timerRecarga = null;
    this.timerPreparo = null;
  }

  PainelPlayer.montarSequencia = montarSequencia;

  // Novas listas são aplicadas ao fim da página atual.
  PainelPlayer.prototype.definirLista = function (itens) {
    var seq = montarSequencia(itens, this.op.segundosFixos);
    if (!this.rodando || this.pos < 0) {
      this.seq = seq;
      this.pendente = null;
      if (this.rodando) this._agendar(0);
      return;
    }
    if (assinatura(seq) !== assinatura(this.seq)) this.pendente = seq;
  };

  PainelPlayer.prototype.iniciar = function () {
    var self = this;
    this.rodando = true;
    this.pos = -1;
    this._agendar(0);
    clearInterval(this.timerRecarga);
    this.timerRecarga = setInterval(function () {
      self._verificarRecargas();
    }, VERIFICAR_RECARGA_MS);
  };

  PainelPlayer.prototype.parar = function () {
    this.rodando = false;
    clearTimeout(this.timerPagina);
    clearTimeout(this.timerEspera);
    clearInterval(this.timerRecarga);
    clearTimeout(this.timerPreparo);
    for (var url in this.quadros) {
      if (this.quadros.hasOwnProperty(url)) this._descartar(this.quadros[url]);
    }
    this.quadros = {};
    this.visivel = null;
    this.esperando = null;
    this.pos = -1;
  };

  PainelPlayer.prototype._agendar = function (ms) {
    var self = this;
    clearTimeout(this.timerPagina);
    this.timerPagina = setTimeout(function () {
      self._avancar();
    }, ms);
  };

  PainelPlayer.prototype._offline = function () {
    return !!(this.op.offline && this.op.offline());
  };

  PainelPlayer.prototype._naSequencia = function (url) {
    for (var i = 0; i < this.seq.length; i++) if (this.seq[i].url === url) return true;
    return false;
  };

  PainelPlayer.prototype._contar = function () {
    var n = 0;
    for (var url in this.quadros) if (this.quadros.hasOwnProperty(url)) n++;
    return n;
  };

  PainelPlayer.prototype._descartar = function (q) {
    removerIframe(q.el);
    removerIframe(q.novo);
    q.el = null;
    q.novo = null;
    q.pronto = false;
    if (this.quadros[q.url] === q) delete this.quadros[q.url];
  };

  // Libera a página carregada há mais tempo sem aparecer (para respeitar o limite de memória).
  PainelPlayer.prototype._liberarUma = function () {
    var escolhido = null;
    for (var url in this.quadros) {
      if (!this.quadros.hasOwnProperty(url)) continue;
      var q = this.quadros[url];
      if (q === this.visivel || q === this.esperando) continue;
      if (!escolhido || q.mostradoEm < escolhido.mostradoEm) escolhido = q;
    }
    if (escolhido) this._descartar(escolhido);
  };

  PainelPlayer.prototype._carregar = function (q) {
    var self = this;
    q.pronto = false;
    q.inicioCarga = agora();
    q.el = novoIframe(this.palco, q.url, function (el) {
      if (q.el !== el || !self.rodando) return;
      q.pronto = true;
      q.carregadoEm = agora();
      if (self.esperando === q) self._mostrarPreparada(q, self.posEsperada);
      self._preaquecer();
    });
  };

  // Obtém (ou começa a carregar) o quadro de uma página da sequência.
  PainelPlayer.prototype._quadro = function (pg) {
    var q = this.quadros[pg.url];
    if (!q) {
      if (this._contar() >= this.limite) this._liberarUma();
      q = { url: pg.url, el: null, novo: null, pronto: false, inicioCarga: 0, carregadoEm: 0, mostradoEm: 0, recarregarMs: pg.recarregarMs };
      this.quadros[pg.url] = q;
      this._carregar(q);
    }
    q.recarregarMs = pg.recarregarMs;
    return q;
  };

  // Pré-carrega a próxima página ainda não carregada, uma de cada vez.
  PainelPlayer.prototype._preaquecer = function () {
    if (!this.rodando || this._offline() || !this.seq.length) return;
    var url, i, pg;
    for (url in this.quadros) {
      if (this.quadros.hasOwnProperty(url) && !this.quadros[url].pronto) return; // já há uma carregando
    }
    if (this._contar() >= this.limite) return;
    for (i = 1; i <= this.seq.length; i++) {
      pg = this.seq[(Math.max(this.pos, 0) + i) % this.seq.length];
      if (!this.quadros[pg.url]) {
        this._quadro(pg);
        return;
      }
    }
  };

  // Recarga em segundo plano: carrega uma cópia escondida e troca quando estiver pronta.
  PainelPlayer.prototype._recarregar = function (q) {
    var self = this;
    if (q.novo || !q.el) return;
    var limiteTempo = setTimeout(function () {
      if (q.novo === novo) {
        removerIframe(novo);
        q.novo = null;
      }
    }, TEMPO_CARGA_MS);
    function trocar(el) {
      if (q.novo !== el || !self.rodando) return;
      var antigo = q.el;
      q.el = el;
      q.novo = null;
      q.carregadoEm = agora();
      if (self.visivel === q) {
        el.className = 'pnt-quadro pnt-visivel';
        antigo.className = 'pnt-quadro pnt-saindo';
        setTimeout(function () {
          removerIframe(antigo);
        }, TRANSICAO_MS + 100);
      } else {
        el.className = antigo.className;
        removerIframe(antigo);
      }
    }
    var novo = novoIframe(this.palco, q.url, function (el) {
      clearTimeout(limiteTempo);
      if (q.novo !== el || !self.rodando) return;
      if (self.visivel === q) {
        // Na tela: desenha a cópia por trás e troca quando os gráficos já montaram.
        el.className = 'pnt-quadro pnt-preparando';
        setTimeout(function () {
          trocar(el);
        }, PREPARO_MS);
      } else {
        trocar(el);
      }
    });
    q.novo = novo;
  };

  PainelPlayer.prototype._verificarRecargas = function () {
    if (!this.rodando || this._offline()) return;
    var maisAtrasado = null;
    var t = agora();
    for (var url in this.quadros) {
      if (!this.quadros.hasOwnProperty(url)) continue;
      var q = this.quadros[url];
      if (q.novo) return; // uma recarga de cada vez
      if (!q.pronto || t - q.carregadoEm < q.recarregarMs) continue;
      if (!maisAtrasado || q.carregadoEm < maisAtrasado.carregadoEm) maisAtrasado = q;
    }
    if (maisAtrasado) this._recarregar(maisAtrasado);
  };

  PainelPlayer.prototype._avancar = function () {
    if (!this.rodando) return;
    var url;
    if (this.pendente) {
      this.seq = this.pendente;
      this.pendente = null;
      for (url in this.quadros) {
        if (this.quadros.hasOwnProperty(url) && this.quadros[url] !== this.visivel && !this._naSequencia(url)) {
          this._descartar(this.quadros[url]);
        }
      }
    }
    if (this.op.aoVazio) this.op.aoVazio(this.seq.length === 0);
    var n = this.seq.length;
    if (!n) {
      if (this.visivel) this._descartar(this.visivel);
      this.visivel = null;
      this.pos = -1;
      this._agendar(5000);
      return;
    }
    var offline = this._offline();
    for (var t = 1; t <= n; t++) {
      var p = this.pos < 0 ? t - 1 : (this.pos + t) % n;
      var q = this.quadros[this.seq[p].url];
      // Sem conexão: só gira entre as páginas que já estão carregadas.
      if (offline && !(q && q.pronto)) continue;
      this._mostrarQuandoPronta(p, 0);
      return;
    }
    this._agendar(10000);
  };

  PainelPlayer.prototype._mostrarQuandoPronta = function (p, tentativas) {
    var self = this;
    var n = this.seq.length;
    var q = this._quadro(this.seq[p]);
    if (q.pronto) {
      this._mostrarPreparada(q, p);
      return;
    }
    // Ainda carregando: a página atual continua na tela até a próxima ficar pronta.
    this.esperando = q;
    this.posEsperada = p;
    clearTimeout(this.timerEspera);
    this.timerEspera = setTimeout(function () {
      if (self.esperando !== q) return;
      self.esperando = null;
      // Não carregou em 25 s: descarta e pula para a próxima.
      self._descartar(q);
      if (tentativas + 1 < n) self._mostrarQuandoPronta((p + 1) % n, tentativas + 1);
      else self._agendar(10000);
    }, Math.max(1000, TEMPO_CARGA_MS - (agora() - q.inicioCarga)));
  };

  // Garante que a página foi desenhada por trás antes de aparecer (gráficos já montados).
  PainelPlayer.prototype._mostrarPreparada = function (q, p) {
    var self = this;
    if (!this.visivel || q === this.visivel || /pnt-preparando/.test(q.el.className)) {
      this._exibir(q, p);
      return;
    }
    q.el.className = 'pnt-quadro pnt-preparando';
    this.esperando = q;
    this.posEsperada = p;
    clearTimeout(this.timerEspera);
    this.timerEspera = setTimeout(function () {
      if (self.esperando === q && q.el) self._exibir(q, p);
    }, PREPARO_CURTO_MS);
  };

  // Alguns segundos antes da troca, começa a desenhar a próxima página por trás da atual.
  PainelPlayer.prototype._prepararProxima = function () {
    if (!this.rodando) return;
    var seq = this.pendente || this.seq;
    if (!seq.length) return;
    var pg = seq[(this.pos + 1) % seq.length];
    var q = pg && this.quadros[pg.url];
    if (q && q.pronto && q.el && q !== this.visivel) q.el.className = 'pnt-quadro pnt-preparando';
  };

  PainelPlayer.prototype._exibir = function (q, p) {
    var self = this;
    clearTimeout(this.timerEspera);
    clearTimeout(this.timerPreparo);
    this.esperando = null;
    // Páginas que estavam sendo preparadas e não vão aparecer voltam a ficar escondidas.
    for (var url in this.quadros) {
      if (!this.quadros.hasOwnProperty(url)) continue;
      var outro = this.quadros[url];
      if (outro !== q && outro !== this.visivel && outro.el && /pnt-preparando/.test(outro.el.className)) {
        outro.el.className = 'pnt-quadro';
      }
    }
    var anterior = this.visivel;
    var pg = this.seq[p];
    this.pos = p;
    if (anterior !== q) {
      q.el.className = 'pnt-quadro pnt-visivel';
      this.visivel = q;
      if (anterior && anterior.el) {
        var el = anterior.el;
        el.className = 'pnt-quadro pnt-saindo';
        setTimeout(function () {
          if (self.visivel === anterior || anterior.el !== el) return;
          if (self.quadros[anterior.url] === anterior && self._naSequencia(anterior.url)) el.className = 'pnt-quadro';
          else self._descartar(anterior);
        }, TRANSICAO_MS + 100);
      }
    }
    q.mostradoEm = agora();
    if (this.op.aoMostrar) this.op.aoMostrar(pg);
    this._agendar(pg.segundos * 1000);
    this.timerPreparo = setTimeout(function () {
      self._prepararProxima();
    }, Math.max(0, pg.segundos * 1000 - PREPARO_MS));
    this._preaquecer();
  };

  global.PainelPlayer = PainelPlayer;
})(window);
