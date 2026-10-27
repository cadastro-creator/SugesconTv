import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tratar } from '../src/api.js';
import { analisarCabecalhos, verificarExibicao } from '../src/verificar.js';
import { criarKvMemoria } from '../scripts/kv-memoria.mjs';

const ORIGEM = 'https://painel.exemplo.com';
const SENHA = 'senha-de-teste';

function ambiente() {
  return { PAINEL_KV: criarKvMemoria(), ADMIN_PASSWORD: SENHA };
}

function pedir(env, metodo, caminho, { corpo, cookie, ip = '1.1.1.1', origem = ORIGEM, buscar } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (cookie) headers.cookie = cookie;
  if (corpo !== undefined) headers['content-type'] = 'application/json';
  if (metodo !== 'GET' && origem) headers.origin = origem;
  const req = new Request(ORIGEM + caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  return tratar(req, env, { buscar });
}

async function entrar(env) {
  const r = await pedir(env, 'POST', '/api/login', { corpo: { senha: SENHA } });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

const ITEM = {
  tipo: 'looker',
  nome: 'Vendas',
  recarregarMin: 10,
  paginas: [
    { url: 'https://lookerstudio.google.com/embed/reporting/R1/page/P1', segundos: 30 },
    { url: 'https://lookerstudio.google.com/embed/reporting/R1/page/P2', segundos: 45 }
  ]
};

test('login: senha correta cria cookie seguro de 12 h; senha errada é recusada', async () => {
  const env = ambiente();
  const ok = await pedir(env, 'POST', '/api/login', { corpo: { senha: SENHA } });
  assert.equal(ok.status, 200);
  const c = ok.headers.get('set-cookie');
  for (const parte of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=43200', 'Path=/']) assert.ok(c.includes(parte), parte);
  const ruim = await pedir(env, 'POST', '/api/login', { corpo: { senha: 'errada' } });
  assert.equal(ruim.status, 401);
  assert.equal((await ruim.json()).erro, 'Senha incorreta.');
});

test('login: limite de 10 tentativas a cada 15 min por IP', async () => {
  const env = ambiente();
  for (let i = 0; i < 10; i++) {
    const r = await pedir(env, 'POST', '/api/login', { corpo: { senha: 'x' + i }, ip: '9.9.9.9' });
    assert.equal(r.status, 401);
  }
  const bloqueado = await pedir(env, 'POST', '/api/login', { corpo: { senha: SENHA }, ip: '9.9.9.9' });
  assert.equal(bloqueado.status, 429);
  assert.match((await bloqueado.json()).erro, /Aguarde/);
  // Outro IP continua podendo entrar.
  const outro = await pedir(env, 'POST', '/api/login', { corpo: { senha: SENHA }, ip: '8.8.8.8' });
  assert.equal(outro.status, 200);
  // Passada a janela, volta a funcionar.
  const chave = 'tentativas:9.9.9.9';
  const reg = JSON.parse(env.PAINEL_KV.dados[chave].valor);
  reg.inicio -= 15 * 60 + 1;
  env.PAINEL_KV.dados[chave].valor = JSON.stringify(reg);
  assert.equal((await pedir(env, 'POST', '/api/login', { corpo: { senha: SENHA }, ip: '9.9.9.9' })).status, 200);
});

test('sessão: sem cookie, cookie adulterado ou vencido não acessa', async () => {
  const env = ambiente();
  assert.equal((await pedir(env, 'GET', '/api/telas')).status, 401);
  const cookie = await entrar(env);
  assert.equal((await pedir(env, 'GET', '/api/sessao', { cookie })).status, 200);
  const [nome, valor] = cookie.split('=');
  const [exp, ass] = valor.split('.');
  assert.equal((await pedir(env, 'GET', '/api/sessao', { cookie: `${nome}=${Number(exp) + 999}.${ass}` })).status, 401);
  assert.equal((await pedir(env, 'GET', '/api/sessao', { cookie: `${nome}=1.${ass}` })).status, 401);
  // Trocar a senha invalida as sessões antigas.
  env.ADMIN_PASSWORD = 'nova-senha';
  assert.equal((await pedir(env, 'GET', '/api/sessao', { cookie })).status, 401);
});

test('segurança: recusa envio de outra origem e corpo que não é JSON', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const r = await pedir(env, 'POST', '/api/telas', { corpo: { nome: 'X' }, cookie, origem: 'https://malicioso.com' });
  assert.equal(r.status, 403);
  const req = new Request(ORIGEM + '/api/telas', { method: 'POST', headers: { cookie, 'content-type': 'text/plain' }, body: 'nome=X' });
  assert.equal((await tratar(req, env)).status, 415);
});

test('telas: criar, listar, renomear, salvar itens e excluir', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const criada = await pedir(env, 'POST', '/api/telas', { corpo: { nome: 'Recepção' }, cookie });
  assert.equal(criada.status, 201);
  const tela = await criada.json();
  assert.match(tela.codigo, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.deepEqual(tela.itens, []);

  await pedir(env, 'POST', '/api/telas', { corpo: { nome: 'Almoxarifado' }, cookie });
  const lista = await (await pedir(env, 'GET', '/api/telas', { cookie })).json();
  assert.deepEqual(lista.telas.map((t) => t.nome), ['Almoxarifado', 'Recepção']);

  const ren = await pedir(env, 'PUT', '/api/telas/' + tela.codigo, { corpo: { nome: 'Recepção 1º andar' }, cookie });
  assert.equal((await ren.json()).nome, 'Recepção 1º andar');

  const salva = await pedir(env, 'PUT', '/api/telas/' + tela.codigo, { corpo: { itens: [ITEM, { ...ITEM, nome: 'Pausado', pausado: true }] }, cookie });
  assert.equal(salva.status, 200);
  const dados = await salva.json();
  assert.equal(dados.itens.length, 2);
  assert.equal(dados.itens[0].paginas[1].segundos, 45);
  assert.equal(dados.itens[1].pausado, true);

  const del = await pedir(env, 'DELETE', '/api/telas/' + tela.codigo, { corpo: {}, cookie });
  assert.equal(del.status, 200);
  assert.equal((await pedir(env, 'GET', '/api/telas/' + tela.codigo, { cookie })).status, 404);
});

test('telas: itens inválidos são recusados e valores fora da faixa são ajustados', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const { codigo } = await (await pedir(env, 'POST', '/api/telas', { corpo: { nome: 'T' }, cookie })).json();
  const ruim = await pedir(env, 'PUT', '/api/telas/' + codigo, {
    corpo: { itens: [{ ...ITEM, paginas: [{ url: 'http://exemplo.com' }] }] },
    cookie
  });
  assert.equal(ruim.status, 400);
  assert.match((await ruim.json()).erro, /https/);
  const ajustado = await pedir(env, 'PUT', '/api/telas/' + codigo, {
    corpo: { itens: [{ ...ITEM, recarregarMin: 0, paginas: [{ url: 'https://exemplo.com/', segundos: 1 }, { url: 'https://exemplo.com/b' }] }] },
    cookie
  });
  const it = (await ajustado.json()).itens[0];
  assert.equal(it.recarregarMin, 5);
  assert.equal(it.paginas[0].segundos, 5);
  assert.equal(it.paginas[1].segundos, 30);
});

test('TV: leitura pública sem login, somente GET', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const { codigo } = await (await pedir(env, 'POST', '/api/telas', { corpo: { nome: 'TV' }, cookie })).json();
  await pedir(env, 'PUT', '/api/telas/' + codigo, { corpo: { itens: [ITEM] }, cookie });
  const r = await pedir(env, 'GET', '/api/tv/' + codigo.toLowerCase());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const dados = await r.json();
  assert.equal(dados.nome, 'TV');
  assert.equal(dados.itens[0].paginas.length, 2);
  assert.equal((await pedir(env, 'GET', '/api/tv/NAOEXISTE')).status, 404);
  assert.equal((await pedir(env, 'DELETE', '/api/tv/' + codigo, { corpo: {} })).status, 405);
});

test('configuração ausente gera mensagens claras', async () => {
  const semKv = await pedir({ ADMIN_PASSWORD: SENHA }, 'GET', '/api/tv/ABC123');
  assert.match((await semKv.json()).erro, /PAINEL_KV/);
  const semSenha = await pedir({ PAINEL_KV: criarKvMemoria() }, 'POST', '/api/login', { corpo: { senha: 'x' } });
  assert.match((await semSenha.json()).erro, /ADMIN_PASSWORD/);
});

function buscarFalso(respostas) {
  const chamadas = [];
  const fn = async (url, op) => {
    chamadas.push({ url, op });
    const r = respostas[url];
    if (!r) throw new Error('rede');
    return new Response('<html></html>', { status: r.status || 200, headers: r.headers || {} });
  };
  fn.chamadas = chamadas;
  return fn;
}

test('verificar: converte o link e aceita site que permite exibição', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const buscar = buscarFalso({ 'https://app.powerbi.com/view?r=abc&navContentPaneEnabled=false&filterPaneEnabled=false': {} });
  const r = await (await pedir(env, 'POST', '/api/verificar', { corpo: { url: 'https://app.powerbi.com/view?r=abc' }, cookie, buscar })).json();
  assert.equal(r.ok, true);
  assert.equal(r.tipo, 'powerbi');
  assert.equal(r.nome, 'Power BI');
  assert.equal(buscar.chamadas[0].op.redirect, 'manual');
});

test('verificar: bloqueia X-Frame-Options e frame-ancestors com a mensagem combinada', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const buscar = buscarFalso({
    'https://a.com/': { headers: { 'x-frame-options': 'SAMEORIGIN' } },
    'https://b.com/': { headers: { 'content-security-policy': "default-src 'self'; frame-ancestors 'self' https://parceiro.com" } }
  });
  for (const url of ['https://a.com/', 'https://b.com/']) {
    const r = await (await pedir(env, 'POST', '/api/verificar', { corpo: { url }, cookie, buscar })).json();
    assert.equal(r.ok, false, url);
    assert.equal(r.erro, 'Este site não permite exibição em painéis. Use um widget de incorporação (ex.: TradingView) ou outro site.');
  }
});

test('verificar: segue até 3 redirecionamentos só para https públicos', async () => {
  const destino = { headers: {} };
  const ok = await verificarExibicao(
    'https://r.com/1',
    ORIGEM,
    buscarFalso({
      'https://r.com/1': { status: 301, headers: { location: '/2' } },
      'https://r.com/2': { status: 302, headers: { location: 'https://s.com/3' } },
      'https://s.com/3': { status: 302, headers: { location: 'https://s.com/4' } },
      'https://s.com/4': destino
    })
  );
  assert.equal(ok.permitido, true);
  const muitos = await verificarExibicao(
    'https://r.com/1',
    ORIGEM,
    buscarFalso({
      'https://r.com/1': { status: 301, headers: { location: '/2' } },
      'https://r.com/2': { status: 301, headers: { location: '/3' } },
      'https://r.com/3': { status: 301, headers: { location: '/4' } },
      'https://r.com/4': { status: 301, headers: { location: '/5' } }
    })
  );
  assert.equal(muitos.permitido, null);
  const paraIp = await verificarExibicao(
    'https://r.com/1',
    ORIGEM,
    buscarFalso({ 'https://r.com/1': { status: 302, headers: { location: 'http://10.0.0.1/' } } })
  );
  assert.equal(paraIp.permitido, false);
});

test('verificar: falha de rede não bloqueia, mas avisa', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const r = await (await pedir(env, 'POST', '/api/verificar', { corpo: { url: 'https://fora.com/' }, cookie, buscar: buscarFalso({}) })).json();
  assert.equal(r.ok, true);
  assert.match(r.aviso, /Não foi possível confirmar/);
});

test('analisarCabecalhos: regras de frame-ancestors', () => {
  const h = (csp) => new Headers({ 'content-security-policy': csp });
  assert.equal(analisarCabecalhos(h('frame-ancestors *'), ORIGEM).permitido, true);
  assert.equal(analisarCabecalhos(h('frame-ancestors https:'), ORIGEM).permitido, true);
  assert.equal(analisarCabecalhos(h('frame-ancestors https://*.exemplo.com'), ORIGEM).permitido, true);
  assert.equal(analisarCabecalhos(h("frame-ancestors 'none'"), ORIGEM).permitido, false);
  assert.equal(analisarCabecalhos(h('frame-ancestors http://painel.exemplo.com'), ORIGEM).permitido, false);
  // frame-ancestors tem prioridade sobre X-Frame-Options.
  const ambos = new Headers({ 'content-security-policy': 'frame-ancestors *', 'x-frame-options': 'DENY' });
  assert.equal(analisarCabecalhos(ambos, ORIGEM).permitido, true);
  assert.equal(analisarCabecalhos(new Headers({ 'x-frame-options': 'DENY' }), ORIGEM).permitido, false);
  assert.equal(analisarCabecalhos(new Headers(), ORIGEM).permitido, true);
});

test('ajustes da TV por tela: validados, salvos e enviados à TV', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const { codigo } = await (await pedir(env, 'POST', '/api/telas', { corpo: { nome: 'T' }, cookie })).json();
  const r = await pedir(env, 'PUT', '/api/telas/' + codigo, { corpo: { opcoes: { direto: true, preparo: 999, quadros: 1, extra: 'x' } }, cookie });
  assert.deepEqual((await r.json()).opcoes, { direto: true, preparo: 120, quadros: 2 });
  const tv = await (await pedir(env, 'GET', '/api/tv/' + codigo)).json();
  assert.deepEqual(tv.opcoes, { direto: true, preparo: 120, quadros: 2 });
  await pedir(env, 'PUT', '/api/telas/' + codigo, { corpo: { opcoes: {} }, cookie });
  assert.deepEqual((await (await pedir(env, 'GET', '/api/tv/' + codigo)).json()).opcoes, {});
});

test('registro (log) da TV: só grava com a gravação ligada; leitura só com login', async () => {
  const env = ambiente();
  const cookie = await entrar(env);
  const { codigo } = await (await pedir(env, 'POST', '/api/telas', { corpo: { nome: 'T' }, cookie })).json();
  const enviar = (linhas) => pedir(env, 'POST', '/api/registro/' + codigo, { corpo: { linhas } });
  assert.equal((await enviar(['a'])).status, 409);
  const ate = Date.now() + 3600000;
  const r = await pedir(env, 'PUT', '/api/telas/' + codigo, { corpo: { opcoes: { registroAte: ate } }, cookie });
  assert.equal((await r.json()).opcoes.registroAte, ate);
  assert.equal((await enviar(['12:00:00 início', 'linha\u0007 2'])).status, 200);
  assert.equal((await pedir(env, 'GET', '/api/registro/' + codigo)).status, 401);
  const lidas = await (await pedir(env, 'GET', '/api/registro/' + codigo, { cookie })).json();
  assert.deepEqual(lidas.linhas, ['12:00:00 início', 'linha  2']);
  await pedir(env, 'DELETE', '/api/registro/' + codigo, { corpo: {}, cookie });
  assert.deepEqual((await (await pedir(env, 'GET', '/api/registro/' + codigo, { cookie })).json()).linhas, []);
  // Horário muito no futuro é recusado (máximo 2 h).
  const longe = await pedir(env, 'PUT', '/api/telas/' + codigo, { corpo: { opcoes: { registroAte: Date.now() + 10 * 3600000 } }, cookie });
  assert.equal((await longe.json()).opcoes.registroAte, undefined);
});
