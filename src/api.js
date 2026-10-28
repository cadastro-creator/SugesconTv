// API do SugesconTv. Roda como Cloudflare Pages Function (functions/api/[[caminho]].js)
// e também no servidor local de desenvolvimento/testes.
import { analisarLink, nomeSugerido, validarEndereco } from '../public/assets/links.js';
import { verificarExibicao } from './verificar.js';
import { lerLista, obterCotacoes } from './cotacoes.js';
import { chaveFoto, emModoImagem, marcarFotos, tokenFotos } from './fotos.js';

const COOKIE = 'painel_sessao';
const SESSAO_SEGUNDOS = 12 * 60 * 60;
const LIMITE_TENTATIVAS = 10;
const JANELA_SEGUNDOS = 15 * 60;
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TIPOS = ['powerbi', 'looker', 'planilha', 'site'];

const MSG_BLOQUEADO =
  'Este site não permite exibição em painéis. Use um widget de incorporação (ex.: TradingView) ou outro site.';

const CABECALHOS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
};

function json(dados, status = 200, extras = {}) {
  return new Response(JSON.stringify(dados), { status, headers: { ...CABECALHOS, ...extras } });
}

const falha = (status, erro) => json({ erro }, status);

// ---------- sessão (cookie assinado com HMAC; a chave é a própria senha) ----------

const codificador = new TextEncoder();

function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function assinar(senha, texto) {
  const chave = await crypto.subtle.importKey('raw', codificador.encode(senha), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ]);
  return base64url(await crypto.subtle.sign('HMAC', chave, codificador.encode(texto)));
}

// Compara em tempo constante (compara as assinaturas HMAC dos dois valores).
async function iguais(senha, a, b) {
  const [x, y] = await Promise.all([assinar(senha, 'cmp:' + a), assinar(senha, 'cmp:' + b)]);
  let dif = x.length ^ y.length;
  for (let i = 0; i < x.length && i < y.length; i++) dif |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return dif === 0;
}

async function criarSessao(senha) {
  const expira = Math.floor(Date.now() / 1000) + SESSAO_SEGUNDOS;
  return expira + '.' + (await assinar(senha, 'sessao:' + expira));
}

function lerCookie(req, nome) {
  const c = req.headers.get('cookie') || '';
  for (const parte of c.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

async function sessaoValida(req, senha) {
  const valor = lerCookie(req, COOKIE);
  if (!valor) return false;
  const [expira, assinatura] = valor.split('.');
  if (!/^\d+$/.test(expira || '') || Number(expira) < Date.now() / 1000) return false;
  return iguais(senha, assinatura || '', await assinar(senha, 'sessao:' + expira));
}

function cookieSessao(valor, maxAge) {
  return `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// ---------- limite de tentativas de login ----------

async function lerTentativas(kv, ip) {
  const r = await kv.get('tentativas:' + ip, 'json');
  const agora = Math.floor(Date.now() / 1000);
  if (!r || r.inicio + JANELA_SEGUNDOS <= agora) return { n: 0, inicio: agora };
  return r;
}

async function registrarFalha(kv, ip, t) {
  const novo = { n: t.n + 1, inicio: t.inicio };
  const expira = Math.max(t.inicio + JANELA_SEGUNDOS, Math.floor(Date.now() / 1000) + 60);
  await kv.put('tentativas:' + ip, JSON.stringify(novo), { expiration: expira });
}

// ---------- telas ----------

function novoCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

const codigoValido = (c) => /^[A-Z0-9]{4,12}$/.test(c || '');

async function lerTela(kv, codigo) {
  if (!codigoValido(codigo)) return null;
  return kv.get('tela:' + codigo, 'json');
}

async function gravarTela(kv, tela) {
  tela.atualizadoEm = new Date().toISOString();
  await kv.put('tela:' + tela.codigo, JSON.stringify(tela), { metadata: { nome: tela.nome } });
  return tela;
}

function inteiro(v, padrao, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

function limparNome(nome, padrao) {
  const n = String(nome == null ? '' : nome).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80);
  return n || padrao;
}

// Valida os itens enviados pelo painel. Lança Error com mensagem amigável.
export function validarItens(itens) {
  if (!Array.isArray(itens)) throw new Error('Lista de itens inválida.');
  if (itens.length > 50) throw new Error('Máximo de 50 itens por tela.');
  return itens.map((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`Item ${i + 1} inválido.`);
    const tipo = TIPOS.includes(item.tipo) ? item.tipo : 'site';
    const paginas = Array.isArray(item.paginas) ? item.paginas : [];
    if (!paginas.length) throw new Error(`O item ${i + 1} não tem páginas.`);
    if (paginas.length > 30) throw new Error(`O item ${i + 1} tem páginas demais (máximo 30).`);
    const lista = paginas.map((p, j) => {
      const v = validarEndereco(p && p.url);
      if (!v.ok) throw new Error(`Item ${i + 1}, página ${j + 1}: ${v.erro}`);
      const r = { url: v.url.href, segundos: inteiro(p.segundos, 30, 5, 3600) };
      // Modo imagem por página (telas antigas tinham só a marcação do item inteiro).
      if (p.imagem === true || (p.imagem === undefined && item.imagem === true)) r.imagem = true;
      return r;
    });
    return {
      id: /^[a-z0-9]{1,20}$/.test(item.id || '') ? item.id : Math.random().toString(36).slice(2, 10),
      tipo,
      nome: limparNome(item.nome, `Item ${i + 1}`),
      recarregarMin: inteiro(item.recarregarMin, 10, 5, 1440),
      pausado: item.pausado === true,
      paginas: lista
    };
  });
}

// Ajustes da TV por tela (definidos no painel; valem também para o app, que não aceita parâmetros no link).
export function validarOpcoes(o) {
  const r = {};
  if (!o || typeof o !== 'object') return r;
  if (o.direto === true) r.direto = true;
  if (o.preparo !== null && o.preparo !== undefined && o.preparo !== '') r.preparo = inteiro(o.preparo, 15, 0, 120);
  if (o.quadros !== null && o.quadros !== undefined && o.quadros !== '') r.quadros = inteiro(o.quadros, 8, 2, 12);
  // Resolução da página: largura virtual em que as páginas são montadas (reduzida para caber).
  if ([1280, 1920, 2560].indexOf(Number(o.largura)) >= 0) r.largura = Number(o.largura);
  // Registro (log) da TV ligado até este horário (no máximo 2 h à frente).
  const ate = Number(o.registroAte);
  if (Number.isFinite(ate) && ate > Date.now() && ate <= Date.now() + 2 * 3600000) r.registroAte = Math.round(ate);
  return r;
}

const MAX_LINHAS_REGISTRO = 1500;

// ---------- roteamento ----------

async function lerJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function tratar(req, env, opcoes = {}) {
  const url = new URL(req.url);
  const caminho = url.pathname.replace(/\/+$/, '');
  const metodo = req.method.toUpperCase();
  const kv = env.PAINEL_KV;

  if (!kv) return falha(500, 'Armazenamento não configurado: ligue um namespace KV com o nome PAINEL_KV ao projeto.');

  // Cotações de metais e dólar (público; guardadas por 10 min no cache do Cloudflare).
  if (caminho === '/api/cotacoes') {
    if (metodo !== 'GET') return falha(405, 'Método não permitido.');
    const ids = lerLista(url.searchParams.get('ativos'));
    const chaveKv = 'cotacoes:' + ids.join(',');
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const chaveCache = new Request(url.origin + '/api/cotacoes?ativos=' + ids.join(','));
    if (cache) {
      const guardada = await cache.match(chaveCache);
      if (guardada) return guardada;
    }
    let dados;
    try {
      dados = await obterCotacoes(ids, opcoes.buscar);
      // Guarda uma cópia de segurança no máximo a cada 30 min (poupa gravações do plano gratuito).
      const anterior = await kv.get(chaveKv, 'json');
      if (!anterior || Date.now() - Date.parse(anterior.atualizadoEm) > 30 * 60000) {
        await kv.put(chaveKv, JSON.stringify(dados));
      }
    } catch {
      // Fonte fora do ar: usa a última cotação boa.
      dados = await kv.get(chaveKv, 'json');
      if (!dados) return falha(502, 'Cotações indisponíveis no momento. Tentando de novo em instantes.');
      dados.atrasado = true;
    }
    const resp = json(dados, 200, { 'Cache-Control': dados.atrasado ? 'no-store' : 'public, max-age=600' });
    if (cache && !dados.atrasado) await cache.put(chaveCache, resp.clone());
    return resp;
  }

  // Foto de uma página em modo imagem (pública, como a lista da TV).
  const foto = caminho.match(/^\/api\/foto\/([a-f0-9]{24})$/);
  if (foto) {
    if (metodo !== 'GET') return falha(405, 'Método não permitido.');
    // Cada TV pede a foto a cada minuto: uma cópia de 1 min no servidor poupa as leituras do KV.
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const chaveCache = new Request(url.origin + '/api/foto/' + foto[1]);
    let resp = cache ? await cache.match(chaveCache) : null;
    if (!resp) {
      const r = await kv.getWithMetadata('foto:' + foto[1], 'arrayBuffer');
      if (!r || !r.value) return falha(404, 'Foto ainda não tirada.');
      resp = new Response(r.value, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=60',
          'X-Content-Type-Options': 'nosniff',
          'X-Foto-Em': (r.metadata && r.metadata.em) || ''
        }
      });
      if (cache) await cache.put(chaveCache, resp.clone());
    }
    resp = new Response(resp.body, resp);
    resp.headers.set('Cache-Control', 'no-cache');
    return resp;
  }

  // Robô das fotos (GitHub Actions): lista o que fotografar e envia as fotos.
  if (caminho.startsWith('/api/fotos/') && caminho !== '/api/fotos/token') {
    if (!env.ADMIN_PASSWORD) return falha(500, 'Senha não configurada.');
    const enviado = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!enviado || enviado !== (await tokenFotos(env.ADMIN_PASSWORD))) return falha(401, 'Chave das fotos inválida.');
    if (caminho === '/api/fotos/pendentes' && metodo === 'GET') {
      const urls = new Set();
      let cursor;
      do {
        const r = await kv.list({ prefix: 'tela:', cursor });
        for (const k of r.keys) {
          const t = await kv.get(k.name, 'json');
          for (const item of (t && t.itens) || []) {
            if (!item.pausado) for (const p of item.paginas) if (emModoImagem(item, p)) urls.add(p.url);
          }
        }
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
      const paginas = await Promise.all([...urls].map(async (u) => ({ url: u, chave: await chaveFoto(u) })));
      return json({ paginas });
    }
    const envio = caminho.match(/^\/api\/fotos\/([a-f0-9]{24})$/);
    if (envio && metodo === 'PUT') {
      if (!(req.headers.get('content-type') || '').startsWith('image/jpeg')) return falha(415, 'Envie a foto em JPEG.');
      const bytes = await req.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) return falha(413, 'Foto vazia ou grande demais (máx. 5 MB).');
      await kv.put('foto:' + envio[1], bytes, { metadata: { em: new Date().toISOString() }, expirationTtl: 7 * 86400 });
      return json({ ok: true });
    }
    return falha(404, 'Endereço da API não encontrado.');
  }

  // Leitura pública da TV (somente leitura, sem login).
  const tv = caminho.match(/^\/api\/tv\/([A-Za-z0-9]+)$/);
  if (tv) {
    if (metodo !== 'GET') return falha(405, 'Método não permitido.');
    const tela = await lerTela(kv, tv[1].toUpperCase());
    if (!tela) return falha(404, 'Tela não encontrada.');
    return json({
      codigo: tela.codigo,
      nome: tela.nome,
      itens: await marcarFotos(tela.itens),
      atualizadoEm: tela.atualizadoEm,
      reiniciarEm: tela.reiniciarEm || null,
      opcoes: tela.opcoes || {}
    });
  }

  const senha = env.ADMIN_PASSWORD;
  if (!senha) return falha(500, 'Senha não configurada: crie a variável ADMIN_PASSWORD no Cloudflare.');

  // Proteção extra contra envio de outro site (além do SameSite=Strict).
  if (metodo !== 'GET') {
    const origem = req.headers.get('origin');
    if (origem && origem !== url.origin) return falha(403, 'Origem não permitida.');
    if (!(req.headers.get('content-type') || '').includes('application/json')) {
      return falha(415, 'Envie os dados em JSON.');
    }
  }

  // Registro (log) enviado pela TV: só aceito enquanto a gravação está ligada no painel.
  const reg = caminho.match(/^\/api\/registro\/([A-Za-z0-9]+)$/);
  if (reg && metodo === 'POST') {
    const tela = await lerTela(kv, reg[1].toUpperCase());
    if (!tela) return falha(404, 'Tela não encontrada.');
    if (!(tela.opcoes && tela.opcoes.registroAte > Date.now())) return falha(409, 'Registro desligado.');
    const corpo = await lerJson(req);
    const novas = (corpo && Array.isArray(corpo.linhas) ? corpo.linhas : [])
      .slice(0, 300)
      .map((l) => String(l).replace(/[\u0000-\u001f]/g, ' ').slice(0, 400));
    if (!novas.length) return json({ ok: true });
    const antigas = (await kv.get('registro:' + tela.codigo, 'json')) || [];
    const linhas = antigas.concat(novas).slice(-MAX_LINHAS_REGISTRO);
    // Some sozinho em 7 dias.
    await kv.put('registro:' + tela.codigo, JSON.stringify(linhas), { expirationTtl: 7 * 86400 });
    return json({ ok: true });
  }

  if (caminho === '/api/login' && metodo === 'POST') {
    const ip = req.headers.get('cf-connecting-ip') || 'desconhecido';
    const t = await lerTentativas(kv, ip);
    if (t.n >= LIMITE_TENTATIVAS) {
      const min = Math.ceil((t.inicio + JANELA_SEGUNDOS - Date.now() / 1000) / 60);
      return falha(429, `Muitas tentativas. Aguarde ${min} minuto(s) e tente de novo.`);
    }
    const corpo = await lerJson(req);
    const informada = corpo && typeof corpo.senha === 'string' ? corpo.senha : '';
    if (!(await iguais(senha, informada, senha))) {
      await registrarFalha(kv, ip, t);
      return falha(401, 'Senha incorreta.');
    }
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(await criarSessao(senha), SESSAO_SEGUNDOS) });
  }

  if (caminho === '/api/logout' && metodo === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao('', 0) });
  }

  if (!(await sessaoValida(req, senha))) return falha(401, 'Faça login novamente.');

  if (caminho === '/api/sessao' && metodo === 'GET') return json({ ok: true });

  // Chave do robô das fotos, para cadastrar no GitHub (só com login).
  if (caminho === '/api/fotos/token' && metodo === 'GET') return json({ token: await tokenFotos(senha) });

  if (caminho === '/api/telas') {
    if (metodo === 'GET') {
      const telas = [];
      let cursor;
      do {
        const r = await kv.list({ prefix: 'tela:', cursor });
        for (const k of r.keys) telas.push({ codigo: k.name.slice(5), nome: (k.metadata && k.metadata.nome) || k.name.slice(5) });
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
      telas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return json({ telas });
    }
    if (metodo === 'POST') {
      const corpo = (await lerJson(req)) || {};
      let codigo;
      for (let i = 0; i < 5 && !codigo; i++) {
        const c = novoCodigo();
        if (!(await kv.get('tela:' + c))) codigo = c;
      }
      if (!codigo) return falha(500, 'Não foi possível gerar um código. Tente de novo.');
      const tela = await gravarTela(kv, { codigo, nome: limparNome(corpo.nome, 'Nova tela'), itens: [] });
      return json(tela, 201);
    }
    return falha(405, 'Método não permitido.');
  }

  // Situação das fotos das páginas em modo imagem de uma tela: { link: horário da foto ou null }.
  const sf = caminho.match(/^\/api\/telas\/([A-Za-z0-9]+)\/fotos$/);
  if (sf && metodo === 'GET') {
    const tela = await lerTela(kv, sf[1].toUpperCase());
    if (!tela) return falha(404, 'Tela não encontrada.');
    const tiradas = {};
    let cursor;
    do {
      const r = await kv.list({ prefix: 'foto:', cursor });
      for (const k of r.keys) tiradas[k.name.slice(5)] = (k.metadata && k.metadata.em) || '';
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
    const fotos = {};
    for (const item of tela.itens || []) {
      for (const p of item.paginas) {
        if (!emModoImagem(item, p)) continue;
        const chave = await chaveFoto(p.url);
        fotos[p.url] = chave in tiradas ? tiradas[chave] : null;
      }
    }
    return json({ fotos });
  }

  const t = caminho.match(/^\/api\/telas\/([A-Za-z0-9]+)$/);
  if (t) {
    const tela = await lerTela(kv, t[1].toUpperCase());
    if (!tela) return falha(404, 'Tela não encontrada.');
    if (metodo === 'GET') return json(tela);
    if (metodo === 'PUT') {
      const corpo = await lerJson(req);
      if (!corpo) return falha(400, 'Dados inválidos.');
      if (corpo.nome !== undefined) tela.nome = limparNome(corpo.nome, tela.nome);
      // Pedido para as TVs desta tela recarregarem a página (aplicado na próxima consulta).
      if (corpo.reiniciar === true) tela.reiniciarEm = new Date().toISOString();
      if (corpo.opcoes !== undefined) tela.opcoes = validarOpcoes(corpo.opcoes);
      if (corpo.itens !== undefined) {
        try {
          tela.itens = validarItens(corpo.itens);
        } catch (e) {
          return falha(400, e.message);
        }
      }
      return json(await gravarTela(kv, tela));
    }
    if (metodo === 'DELETE') {
      await kv.delete('tela:' + tela.codigo);
      return json({ ok: true });
    }
    return falha(405, 'Método não permitido.');
  }

  if (reg) {
    const codigo = reg[1].toUpperCase();
    if (metodo === 'GET') return json({ linhas: (await kv.get('registro:' + codigo, 'json')) || [] });
    if (metodo === 'DELETE') {
      await kv.delete('registro:' + codigo);
      return json({ ok: true });
    }
    return falha(405, 'Método não permitido.');
  }

  if (caminho === '/api/verificar' && metodo === 'POST') {
    const corpo = (await lerJson(req)) || {};
    const base = corpo.base && TIPOS.includes(corpo.base.tipo) && typeof corpo.base.url === 'string' ? corpo.base : null;
    const r = analisarLink(corpo.url, base);
    if (!r.ok) return json(r);
    const v = await verificarExibicao(r.url, url.origin, opcoes.buscar);
    if (v.permitido === false) return json({ ok: false, erro: MSG_BLOQUEADO, bloqueado: true });
    const res = { ...r, nome: nomeSugerido(r) };
    if (v.permitido === null) {
      res.aviso = [r.aviso, 'Não foi possível confirmar agora se o site permite exibição. Confira na prévia.']
        .filter(Boolean)
        .join(' ');
    }
    return json(res);
  }

  return falha(404, 'Endereço da API não encontrado.');
}
