import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obterCotacoes, lerLista } from '../src/cotacoes.js';
import { tratar } from '../src/api.js';
import { criarKvMemoria } from '../scripts/kv-memoria.mjs';

import { buscarFalso } from '../scripts/cotacoes-falsas.mjs';

test('cotações: cobre convertido de libra para tonelada e R$/kg', async () => {
  const r = await obterCotacoes(['cobre', 'aluminio', 'dolar'], buscarFalso());
  const [cobre, aluminio, dolar] = r.ativos;
  assert.equal(r.dolar, 5.5);
  assert.equal(cobre.unidade, 'US$/t');
  assert.equal(cobre.preco, Math.round(6.7 * 2204.62262 * 100) / 100); // ≈ 14.771
  assert.equal(cobre.brlKg, Math.round(((cobre.preco * 5.5) / 1000) * 100) / 100); // ≈ 81,24
  assert.equal(cobre.historico.length, 2, 'ignora fechamento vazio');
  assert.equal(aluminio.preco, 3100);
  assert.equal(aluminio.brlKg, 17.05);
  assert.equal(aluminio.variacao, Math.round(((3100 - 3000) / 3000) * 10000) / 100);
  assert.equal(dolar.unidade, 'R$');
  assert.equal(dolar.brlKg, undefined);
});

test('cotações: lista de ativos validada', () => {
  assert.deepEqual(lerLista('cobre,xyz,cobre'), ['cobre']);
  assert.deepEqual(lerLista(''), ['cobre', 'aluminio', 'dolar']);
});

test('API /api/cotacoes: pública e usa a última cotação boa se a fonte cair', async () => {
  const env = { PAINEL_KV: criarKvMemoria(), ADMIN_PASSWORD: 'x' };
  const pedir = (buscar) => tratar(new Request('https://painel.exemplo.com/api/cotacoes?ativos=cobre'), env, { buscar });
  const ok = await pedir(buscarFalso());
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('cache-control'), /max-age=600/);
  const dados = await ok.json();
  assert.equal(dados.ativos[0].id, 'cobre');
  const reserva = await pedir(buscarFalso(true));
  assert.equal(reserva.status, 200);
  assert.equal((await reserva.json()).atrasado, true);
  const semNada = await tratar(new Request('https://painel.exemplo.com/api/cotacoes?ativos=aluminio'), env, { buscar: buscarFalso(true) });
  assert.equal(semNada.status, 502);
});
