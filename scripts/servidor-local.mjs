// Servidor local para desenvolvimento e testes (imita o Cloudflare Pages).
// Uso: ADMIN_PASSWORD=minhasenha node scripts/servidor-local.mjs [porta]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tratar } from '../src/api.js';
import { criarKvMemoria } from './kv-memoria.mjs';

const RAIZ = fileURLToPath(new URL('../public/', import.meta.url));
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.apk': 'application/vnd.android.package-archive'
};

// Lê o arquivo _headers no mesmo formato do Cloudflare Pages.
function lerRegrasCabecalhos() {
  const regras = [];
  let atual = null;
  for (const linha of readFileSync(join(RAIZ, '_headers'), 'utf8').split('\n')) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    if (!/^\s/.test(linha)) {
      atual = { padrao: linha.trim(), cabecalhos: {} };
      regras.push(atual);
    } else if (atual) {
      const i = linha.indexOf(':');
      atual.cabecalhos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
    }
  }
  return regras;
}

function cabecalhosPara(caminho, regras) {
  const res = {};
  for (const r of regras) {
    const re = new RegExp('^' + r.padrao.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (re.test(caminho)) Object.assign(res, r.cabecalhos);
  }
  return res;
}

export function criarServidor({ senha = process.env.ADMIN_PASSWORD || 'teste', arquivoDados = null, kv } = {}) {
  const env = { ADMIN_PASSWORD: senha, PAINEL_KV: kv || criarKvMemoria(arquivoDados) };
  const regras = lerRegrasCabecalhos();

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (url.pathname.startsWith('/api/')) {
        const partes = [];
        for await (const p of req) partes.push(p);
        const corpo = partes.length ? Buffer.concat(partes) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
        headers.set('cf-connecting-ip', req.socket.remoteAddress || 'local');
        const pedido = new Request(url, { method: req.method, headers, body: corpo });
        const resposta = await tratar(pedido, env);
        res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
        res.end(Buffer.from(await resposta.arrayBuffer()));
        return;
      }
      if (url.pathname === '/') {
        res.writeHead(302, { Location: '/admin' });
        res.end();
        return;
      }
      let arquivo = normalize(join(RAIZ, decodeURIComponent(url.pathname)));
      if (!arquivo.startsWith(RAIZ)) throw Object.assign(new Error('fora'), { code: 'ENOENT' });
      if (!extname(arquivo)) arquivo += '.html';
      if (!(await stat(arquivo)).isFile()) throw Object.assign(new Error('pasta'), { code: 'ENOENT' });
      const conteudo = await readFile(arquivo);
      res.writeHead(200, {
        'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream',
        ...cabecalhosPara(url.pathname, regras)
      });
      res.end(conteudo);
    } catch (e) {
      res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(e.code === 'ENOENT' ? 'Não encontrado' : 'Erro interno');
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const porta = Number(process.argv[2]) || 8788;
  if (!process.env.ADMIN_PASSWORD) console.log('Aviso: ADMIN_PASSWORD não definida; usando a senha "teste".');
  criarServidor({ arquivoDados: '.dev-dados.json' }).listen(porta, () => {
    console.log(`SugesconTv em http://localhost:${porta}/admin`);
  });
}
