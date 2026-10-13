// Verifica, no servidor, se um site permite ser exibido dentro de outro site
// (cabeçalhos X-Frame-Options e frame-ancestors da CSP).
import { validarEndereco } from '../public/assets/links.js';

const TEMPO_LIMITE_MS = 5000;
const MAX_REDIRECIONAMENTOS = 3;

function hostCasa(padrao, host) {
  if (padrao === '*') return true;
  if (padrao.startsWith('*.')) return host.endsWith(padrao.slice(1));
  return padrao === host;
}

// Uma origem da lista frame-ancestors permite o painel?
function fonteAutoriza(fonte, painel) {
  const f = fonte.toLowerCase();
  if (f === '*' || f === 'https:') return true;
  if (f === "'self'") return false; // o site exibido nunca é o próprio painel
  if (f.startsWith("'")) return false; // 'none' e outras palavras-chave
  const m = f.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/:]+)(?::(\d+|\*))?/);
  if (!m) return false;
  const [, esquema, host, porta] = m;
  if (esquema && esquema !== 'https') return false;
  if (porta && porta !== '*' && porta !== '443') return false;
  return hostCasa(host, painel.hostname);
}

export function analisarCabecalhos(cabecalhos, origemPainel) {
  const painel = new URL(origemPainel);
  const csp = cabecalhos.get('content-security-policy') || '';
  let temFrameAncestors = false;
  let permitido = true;
  for (const politica of csp.split(',')) {
    for (const diretiva of politica.split(';')) {
      const partes = diretiva.trim().split(/\s+/);
      if (partes[0].toLowerCase() !== 'frame-ancestors') continue;
      temFrameAncestors = true;
      if (!partes.slice(1).some((f) => fonteAutoriza(f, painel))) permitido = false;
    }
  }
  if (temFrameAncestors) return { permitido, motivo: permitido ? null : 'frame-ancestors' };
  const xfo = (cabecalhos.get('x-frame-options') || '').toLowerCase();
  if (/deny|sameorigin|allow-from/.test(xfo)) return { permitido: false, motivo: 'x-frame-options' };
  return { permitido: true, motivo: null };
}

// Retorna { permitido: true|false|null }. null = não foi possível verificar.
export async function verificarExibicao(url, origemPainel, buscar = fetch) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    let atual = url;
    for (let i = 0; i <= MAX_REDIRECIONAMENTOS; i++) {
      const v = validarEndereco(atual);
      if (!v.ok) return { permitido: false, motivo: 'redirecionamento', erro: v.erro };
      const resp = await buscar(v.url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controle.signal,
        headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; SugesconTv/1.0)' }
      });
      // Só os cabeçalhos interessam: descarta o corpo sem ler.
      try {
        if (resp.body) await resp.body.cancel();
      } catch {
        /* ignora */
      }
      const destino = resp.headers.get('location');
      if (resp.status >= 300 && resp.status < 400 && destino) {
        atual = new URL(destino, v.url).href;
        continue;
      }
      return analisarCabecalhos(resp.headers, origemPainel);
    }
    return { permitido: null, motivo: 'redirecionamentos' };
  } catch {
    return { permitido: null, motivo: 'falha' };
  } finally {
    clearTimeout(relogio);
  }
}
