// Reconhecimento, validação e conversão de links para exibição na TV.
// Usado pelo painel (navegador) e pela API (Cloudflare Pages Functions).

export const TIPOS = {
  powerbi: 'Power BI',
  looker: 'Looker Studio',
  planilha: 'Google Planilhas',
  site: 'Site'
};

const HOSTS_LOOKER = ['lookerstudio.google.com', 'datastudio.google.com'];
const PBI_OCULTAR = 'navContentPaneEnabled=false&filterPaneEnabled=false';
const PLANILHA_OPCOES = 'widget=true&headers=false&chrome=false';

const MSG_PBI_LOGIN =
  'Este link do Power BI exige login e não abre na TV. No Power BI, use Arquivo → Incorporar relatório → ' +
  'Publicar na Web (público) e cole aqui o link gerado (app.powerbi.com/view?r=...).';
const MSG_PLANILHA_PUBLICAR =
  'Esta planilha ainda não está publicada. No Google Planilhas, use Arquivo → Compartilhar → Publicar na Web → ' +
  'Publicar, e cole aqui o link gerado.';

function erro(mensagem) {
  return { ok: false, erro: mensagem };
}

// Garante https, sem IPs, sem localhost, sem usuário/senha e sem porta.
export function validarEndereco(texto) {
  const bruto = String(texto == null ? '' : texto).trim();
  if (!bruto) return erro('Cole um link.');
  if (/^http:\/\//i.test(bruto)) return erro('Use um link que comece com https:// (http:// não é seguro).');
  if (!/^https:\/\//i.test(bruto)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(bruto)) return erro('Só são aceitos links que começam com https://.');
    return erro('Cole o link completo, começando com https://.');
  }
  let u;
  try {
    u = new URL(bruto);
  } catch {
    return erro('Este link não é válido.');
  }
  if (u.protocol !== 'https:') return erro('Só são aceitos links que começam com https://.');
  if (u.username || u.password) return erro('O link não pode conter usuário ou senha.');
  if (u.port) return erro('O link não pode indicar porta (ex.: :8080).');
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || /^[\d.]+$/.test(host) || /^[0-9a-f:]+$/.test(host)) {
    return erro('Endereços por número (IP) não são aceitos. Use o nome do site.');
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.')
  ) {
    return erro('Endereços locais não são aceitos. Use um site público.');
  }
  return { ok: true, url: u };
}

function lerGid(u) {
  const gid = u.searchParams.get('gid') || (u.hash.match(/gid=(\d+)/) || [])[1];
  return gid && /^\d+$/.test(gid) ? gid : null;
}

function montarPowerBI(r, pagina) {
  let url = 'https://app.powerbi.com/view?r=' + encodeURIComponent(r);
  if (pagina) url += '&pageName=' + encodeURIComponent(pagina);
  return url + '&' + PBI_OCULTAR;
}

function montarPlanilha(chave, gid) {
  let url = 'https://docs.google.com/spreadsheets/d/e/' + chave + '/pubhtml?';
  if (gid) url += 'gid=' + gid + '&single=true&';
  return url + PLANILHA_OPCOES;
}

function looker(u, base) {
  if (/^\/s\//.test(u.pathname)) {
    return erro('Este é um link curto do Looker Studio. Abra-o no navegador e copie o endereço completo da barra (com /reporting/).');
  }
  const m = u.pathname.match(/\/reporting\/([A-Za-z0-9_-]+)(?:\/page\/([A-Za-z0-9_-]+))?/);
  if (!m) {
    return erro('Não reconheci este link do Looker Studio. Abra o relatório e copie o endereço da barra (ele contém /reporting/).');
  }
  let url = 'https://lookerstudio.google.com/embed/reporting/' + m[1];
  if (m[2]) url += '/page/' + m[2];
  const params = u.searchParams.get('params');
  if (params) url += '?params=' + encodeURIComponent(params);
  const res = { ok: true, tipo: 'looker', url, pagina: m[2] || null, relatorio: m[1] };
  if (base && base.tipo === 'looker') {
    const outro = (base.url.match(/\/reporting\/([A-Za-z0-9_-]+)/) || [])[1];
    if (outro && outro !== m[1]) res.aviso = 'Atenção: esta página parece ser de outro relatório.';
  }
  return res;
}

function powerbi(u, base) {
  const r = u.searchParams.get('r');
  if (u.pathname.replace(/\/+$/, '') === '/view' && r) {
    const pagina = u.searchParams.get('pageName');
    return { ok: true, tipo: 'powerbi', url: montarPowerBI(r, pagina), pagina: pagina || null };
  }
  // Link de uma página aberta no serviço: .../reports/<id>/<página>
  const m = u.pathname.match(/\/reports\/[^/]+\/([A-Za-z0-9_-]+)\/?$/);
  if (m && base && base.tipo === 'powerbi') {
    const rBase = new URL(base.url).searchParams.get('r');
    if (rBase) return { ok: true, tipo: 'powerbi', url: montarPowerBI(rBase, m[1]), pagina: m[1] };
  }
  if (m) {
    return erro(
      MSG_PBI_LOGIN +
        ' Depois de adicionar o relatório publicado, cole o link de cada página em "Adicionar página".'
    );
  }
  return erro(MSG_PBI_LOGIN);
}

function planilha(u, base) {
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/(pubhtml|pub)\b/);
  if (pub) {
    const gid = lerGid(u);
    return { ok: true, tipo: 'planilha', url: montarPlanilha(pub[1], gid), pagina: gid };
  }
  const normal = u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (normal && base && base.tipo === 'planilha') {
    const chave = (base.url.match(/\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\//) || [])[1];
    const gid = lerGid(u);
    if (chave && gid) return { ok: true, tipo: 'planilha', url: montarPlanilha(chave, gid), pagina: gid };
    if (chave) return erro('Abra a aba desejada na planilha e copie o link da barra (ele termina com #gid=...).');
  }
  return erro(MSG_PLANILHA_PUBLICAR);
}

// Analisa um link colado. "base" é a primeira página do item quando o
// usuário está adicionando outra página do mesmo relatório.
export function analisarLink(texto, base) {
  const bruto = String(texto == null ? '' : texto).trim();
  if (base && base.tipo === 'powerbi' && /^[A-Za-z0-9_-]{3,}$/.test(bruto) && !/^https?$/i.test(bruto)) {
    const rBase = new URL(base.url).searchParams.get('r');
    if (rBase) return { ok: true, tipo: 'powerbi', url: montarPowerBI(rBase, bruto), pagina: bruto };
  }
  const v = validarEndereco(bruto);
  if (!v.ok) return v;
  const u = v.url;
  const host = u.hostname.toLowerCase();
  if (HOSTS_LOOKER.includes(host)) return looker(u, base);
  if (host === 'app.powerbi.com' || host.endsWith('.powerbi.com')) return powerbi(u, base);
  if (host === 'docs.google.com' && u.pathname.startsWith('/spreadsheets/')) return planilha(u, base);
  return { ok: true, tipo: 'site', url: u.href, pagina: null };
}

export function nomeSugerido(res) {
  if (!res || !res.ok) return '';
  if (res.tipo === 'site') return new URL(res.url).hostname.replace(/^www\./, '');
  return TIPOS[res.tipo];
}

// Modelos prontos que funcionam incorporados (widgets do TradingView em pt-BR).
function tradingView(widget, config) {
  return (
    'https://s.tradingview.com/embed-widget/' +
    widget +
    '/?locale=br#' +
    encodeURIComponent(JSON.stringify(Object.assign({ locale: 'br', colorTheme: 'dark', isTransparent: false, width: '100%', height: '100%', autosize: true }, config)))
  );
}

function cotacao(simbolo, nome) {
  return tradingView('symbol-overview', {
    symbols: [nome ? [nome, simbolo] : [simbolo]],
    chartOnly: false,
    showVolume: false,
    hideDateRanges: false,
    scalePosition: 'right',
    scaleMode: 'Normal',
    fontSize: '16',
    dateRanges: ['1d|15', '1m|1D', '12m|1W', '60m|1W']
  });
}

// Cotação de qualquer símbolo do TradingView (ex.: CAPITALCOM:ALUMINUM), para o campo "Outra cotação".
// Símbolos de bolsa (COMEX, LME, B3 futuros…) costumam aparecer como "só disponível no TradingView".
export function modeloCotacao(simbolo, nome) {
  const s = String(simbolo || '').trim().toUpperCase();
  if (!/^[A-Z0-9_.:!*\/+\-]{2,60}$/.test(s)) {
    return erro('Digite o símbolo como aparece no TradingView, por exemplo CAPITALCOM:ALUMINUM ou FX_IDC:USDBRL.');
  }
  const titulo = String(nome || '').trim().slice(0, 60) || s;
  return { ok: true, tipo: 'site', nome: titulo, url: cotacao(s.includes('|') ? s : s + '|1D', titulo) };
}

export const MODELOS = [
  { id: 'dolar', nome: 'Dólar (USD/BRL)', url: cotacao('FX_IDC:USDBRL|1D') },
  { id: 'euro', nome: 'Euro (EUR/BRL)', url: cotacao('FX_IDC:EURBRL|1D') },
  { id: 'ibovespa', nome: 'Ibovespa', url: cotacao('BMFBOVESPA:IBOV|1D') },
  { id: 'bitcoin', nome: 'Bitcoin (BTC/BRL)', url: cotacao('BINANCE:BTCBRL|1D') },
  // Metais em tonelada: tela própria do SugesconTv (/cotacoes), com US$/t e R$/kg.
  { id: 'metais', nome: 'Cobre e Alumínio (US$/t e R$/kg)', caminho: '/cotacoes?ativos=cobre,aluminio' },
  { id: 'cobre', nome: 'Cobre (US$/t e R$/kg)', caminho: '/cotacoes?ativos=cobre' },
  { id: 'aluminio', nome: 'Alumínio (US$/t e R$/kg)', caminho: '/cotacoes?ativos=aluminio' },
  { id: 'metais-dolar', nome: 'Cobre, Alumínio e Dólar', caminho: '/cotacoes?ativos=cobre,aluminio,dolar' },
  {
    id: 'cotacoes',
    nome: 'Quadro de cotações',
    url: tradingView('market-quotes', {
      symbolsGroups: [
        {
          name: 'Cotações',
          symbols: [
            { name: 'FX_IDC:USDBRL', displayName: 'Dólar' },
            { name: 'FX_IDC:EURBRL', displayName: 'Euro' },
            { name: 'BMFBOVESPA:IBOV', displayName: 'Ibovespa' },
            { name: 'BINANCE:BTCBRL', displayName: 'Bitcoin' },
            { name: 'CAPITALCOM:ALUMINUM', displayName: 'Alumínio (US$/t)' }
          ]
        }
      ],
      showSymbolLogo: true
    })
  }
];
