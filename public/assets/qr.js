// Gerador de QR code sem bibliotecas externas (modo byte, correção M, versões 1 a 10).

// [palavras de correção por bloco, blocos do grupo 1, dados por bloco g1, blocos g2, dados por bloco g2]
const BLOCOS_M = [
  null,
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44]
];
const ALINHAMENTO = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// Aritmética no corpo de Galois GF(256)
const EXP = new Array(512);
const LOG = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mult = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function geradorRS(grau) {
  let g = [1];
  for (let i = 0; i < grau; i++) {
    const novo = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j];
      novo[j + 1] ^= mult(g[j], EXP[i]);
    }
    g = novo;
  }
  return g;
}

function correcaoRS(dados, grau) {
  const g = geradorRS(grau);
  const resto = new Array(grau).fill(0);
  for (const d of dados) {
    const fator = d ^ resto.shift();
    resto.push(0);
    for (let i = 0; i < grau; i++) resto[i] ^= mult(g[i + 1], fator);
  }
  return resto;
}

function dadosPorVersao(v) {
  const [, b1, d1, b2, d2] = BLOCOS_M[v];
  return b1 * d1 + b2 * d2;
}

function codificarDados(bytes, versao) {
  const bits = [];
  const por = (valor, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  por(0b0100, 4);
  por(bytes.length, versao < 10 ? 8 : 16);
  for (const b of bytes) por(b, 8);
  const capacidade = dadosPorVersao(versao) * 8;
  por(0, Math.min(4, capacidade - bits.length));
  while (bits.length % 8) bits.push(0);
  const palavras = [];
  for (let i = 0; i < bits.length; i += 8) palavras.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; palavras.length < dadosPorVersao(versao); p++) palavras.push(p % 2 ? 0x11 : 0xec);

  // Divide em blocos, calcula a correção e intercala.
  const [ec, b1, d1, b2, d2] = BLOCOS_M[versao];
  const blocos = [];
  let pos = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const tam = i < b1 ? d1 : d2;
    const dados = palavras.slice(pos, pos + tam);
    pos += tam;
    blocos.push({ dados, ec: correcaoRS(dados, ec) });
  }
  const final = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocos) if (i < b.dados.length) final.push(b.dados[i]);
  for (let i = 0; i < ec; i++) for (const b of blocos) final.push(b.ec[i]);
  return final;
}

function bch(valor, gerador, bitsGerador) {
  let v = valor << (bitsGerador - 1);
  for (let i = 31; i >= bitsGerador - 1; i--) if ((v >>> i) & 1) v ^= gerador << (i - bitsGerador + 1);
  return v;
}

const MASCARAS = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0
];

function montarMatriz(versao, palavras, mascara) {
  const n = versao * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(null));
  const reservado = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixo = (l, c, v) => {
    m[l][c] = v;
    reservado[l][c] = true;
  };

  const localizador = (l0, c0) => {
    for (let l = -1; l <= 7; l++)
      for (let c = -1; c <= 7; c++) {
        const L = l0 + l;
        const C = c0 + c;
        if (L < 0 || C < 0 || L >= n || C >= n) continue;
        const borda = l === -1 || l === 7 || c === -1 || c === 7;
        const anel = l === 0 || l === 6 || c === 0 || c === 6;
        const miolo = l >= 2 && l <= 4 && c >= 2 && c <= 4;
        fixo(L, C, !borda && (anel || miolo));
      }
  };
  localizador(0, 0);
  localizador(0, n - 7);
  localizador(n - 7, 0);

  for (let i = 8; i < n - 8; i++) {
    fixo(6, i, i % 2 === 0);
    fixo(i, 6, i % 2 === 0);
  }

  const pos = ALINHAMENTO[versao];
  const ultimo = pos.length - 1;
  pos.forEach((l, i) =>
    pos.forEach((c, j) => {
      // os três cantos dos localizadores não recebem alinhamento
      if ((i === 0 && j === 0) || (i === 0 && j === ultimo) || (i === ultimo && j === 0)) return;
      for (let dl = -2; dl <= 2; dl++)
        for (let dc = -2; dc <= 2; dc++) fixo(l + dl, c + dc, Math.max(Math.abs(dl), Math.abs(dc)) !== 1);
    })
  );

  // Informação de formato (correção M = 00) com máscara 0x5412.
  const formato = (((0b00 << 3) | mascara) << 10 | bch((0b00 << 3) | mascara, 0x537, 11)) ^ 0x5412;
  for (let i = 0; i < 15; i++) {
    const bit = ((formato >>> i) & 1) === 1;
    // cópia 1
    if (i < 6) fixo(i, 8, bit);
    else if (i === 6) fixo(7, 8, bit);
    else if (i === 7) fixo(8, 8, bit);
    else if (i === 8) fixo(8, 7, bit);
    else fixo(8, 14 - i, bit);
    // cópia 2
    if (i < 8) fixo(8, n - 1 - i, bit);
    else fixo(n - 15 + i, 8, bit);
  }
  fixo(n - 8, 8, true); // módulo escuro fixo

  if (versao >= 7) {
    const info = (versao << 12) | bch(versao, 0x1f25, 13);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + n - 11;
      fixo(a, b, bit);
      fixo(b, a, bit);
    }
  }

  // Dados em zigue-zague, da direita para a esquerda.
  const bits = [];
  for (const p of palavras) for (let i = 7; i >= 0; i--) bits.push((p >>> i) & 1);
  let k = 0;
  let subindo = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let j = 0; j < n; j++) {
      const l = subindo ? n - 1 - j : j;
      for (let d = 0; d < 2; d++) {
        const C = c - d;
        if (reservado[l][C]) continue;
        let v = k < bits.length ? bits[k] === 1 : false;
        k++;
        if (MASCARAS[mascara](l, C)) v = !v;
        m[l][C] = v;
      }
    }
    subindo = !subindo;
  }
  return m;
}

function penalidade(m) {
  const n = m.length;
  let p = 0;
  // Regra 1: sequências de 5+ módulos iguais
  for (let l = 0; l < n; l++)
    for (const linha of [true, false]) {
      let corrida = 1;
      for (let i = 1; i < n; i++) {
        const a = linha ? m[l][i] : m[i][l];
        const b = linha ? m[l][i - 1] : m[i - 1][l];
        if (a === b) corrida++;
        else {
          if (corrida >= 5) p += corrida - 2;
          corrida = 1;
        }
      }
      if (corrida >= 5) p += corrida - 2;
    }
  // Regra 2: blocos 2x2
  for (let l = 0; l < n - 1; l++)
    for (let c = 0; c < n - 1; c++) {
      const v = m[l][c];
      if (v === m[l][c + 1] && v === m[l + 1][c] && v === m[l + 1][c + 1]) p += 3;
    }
  // Regra 3: padrões parecidos com localizadores
  const padroes = ['10111010000', '00001011101'];
  for (let l = 0; l < n; l++) {
    let linha = '';
    let coluna = '';
    for (let i = 0; i < n; i++) {
      linha += m[l][i] ? '1' : '0';
      coluna += m[i][l] ? '1' : '0';
    }
    for (const s of [linha, coluna])
      for (const pd of padroes) {
        let i = s.indexOf(pd);
        while (i !== -1) {
          p += 40;
          i = s.indexOf(pd, i + 1);
        }
      }
  }
  // Regra 4: proporção de escuros
  let escuros = 0;
  for (const linha of m) for (const v of linha) if (v) escuros++;
  p += Math.floor(Math.abs((escuros * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

// Retorna a matriz (array de linhas com true = escuro).
export function gerarQR(texto) {
  const bytes = Array.from(new TextEncoder().encode(texto));
  let versao = 1;
  while (versao <= 10 && dadosPorVersao(versao) < bytes.length + (versao < 10 ? 2 : 3)) versao++;
  if (versao > 10) throw new Error('Texto longo demais para o QR code.');
  const palavras = codificarDados(bytes, versao);
  let melhor = null;
  let menor = Infinity;
  for (let mascara = 0; mascara < 8; mascara++) {
    const m = montarMatriz(versao, palavras, mascara);
    const p = penalidade(m);
    if (p < menor) {
      menor = p;
      melhor = m;
    }
  }
  return melhor;
}

// Cria um elemento <svg> com o QR code (sem estilos em linha, compatível com a CSP).
export function qrSvg(texto, tamanho = 160) {
  const m = gerarQR(texto);
  const borda = 4;
  const n = m.length + borda * 2;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('width', tamanho);
  svg.setAttribute('height', tamanho);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code: ' + texto);
  const fundo = document.createElementNS(NS, 'rect');
  fundo.setAttribute('width', n);
  fundo.setAttribute('height', n);
  fundo.setAttribute('fill', '#fff');
  svg.appendChild(fundo);
  let d = '';
  m.forEach((linha, l) =>
    linha.forEach((v, c) => {
      if (v) d += `M${c + borda} ${l + borda}h1v1h-1z`;
    })
  );
  const caminho = document.createElementNS(NS, 'path');
  caminho.setAttribute('d', d);
  caminho.setAttribute('fill', '#000');
  svg.appendChild(caminho);
  return svg;
}
