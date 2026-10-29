// Modo imagem: páginas marcadas são fotografadas de tempos em tempos (GitHub Actions)
// e a TV mostra a foto, em vez de abrir o site ao vivo.

const codificador = new TextEncoder();

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Identificador da foto de um link (o mesmo link em várias telas usa a mesma foto).
export async function chaveFoto(url) {
  return hex(await crypto.subtle.digest('SHA-256', codificador.encode(url))).slice(0, 24);
}

// Chave de acesso do robô das fotos, derivada da senha do painel (mostrada no painel).
export async function tokenFotos(senha) {
  const k = await crypto.subtle.importKey('raw', codificador.encode(senha), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, codificador.encode('sugescontv-fotos-v1'))).slice(0, 40);
}

// Página marcada para o modo imagem (telas antigas tinham só a marcação do item inteiro).
export function emModoImagem(item, pagina) {
  return pagina.imagem === true || (pagina.imagem === undefined && item.imagem === true);
}

// Acrescenta a chave da foto às páginas em modo imagem.
export async function marcarFotos(itens) {
  return Promise.all(
    (itens || []).map(async (item) => {
      const paginas = await Promise.all(
        item.paginas.map(async (p) => (emModoImagem(item, p) ? { ...p, foto: await chaveFoto(p.url) } : p))
      );
      return { ...item, paginas };
    })
  );
}

// O agendamento do GitHub atrasa horas ou nem roda. Por isso o site acorda o robô:
// quando uma TV com páginas em modo imagem consulta a tela, no horário do robô
// (seg–sex, 7h–19h de Brasília), e o robô não passa há mais de 25 min, pede uma
// execução ao GitHub (no máximo uma a cada 15 min). Precisa do segredo GITHUB_TOKEN.
const SEM_ROBO_MS = 25 * 60000;
const ENTRE_PEDIDOS_MS = 15 * 60000;

export function horarioDoRobo(agora) {
  const d = new Date(agora);
  const dia = d.getUTCDay();
  const hora = d.getUTCHours();
  return dia >= 1 && dia <= 5 && hora >= 10 && hora < 22;
}

export async function acordarRobo(kv, env, agora = Date.now(), buscar = fetch) {
  if (!env.GITHUB_TOKEN) return 'sem GITHUB_TOKEN';
  if (!horarioDoRobo(agora)) return 'fora do horário';
  const ultimo = Date.parse((await kv.get('fotos:robo')) || '') || 0;
  if (agora - ultimo < SEM_ROBO_MS) return 'robô ativo';
  const pedido = Date.parse((await kv.get('fotos:pedido')) || '') || 0;
  if (agora - pedido < ENTRE_PEDIDOS_MS) return 'já pedido';
  await kv.put('fotos:pedido', new Date(agora).toISOString(), { expirationTtl: 3600 });
  const repo = env.GITHUB_REPO || 'cadastro-creator/SugesconTv';
  const r = await buscar(`https://api.github.com/repos/${repo}/actions/workflows/fotos.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'SugesconTv'
    },
    body: JSON.stringify({ ref: env.GITHUB_BRANCH || 'main' })
  });
  return r.status === 204 ? 'acordado' : 'erro ' + r.status;
}
