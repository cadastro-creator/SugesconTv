// Painel de gestão do SugesconTv.
import { TIPOS, MODELOS } from './links.js';
import { qrSvg } from './qr.js';

const $ = (id) => document.getElementById(id);

const AJUDA_PAGINA = {
  looker:
    'No Looker Studio, abra o relatório, clique na página desejada e copie o endereço da barra do navegador (ele termina com /page/…). Cole aqui.',
  powerbi:
    'Abra o relatório no Power BI (app.powerbi.com), clique na página desejada e copie o endereço da barra (termina com o nome da página, ex.: /ReportSection1a2b…). Cole aqui: o painel usa só o nome da página junto com o seu link público “Publicar na Web”.',
  planilha:
    'Na planilha, clique na aba desejada e copie o endereço da barra (termina com #gid=número). Cole aqui. A planilha precisa estar publicada inteira (Arquivo → Compartilhar → Publicar na Web → Documento inteiro).',
  site: 'Cole o endereço de outra página (começando com https://).'
};

const estado = {
  telas: [],
  tela: null,
  sel: null, // { item, pagina }
  emPe: false,
  sequencia: false,
  timerSalvar: null,
  salvando: null
};

// ---------- utilidades ----------

function h(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : String(f));
  return el;
}

function mensagem(el, texto, tipo = 'erro') {
  el.textContent = texto || '';
  el.className = 'msg ' + (texto ? tipo : '');
}

async function api(metodo, caminho, corpo) {
  const op = { method: metodo, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (metodo !== 'GET') op.body = JSON.stringify(corpo || {});
  let r;
  try {
    r = await fetch(caminho, op);
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet.');
  }
  let dados = {};
  try {
    dados = await r.json();
  } catch {
    /* sem corpo */
  }
  if (r.status === 401 && caminho !== '/api/login') {
    mostrar('telaLogin');
    throw new Error(dados.erro || 'Faça login novamente.');
  }
  if (!r.ok) throw new Error(dados.erro || 'Erro ' + r.status);
  return dados;
}

function linkTv(codigo) {
  return `${location.origin}/tv?tela=${codigo}`;
}

function novoId() {
  return Math.random().toString(36).slice(2, 10);
}

function mostrar(id) {
  for (const s of ['telaCarregando', 'telaLogin', 'telaLista', 'telaEditor']) $(s).hidden = s !== id;
  $('sair').hidden = id === 'telaLogin' || id === 'telaCarregando';
  if (id !== 'telaEditor') pararPrevia();
  if (id === 'telaLogin') setTimeout(() => $('senha').focus(), 0);
}

// ---------- login ----------

$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  mensagem($('erroLogin'), '');
  try {
    await api('POST', '/api/login', { senha: $('senha').value });
    $('senha').value = '';
    await abrirLista();
  } catch (err) {
    mensagem($('erroLogin'), err.message);
  }
});

$('sair').addEventListener('click', async () => {
  await salvarAgora();
  try {
    await api('POST', '/api/logout');
  } finally {
    mostrar('telaLogin');
  }
});

// ---------- lista de telas ----------

async function abrirLista() {
  await salvarAgora();
  mensagem($('msgLista'), '');
  mostrar('telaLista');
  try {
    estado.telas = (await api('GET', '/api/telas')).telas;
  } catch (err) {
    mensagem($('msgLista'), err.message);
    return;
  }
  desenharLista();
  if (location.hash.startsWith('#tela=')) history.replaceState(null, '', location.pathname);
}

function desenharLista() {
  const lista = $('listaTelas');
  lista.replaceChildren();
  if (!estado.telas.length) {
    lista.append(h('p', { class: 'vazio' }, 'Nenhuma tela ainda. Crie a primeira acima.'));
    return;
  }
  for (const t of estado.telas) {
    const link = linkTv(t.codigo);
    lista.append(
      h(
        'div',
        { class: 'cartao tela' },
        h(
          'div',
          { class: 'info' },
          h('h3', {}, t.nome),
          h('div', {}, 'Código: ', h('span', { class: 'codigo' }, t.codigo)),
          h('a', { class: 'link-tv', href: link, target: '_blank', rel: 'noopener noreferrer' }, link),
          h(
            'div',
            { class: 'acoes' },
            h('button', { class: 'botao principal pequeno', type: 'button', onclick: () => abrirEditor(t.codigo) }, 'Editar'),
            h('button', { class: 'botao pequeno', type: 'button', onclick: (e) => copiar(link, e.currentTarget) }, 'Copiar link'),
            h('button', { class: 'botao pequeno', type: 'button', onclick: () => renomear(t) }, 'Renomear'),
            h('button', { class: 'botao pequeno perigo', type: 'button', onclick: () => excluir(t) }, 'Excluir')
          )
        ),
        h('div', { class: 'qr', title: 'Aponte a câmera do celular para abrir o link' }, qrSvg(link, 120))
      )
    );
  }
}

async function copiar(texto, botao) {
  try {
    await navigator.clipboard.writeText(texto);
    const antes = botao.textContent;
    botao.textContent = 'Copiado!';
    setTimeout(() => (botao.textContent = antes), 1500);
  } catch {
    prompt('Copie o link:', texto);
  }
}

$('formNova').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const t = await api('POST', '/api/telas', { nome: $('nomeNova').value });
    $('nomeNova').value = '';
    await abrirEditor(t.codigo);
  } catch (err) {
    mensagem($('msgLista'), err.message);
  }
});

async function renomear(t) {
  const nome = prompt('Novo nome da tela:', t.nome);
  if (!nome || !nome.trim()) return;
  try {
    await api('PUT', '/api/telas/' + t.codigo, { nome });
    await abrirLista();
  } catch (err) {
    mensagem($('msgLista'), err.message);
  }
}

async function excluir(t) {
  if (!confirm(`Excluir a tela "${t.nome}"? As TVs com o código ${t.codigo} deixarão de exibir.`)) return;
  try {
    await api('DELETE', '/api/telas/' + t.codigo);
    await abrirLista();
  } catch (err) {
    mensagem($('msgLista'), err.message);
  }
}

// ---------- editor ----------

async function abrirEditor(codigo) {
  try {
    estado.tela = await api('GET', '/api/telas/' + codigo);
  } catch (err) {
    mensagem($('msgLista'), err.message);
    return;
  }
  history.replaceState(null, '', '#tela=' + codigo);
  estado.sel = estado.tela.itens.length ? { item: 0, pagina: 0 } : null;
  $('editorNome').textContent = estado.tela.nome;
  status('');
  mostrar('telaEditor');
  desenharItens();
  atualizarPrevia();
}

$('voltar').addEventListener('click', () => abrirLista());

function status(texto, erro = false) {
  $('status').textContent = texto;
  $('status').className = 'status' + (erro ? ' erro' : '');
}

function alterado() {
  status('Alterações não salvas…');
  clearTimeout(estado.timerSalvar);
  estado.timerSalvar = setTimeout(salvarAgora, 900);
}

async function salvarAgora() {
  if (!estado.timerSalvar || !estado.tela) return estado.salvando;
  clearTimeout(estado.timerSalvar);
  estado.timerSalvar = null;
  const { codigo, itens } = estado.tela;
  status('Salvando…');
  estado.salvando = api('PUT', '/api/telas/' + codigo, { itens })
    .then(() => status('✓ Salvo. As TVs atualizam em até 1 minuto.'))
    .catch((err) => status('Não foi possível salvar: ' + err.message, true));
  return estado.salvando;
}

window.addEventListener('beforeunload', (e) => {
  if (estado.timerSalvar) {
    salvarAgora();
    e.preventDefault();
  }
});

function selecionar(item, pagina) {
  estado.sel = { item, pagina };
  if (estado.sequencia) pararPrevia();
  desenharItens();
  atualizarPrevia();
}

function mover(i, delta) {
  const itens = estado.tela.itens;
  const j = i + delta;
  if (j < 0 || j >= itens.length) return;
  [itens[i], itens[j]] = [itens[j], itens[i]];
  if (estado.sel && estado.sel.item === i) estado.sel.item = j;
  else if (estado.sel && estado.sel.item === j) estado.sel.item = i;
  alterado();
  desenharItens();
}

function removerItem(i) {
  const item = estado.tela.itens[i];
  if (!confirm(`Remover "${item.nome}" desta tela?`)) return;
  estado.tela.itens.splice(i, 1);
  estado.sel = estado.tela.itens.length ? { item: Math.min(i, estado.tela.itens.length - 1), pagina: 0 } : null;
  alterado();
  desenharItens();
  atualizarPrevia();
}

function removerPagina(i, j) {
  estado.tela.itens[i].paginas.splice(j, 1);
  estado.sel = { item: i, pagina: Math.max(0, j - 1) };
  alterado();
  desenharItens();
  atualizarPrevia();
}

function numero(valor, padrao, min, max) {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
}

function encurtar(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

function desenharItens() {
  const lista = $('itens');
  lista.replaceChildren();
  const itens = estado.tela.itens;
  if (!itens.length) {
    lista.append(h('p', { class: 'cartao vazio' }, 'Esta tela ainda não tem dashboards. Cole um link abaixo para começar.'));
  }
  itens.forEach((item, i) => {
    const sel = estado.sel && estado.sel.item === i;
    const msgPagina = h('p', { class: 'msg', role: 'alert' });
    const entradaPagina = h('input', { type: 'url', placeholder: 'Cole o link de outra página do mesmo relatório', required: true });
    lista.append(
      h(
        'div',
        { class: 'cartao item' + (item.pausado ? ' pausado' : '') + (sel ? ' selecionado' : ''), 'data-item': i },
        h(
          'div',
          { class: 'item-topo' },
          h('span', { class: 'etiqueta ' + item.tipo }, TIPOS[item.tipo] || item.tipo),
          h('input', {
            class: 'nome',
            type: 'text',
            maxLength: 80,
            value: item.nome,
            'aria-label': 'Nome do item',
            oninput: (e) => {
              item.nome = e.target.value;
              alterado();
            }
          }),
          h('button', { class: 'botao icone', type: 'button', title: 'Subir', 'aria-label': 'Subir', disabled: i === 0, onclick: () => mover(i, -1) }, '↑'),
          h('button', { class: 'botao icone', type: 'button', title: 'Descer', 'aria-label': 'Descer', disabled: i === itens.length - 1, onclick: () => mover(i, 1) }, '↓'),
          h(
            'button',
            {
              class: 'botao pequeno',
              type: 'button',
              onclick: () => {
                item.pausado = !item.pausado;
                alterado();
                desenharItens();
              }
            },
            item.pausado ? '▶ Retomar' : '⏸ Pausar'
          ),
          h('button', { class: 'botao pequeno perigo', type: 'button', onclick: () => removerItem(i) }, 'Remover')
        ),
        h(
          'div',
          { class: 'item-opcoes' },
          item.pausado ? h('strong', {}, 'Pausado: não aparece na TV.') : null,
          h(
            'label',
            {},
            'Recarregar a cada ',
            h('input', {
              type: 'number',
              min: 1,
              max: 1440,
              value: item.recarregarMin,
              onchange: (e) => {
                item.recarregarMin = numero(e.target.value, 10, 1, 1440);
                e.target.value = item.recarregarMin;
                alterado();
              }
            }),
            ' min'
          )
        ),
        h(
          'ol',
          { class: 'paginas' },
          item.paginas.map((pg, j) =>
            h(
              'li',
              { class: 'pagina' },
              h(
                'button',
                {
                  class: 'botao pequeno' + (sel && estado.sel.pagina === j ? ' ativo' : ''),
                  type: 'button',
                  title: 'Ver na prévia',
                  onclick: () => selecionar(i, j)
                },
                `Página ${j + 1}`
              ),
              h(
                'label',
                {},
                h('input', {
                  type: 'number',
                  min: 5,
                  max: 3600,
                  value: pg.segundos,
                  'aria-label': `Segundos na tela da página ${j + 1}`,
                  onchange: (e) => {
                    pg.segundos = numero(e.target.value, 30, 5, 3600);
                    e.target.value = pg.segundos;
                    alterado();
                  }
                }),
                ' s'
              ),
              h('span', { class: 'url', title: pg.url }, encurtar(pg.url)),
              h(
                'button',
                {
                  class: 'botao icone perigo',
                  type: 'button',
                  title: 'Remover página',
                  'aria-label': `Remover página ${j + 1}`,
                  disabled: item.paginas.length === 1,
                  onclick: () => removerPagina(i, j)
                },
                '✕'
              )
            )
          )
        ),
        h(
          'form',
          {
            class: 'adicionar-pagina em-linha',
            onsubmit: (e) => {
              e.preventDefault();
              adicionarPagina(i, entradaPagina, msgPagina);
            }
          },
          entradaPagina,
          h('button', { class: 'botao pequeno', type: 'submit' }, 'Adicionar página')
        ),
        msgPagina,
        h('details', {}, h('summary', {}, 'Como copiar o link de cada página'), h('p', {}, AJUDA_PAGINA[item.tipo]))
      )
    );
  });
}

async function verificar(url, base) {
  return api('POST', '/api/verificar', { url, base });
}

$('formItem').addEventListener('submit', async (e) => {
  e.preventDefault();
  const entrada = $('linkItem');
  const msg = $('msgItem');
  mensagem(msg, 'Verificando o link…', 'aviso');
  try {
    const r = await verificar(entrada.value);
    if (!r.ok) return mensagem(msg, r.erro);
    estado.tela.itens.push({
      id: novoId(),
      tipo: r.tipo,
      nome: r.nome || TIPOS[r.tipo],
      recarregarMin: 10,
      pausado: false,
      paginas: [{ url: r.url, segundos: 30 }]
    });
    entrada.value = '';
    mensagem(msg, r.aviso || `✓ ${TIPOS[r.tipo]} adicionado. Para mostrar mais páginas, use “Adicionar página” no item.`, r.aviso ? 'aviso' : 'ok');
    alterado();
    selecionar(estado.tela.itens.length - 1, 0);
  } catch (err) {
    mensagem(msg, err.message);
  }
});

async function adicionarPagina(i, entrada, msg) {
  const item = estado.tela.itens[i];
  mensagem(msg, 'Verificando o link…', 'aviso');
  try {
    const r = await verificar(entrada.value, { tipo: item.tipo, url: item.paginas[0].url });
    if (!r.ok) return mensagem(msg, r.erro);
    if (r.tipo !== item.tipo) {
      return mensagem(msg, `Este link é de ${TIPOS[r.tipo]}, e este item é de ${TIPOS[item.tipo]}. Use “Adicionar dashboard”.`);
    }
    if (item.paginas.length >= 30) return mensagem(msg, 'Máximo de 30 páginas por item.');
    item.paginas.push({ url: r.url, segundos: item.paginas[item.paginas.length - 1].segundos || 30 });
    alterado();
    selecionar(i, item.paginas.length - 1);
    const novoMsg = document.querySelector(`[data-item="${i}"] .msg`);
    if (novoMsg) mensagem(novoMsg, r.aviso || '✓ Página adicionada.', r.aviso ? 'aviso' : 'ok');
  } catch (err) {
    mensagem(msg, err.message);
  }
}

for (const m of MODELOS) {
  $('modelos').append(
    h(
      'button',
      {
        class: 'botao pequeno',
        type: 'button',
        onclick: () => {
          estado.tela.itens.push({ id: novoId(), tipo: 'site', nome: m.nome, recarregarMin: 30, pausado: false, paginas: [{ url: m.url, segundos: 30 }] });
          mensagem($('msgItem'), `✓ ${m.nome} adicionado.`, 'ok');
          alterado();
          selecionar(estado.tela.itens.length - 1, 0);
        }
      },
      m.nome
    )
  );
}

// ---------- prévia ----------

const player = new window.PainelPlayer($('previaPalco'), {
  aoMostrar: (pg) => {
    if (estado.sequencia) {
      $('previaLegenda').textContent = `Sequência: ${pg.nome} – página ${pg.pagina + 1}`;
      document.querySelectorAll('.item').forEach((el) => el.classList.toggle('selecionado', Number(el.dataset.item) === pg.item));
    }
  },
  aoVazio: (vazio) => {
    $('previaVazia').hidden = !vazio;
    if (vazio) $('previaVazia').textContent = 'Nenhum item ativo para mostrar.';
  }
});

function ajustarEscala() {
  const moldura = $('previaMoldura');
  const largura = estado.emPe ? 1080 : 1920;
  const escala = moldura.clientWidth / largura;
  $('previaPalco').style.transform = `scale(${escala})`;
}
new ResizeObserver(ajustarEscala).observe($('previaMoldura'));

function pararPrevia() {
  player.parar();
  estado.sequencia = false;
  $('previaSequencia').textContent = '▶ Prévia da sequência';
}

function atualizarPrevia() {
  pararPrevia();
  const tela = estado.tela;
  const item = tela && estado.sel && tela.itens[estado.sel.item];
  const pg = item && item.paginas[estado.sel.pagina];
  $('previaVazia').hidden = !!pg;
  $('previaVazia').textContent = 'Selecione uma página para ver como fica na TV.';
  if (!pg) {
    $('previaLegenda').textContent = '';
    return;
  }
  $('previaLegenda').textContent = `${item.nome} – página ${estado.sel.pagina + 1}${item.pausado ? ' (pausado)' : ''}`;
  player.op.segundosFixos = null;
  player.definirLista([{ nome: item.nome, recarregarMin: item.recarregarMin, paginas: [pg] }]);
  player.iniciar();
}

$('previaSequencia').addEventListener('click', () => {
  if (estado.sequencia) {
    atualizarPrevia();
    desenharItens();
    return;
  }
  player.parar();
  estado.sequencia = true;
  $('previaSequencia').textContent = '■ Parar sequência';
  $('previaVazia').hidden = true;
  $('previaLegenda').textContent = 'Sequência: carregando…';
  player.op.segundosFixos = 5;
  player.definirLista(estado.tela.itens);
  player.iniciar();
});

function definirFormato(emPe) {
  estado.emPe = emPe;
  $('previaMoldura').classList.toggle('em-pe', emPe);
  $('formatoDeitada').classList.toggle('ativo', !emPe);
  $('formatoEmPe').classList.toggle('ativo', emPe);
  ajustarEscala();
}
$('formatoDeitada').addEventListener('click', () => definirFormato(false));
$('formatoEmPe').addEventListener('click', () => definirFormato(true));

// ---------- início ----------

(async () => {
  try {
    await api('GET', '/api/sessao');
  } catch {
    return; // api() já mostrou o login
  }
  const m = location.hash.match(/^#tela=([A-Z0-9]+)$/);
  if (m) await abrirEditor(m[1]);
  else await abrirLista();
})();
