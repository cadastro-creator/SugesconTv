// Respostas simuladas da fonte de cotações, para testes sem internet.
const DIA = 86400;
function yahoo(fechamentos, atual) {
  return {
    chart: {
      result: [
        {
          meta: { regularMarketPrice: atual },
          timestamp: fechamentos.map((_, i) => 1760000000 + i * DIA),
          indicators: { quote: [{ close: fechamentos }] }
        }
      ]
    }
  };
}
export function buscarFalso(falhar = false) {
  const dados = {
    'HG=F': yahoo([6.5, null, 6.6], 6.7), // US$/libra
    'ALI=F': yahoo([3000, 3050], 3100), // US$/t
    'USDBRL=X': yahoo([5.4, 5.5], 5.5)
  };
  return async (url) => {
    if (falhar) throw new Error('rede');
    const simbolo = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);
    return new Response(JSON.stringify(dados[simbolo]), { status: 200 });
  };
}

