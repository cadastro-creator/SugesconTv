// Cotações de metais e dólar para a tela /cotacoes (preços de referência dos contratos futuros).
// Cobre: COMEX HG=F em US$/libra → convertido para US$/tonelada.
// Alumínio: COMEX ALI=F, já em US$/tonelada.
// R$/t = US$/t × dólar.

const LIBRAS_POR_TONELADA = 2204.62262;

export const ATIVOS = {
  cobre: { nome: 'Cobre', simbolo: 'HG=F', fator: LIBRAS_POR_TONELADA, metal: true },
  aluminio: { nome: 'Alumínio', simbolo: 'ALI=F', fator: 1, metal: true },
  dolar: { nome: 'Dólar', simbolo: 'USDBRL=X', fator: 1, metal: false }
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function lerLista(texto) {
  const ids = String(texto || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter((s, i, todos) => ATIVOS[s] && todos.indexOf(s) === i);
  return ids.length ? ids : ['cobre', 'aluminio', 'dolar'];
}

// Série diária de 1 mês: [{ t: milissegundos, v: preço }]
async function serie(simbolo, buscar) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1mo&interval=1d`;
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 8000);
  try {
    const r = await buscar(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controle.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) throw new Error('sem dados');
    const fechamentos = (res.indicators && res.indicators.quote && res.indicators.quote[0].close) || [];
    const pontos = (res.timestamp || [])
      .map((t, i) => ({ t: t * 1000, v: fechamentos[i] }))
      .filter((p) => typeof p.v === 'number' && isFinite(p.v));
    const atual = res.meta && typeof res.meta.regularMarketPrice === 'number' ? res.meta.regularMarketPrice : null;
    if (atual !== null && pontos.length) pontos[pontos.length - 1].v = atual;
    if (!pontos.length) throw new Error('sem dados');
    return pontos;
  } finally {
    clearTimeout(relogio);
  }
}

const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;

export async function obterCotacoes(ids, buscar = fetch) {
  const precisa = new Set(ids);
  precisa.add('dolar'); // necessário para converter para R$
  const series = {};
  await Promise.all(
    [...precisa].map(async (id) => {
      series[id] = await serie(ATIVOS[id].simbolo, buscar);
    })
  );
  const dolarSerie = series.dolar;
  const dolar = dolarSerie[dolarSerie.length - 1].v;
  const ativos = ids.map((id) => {
    const a = ATIVOS[id];
    const pts = series[id];
    const hist = pts.map((p) => ({ t: p.t, v: arred(p.v * a.fator, a.metal ? 2 : 4) }));
    const preco = hist[hist.length - 1].v;
    const anterior = hist.length > 1 ? hist[hist.length - 2].v : preco;
    const item = {
      id,
      nome: a.nome,
      unidade: a.metal ? 'US$/t' : 'R$',
      preco,
      variacao: anterior ? arred(((preco - anterior) / anterior) * 100, 2) : 0,
      historico: hist
    };
    if (a.metal) item.brlTon = arred(preco * dolar, 2);
    return item;
  });
  return { atualizadoEm: new Date().toISOString(), dolar: arred(dolar, 4), ativos };
}
