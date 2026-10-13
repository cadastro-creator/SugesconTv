/* Painel na TV - reprodutor de páginas em sequência.
 * JavaScript ES5 (funciona em navegadores de TV antigos). Usado pela TV e pela prévia do painel.
 *
 * var p = new PainelPlayer(elemento, opcoes);
 * p.definirLista(itens);  // itens no formato da API
 * p.iniciar(); p.parar();
 *
 * opcoes:
 *   segundosFixos: número - ignora o tempo de cada página (prévia acelerada)
 *   offline: function() -> true quando sem conexão (mantém a página atual)
 *   aoMostrar: function(pagina) - chamada quando uma página aparece
 *   aoVazio: function(vazio) - chamada quando a lista fica vazia/deixa de estar
 */
(function (global) {
  'use strict';

  var TEMPO_CARGA_MS = 25000;
  var TRANSICAO_MS = 900;

  function agora() {
    return new Date().getTime();
  }

  function criarQuadro(palco) {
    var q = document.createElement('iframe');
    q.className = 'pnt-quadro';
    q.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox');
    q.setAttribute('referrerpolicy', 'no-referrer');
    q.setAttribute('allow', 'autoplay; fullscreen');
    q.setAttribute('scrolling', 'no');
    q.setAttribute('frameborder', '0');
    q.setAttribute('tabindex', '-1');
    q.setAttribute('aria-hidden', 'true');
    palco.appendChild(q);
    return { el: q, url: null, carregadoEm: 0, ficha: 0 };
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
    this.quadros = [criarQuadro(palco), criarQuadro(palco)];
    this.visivel = -1;
    this.seq = [];
    this.pendente = null;
    this.pos = -1;
    this.rodando = false;
    this.timerPagina = null;
    this.timerCarga = null;
    this.timerLimpeza = null;
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
    this.rodando = true;
    this.pos = -1;
    this._agendar(0);
  };

  PainelPlayer.prototype.parar = function () {
    this.rodando = false;
    this._limparTimers();
    for (var i = 0; i < 2; i++) this._esvaziar(this.quadros[i]);
    this.visivel = -1;
    this.pos = -1;
  };

  // Pula imediatamente para a posição indicada da sequência.
  PainelPlayer.prototype.irPara = function (posicao) {
    this._limparTimers();
    this._carregar(posicao, 0);
  };

  PainelPlayer.prototype._limparTimers = function () {
    clearTimeout(this.timerPagina);
    clearTimeout(this.timerCarga);
    this.timerPagina = null;
    this.timerCarga = null;
  };

  PainelPlayer.prototype._agendar = function (ms) {
    var self = this;
    clearTimeout(this.timerPagina);
    this.timerPagina = setTimeout(function () {
      self._avancar();
    }, ms);
  };

  PainelPlayer.prototype._esvaziar = function (q) {
    q.ficha++;
    q.el.onload = null;
    q.url = null;
    q.carregadoEm = 0;
    q.el.className = 'pnt-quadro';
    q.el.src = 'about:blank';
  };

  PainelPlayer.prototype._avancar = function () {
    if (!this.rodando) return;
    if (this.pendente) {
      this.seq = this.pendente;
      this.pendente = null;
    }
    if (this.op.aoVazio) this.op.aoVazio(this.seq.length === 0);
    if (!this.seq.length) {
      if (this.visivel >= 0) this._esvaziar(this.quadros[this.visivel]);
      this.visivel = -1;
      this.pos = -1;
      this._agendar(5000);
      return;
    }
    // Sem conexão: mantém a última página carregada e tenta de novo depois.
    if (this.visivel >= 0 && this.op.offline && this.op.offline()) {
      this._agendar(10000);
      return;
    }
    var prox = this.pos + 1;
    if (prox >= this.seq.length || prox < 0) prox = 0;
    this._carregar(prox, 0);
  };

  PainelPlayer.prototype._carregar = function (posicao, tentativas) {
    var self = this;
    var pg = this.seq[posicao];
    if (!pg) return this._agendar(1000);
    var atual = this.visivel >= 0 ? this.quadros[this.visivel] : null;

    // Mesma página ainda "fresca": não recarrega (respeita "recarregar a cada X minutos").
    if (atual && atual.url === pg.url && agora() - atual.carregadoEm < pg.recarregarMs) {
      this.pos = posicao;
      if (this.op.aoMostrar) this.op.aoMostrar(pg);
      this._agendar(pg.segundos * 1000);
      return;
    }

    var oculto = this.quadros[this.visivel === 0 ? 1 : 0];
    clearTimeout(this.timerLimpeza);
    oculto.ficha++;
    var ficha = oculto.ficha;
    oculto.url = pg.url;
    oculto.el.className = 'pnt-quadro';
    oculto.el.onload = function () {
      if (ficha !== oculto.ficha || !self.rodando) return;
      oculto.el.onload = null;
      clearTimeout(self.timerCarga);
      oculto.carregadoEm = agora();
      self._mostrar(oculto);
      self.pos = posicao;
      if (self.op.aoMostrar) self.op.aoMostrar(pg);
      self._agendar(pg.segundos * 1000);
    };
    clearTimeout(this.timerCarga);
    this.timerCarga = setTimeout(function () {
      if (ficha !== oculto.ficha || !self.rodando) return;
      // Não carregou em 25 s: pula para a próxima, mantendo a atual na tela.
      self._esvaziar(oculto);
      if (tentativas + 1 < self.seq.length) {
        self._carregar((posicao + 1) % self.seq.length, tentativas + 1);
      } else {
        self._agendar(10000);
      }
    }, TEMPO_CARGA_MS);
    oculto.el.src = pg.url;
  };

  PainelPlayer.prototype._mostrar = function (q) {
    var self = this;
    var anterior = this.visivel >= 0 ? this.quadros[this.visivel] : null;
    q.el.className = 'pnt-quadro pnt-visivel';
    this.visivel = q === this.quadros[0] ? 0 : 1;
    if (anterior && anterior !== q) {
      anterior.el.className = 'pnt-quadro pnt-saindo';
      // Libera a memória da página anterior depois da transição.
      this.timerLimpeza = setTimeout(function () {
        if (self.quadros[self.visivel] !== anterior) self._esvaziar(anterior);
      }, TRANSICAO_MS + 100);
    }
  };

  global.PainelPlayer = PainelPlayer;
})(window);
