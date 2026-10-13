import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { gerarQR } from '../public/assets/qr.js';

function decodificar(matriz) {
  const escala = 4;
  const borda = 4;
  const n = (matriz.length + borda * 2) * escala;
  const pixels = new Uint8ClampedArray(n * n * 4).fill(255);
  matriz.forEach((linha, l) =>
    linha.forEach((v, c) => {
      if (!v) return;
      for (let y = 0; y < escala; y++)
        for (let x = 0; x < escala; x++) {
          const i = (((l + borda) * escala + y) * n + (c + borda) * escala + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    })
  );
  const r = jsQR(pixels, n, n);
  return r && r.data;
}

test('QR code gerado localmente é lido corretamente (várias versões)', () => {
  const textos = [
    'https://a.b/tv?tela=K7Q2PX',
    'https://sugescontv.pages.dev/tv?tela=K7Q2PX',
    'https://dashboards.minhaempresa.com.br/tv?tela=ABCDEF&relogio=1',
    'https://um-endereco-bem-mais-comprido.minhaempresa-exemplo.com.br/tv?tela=K7Q2PX&relogio=1&girar=90',
    'https://' + 'x'.repeat(150) + '.com/tv?tela=K7Q2PX'
  ];
  const versoes = new Set();
  for (const t of textos) {
    const m = gerarQR(t);
    versoes.add((m.length - 17) / 4);
    assert.equal(decodificar(m), t, t);
  }
  assert.ok(versoes.size >= 4, 'testou várias versões: ' + [...versoes]);
  assert.ok([...versoes].some((v) => v >= 7), 'inclui versão com informação de versão');
});

test('QR code recusa texto longo demais', () => {
  assert.throws(() => gerarQR('x'.repeat(300)), /longo demais/);
});
