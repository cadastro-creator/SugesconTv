// Robô do modo imagem: abre as páginas marcadas como "Modo imagem" num Chrome de verdade
// (1920x1080), espera os gráficos montarem, tira uma foto e envia ao SugesconTv.
// Roda no GitHub Actions a cada 15 min (.github/workflows/fotos.yml).
// Variáveis: SITE_URL (padrão https://sugescontv.pages.dev), FOTOS_TOKEN (chave mostrada no painel).
// O repositório é público: o registro da execução NÃO mostra os links dos relatórios.
import { chromium } from 'playwright-core';

const SITE = (process.env.SITE_URL || 'https://sugescontv.pages.dev').replace(/\/+$/, '');
const TOKEN = process.env.FOTOS_TOKEN || '';
// A foto só é tirada quando a página "parou": nada mudou na tela nem foi buscado na rede
// durante ESTAVEL_MS seguidos (o Looker busca os gráficos em levas, com pausas entre elas).
const ESPERA_MIN_MS = Number(process.env.ESPERA_MS || 20000);
const ESPERA_MAX_MS = Number(process.env.ESPERA_MAX_MS || 120000);
const ESTAVEL_MS = Number(process.env.ESTAVEL_MS || 10000);
const INTERVALO_MS = 2500;
const SIMULTANEAS = 3;

if (!TOKEN) {
  console.log('::error::Configure o segredo FOTOS_TOKEN (a chave aparece no painel, em "Configurar o modo imagem").');
  process.exit(1);
}
const autorizacao = { Authorization: 'Bearer ' + TOKEN };

const r = await fetch(SITE + '/api/fotos/pendentes', { headers: autorizacao });
if (!r.ok) {
  console.log(`::error::O site recusou a lista de páginas (HTTP ${r.status}). Confira o segredo FOTOS_TOKEN.`);
  process.exit(1);
}
const { paginas } = await r.json();
if (!paginas.length) {
  console.log('Nenhuma página em modo imagem.');
  process.exit(0);
}
console.log(`${paginas.length} página(s) para fotografar.`);

const navegador = await chromium.launch(process.env.CHROME_CANAL === 'playwright' ? {} : { channel: 'chrome' });
const contexto = await navegador.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo'
});

let falhas = 0;
async function fotografar({ url, chave }) {
  const pagina = await contexto.newPage();
  const inicio = Date.now();
  // Acompanha os pedidos de dados da página (o Looker busca os gráficos aos poucos).
  let emAndamento = 0;
  let ultimaAtividade = Date.now();
  const comecou = () => {
    emAndamento++;
    ultimaAtividade = Date.now();
  };
  const terminou = () => {
    emAndamento = Math.max(0, emAndamento - 1);
    ultimaAtividade = Date.now();
  };
  pagina.on('request', comecou);
  pagina.on('requestfinished', terminou);
  pagina.on('requestfailed', terminou);
  try {
    await pagina.goto(url, { waitUntil: 'load', timeout: 60000 });
    await pagina.waitForTimeout(ESPERA_MIN_MS);
    let anterior = null;
    let semMudarDesde = Date.now();
    let estavel = false;
    while (Date.now() - inicio < ESPERA_MAX_MS) {
      const atual = await pagina.screenshot({ type: 'png' });
      if (!anterior || !atual.equals(anterior)) semMudarDesde = Date.now();
      anterior = atual;
      const agora = Date.now();
      const telaParada = agora - semMudarDesde >= ESTAVEL_MS;
      const redeParada = emAndamento === 0 && agora - ultimaAtividade >= ESTAVEL_MS;
      if (telaParada && redeParada) {
        estavel = true;
        break;
      }
      await pagina.waitForTimeout(INTERVALO_MS);
    }
    if (!estavel) console.log(`::warning::${chave}: a página não parou de mudar em ${ESPERA_MAX_MS / 1000} s; foto tirada assim mesmo.`);
    const jpeg = await pagina.screenshot({ type: 'jpeg', quality: 80 });
    const envio = await fetch(`${SITE}/api/fotos/${chave}`, {
      method: 'PUT',
      headers: { ...autorizacao, 'Content-Type': 'image/jpeg' },
      body: jpeg
    });
    if (!envio.ok) throw new Error('envio recusado (HTTP ' + envio.status + ')');
    console.log(`✓ ${chave} pronta em ${((Date.now() - inicio) / 1000).toFixed(1)} s (${Math.round(jpeg.length / 1024)} KB)`);
  } catch (e) {
    falhas++;
    console.log(`::warning::✗ ${chave}: ${String(e.message || e).split('\n')[0].replace(/https?:\/\/\S+/g, '[link]')}`);
  } finally {
    await pagina.close();
  }
}

const fila = paginas.slice();
await Promise.all(
  Array.from({ length: Math.min(SIMULTANEAS, fila.length) }, async () => {
    while (fila.length) await fotografar(fila.shift());
  })
);
await navegador.close();
if (falhas === paginas.length) process.exit(1);
