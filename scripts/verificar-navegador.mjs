// Verificação de ponta a ponta com Playwright: painel, prévia e TV em sequência,
// sem erros no console e sem violações de CSP.
// Uso: npm run e2e   (os sites externos são simulados; não acessa a internet)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { criarServidor } from './servidor-local.mjs';
import { buscarFalso } from './cotacoes-falsas.mjs';

const SENHA = 'senha-e2e';
const servidor = criarServidor({ senha: SENHA, buscar: buscarFalso() });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${servidor.address().port}`;

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } });
const problemas = [];

// Simula todos os sites externos (Power BI, Looker, sites…) com uma página simples.
await contexto.route(/^https:\/\//, (rota) =>
  rota.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `<!DOCTYPE html><html><body><h1>${rota.request().url().replace(/[<>&]/g, '')}</h1></body></html>`
  })
);
await contexto.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.error('CSP: ' + e.violatedDirective + ' ' + e.blockedURI);
  });
});

function vigiar(pagina, nome) {
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    const texto = m.text();
    // 401 esperado ao abrir o painel sem login.
    if (/401 \(Unauthorized\)/.test(texto)) return;
    // 404 esperado ao abrir uma TV com código inexistente.
    if (nome === 'tv-inexistente' && /404 \(Not Found\)/.test(texto)) return;
    problemas.push(`[${nome}] ${texto}`);
  });
  pagina.on('pageerror', (e) => problemas.push(`[${nome}] erro JS: ${e.message}`));
}

const passo = (t) => console.log('• ' + t);

try {
  // ---------- painel ----------
  const admin = await contexto.newPage();
  vigiar(admin, 'admin');
  const resp = await admin.goto(BASE + '/admin');
  assert.match(resp.headers()['content-security-policy'], /script-src 'self'.*frame-ancestors 'none'/);
  assert.equal(resp.headers()['x-content-type-options'], 'nosniff');
  passo('painel abre com CSP e cabeçalhos de segurança');

  await admin.fill('#senha', 'errada');
  await admin.click('#formLogin button');
  await admin.waitForSelector('#erroLogin:has-text("Senha incorreta")');
  await admin.fill('#senha', SENHA);
  await admin.click('#formLogin button');
  await admin.waitForSelector('#telaLista:not([hidden])');
  passo('login (senha errada recusada, certa aceita)');

  await admin.fill('#nomeNova', 'Recepção');
  await admin.click('#formNova button');
  await admin.waitForSelector('#telaEditor:not([hidden])');
  const codigo = (await admin.evaluate(() => location.hash)).replace('#tela=', '');
  assert.match(codigo, /^[A-Z0-9]{6}$/);
  passo('tela criada: ' + codigo);

  await admin.fill('#linkItem', 'http://inseguro.exemplo.com');
  await admin.click('#formItem button');
  await admin.waitForSelector('#msgItem.erro:has-text("https://")');
  await admin.fill('#linkItem', 'https://docs.google.com/spreadsheets/d/1abc/edit#gid=0');
  await admin.click('#formItem button');
  await admin.waitForSelector('#msgItem.erro:has-text("Publicar na Web")');
  passo('links recusados com mensagens claras');

  await admin.fill('#linkItem', 'https://lookerstudio.google.com/u/0/reporting/REL1/page/PAG1');
  await admin.click('#formItem button');
  await admin.waitForSelector('.item[data-item="0"]', { timeout: 15000 });
  const quadroPrevia = admin.locator('#previaPalco iframe.pnt-visivel');
  await quadroPrevia.waitFor();
  assert.equal(await quadroPrevia.getAttribute('src'), 'https://lookerstudio.google.com/embed/reporting/REL1/page/PAG1');
  assert.equal(await quadroPrevia.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox');
  assert.equal(await quadroPrevia.getAttribute('referrerpolicy'), 'no-referrer');
  passo('Looker convertido para /embed/ e exibido na prévia');

  const item0 = admin.locator('.item[data-item="0"]');
  await item0.locator('.adicionar-pagina input').fill('https://lookerstudio.google.com/reporting/REL1/page/PAG2');
  await item0.locator('.adicionar-pagina button').click();
  await admin.waitForSelector('.item[data-item="0"] .pagina:nth-child(2)', { timeout: 15000 });
  passo('página adicionada ao item');

  await admin.locator('.modelos button', { hasText: 'Dólar (USD/BRL)' }).click();
  await admin.waitForSelector('.item[data-item="1"]');
  await admin.waitForSelector('#status.salvo:has-text("salvo às")', { timeout: 15000 });
  assert.ok(await admin.locator('#salvarAgora').isHidden());
  // Digitar os segundos salva sozinho, mesmo sem sair do campo.
  await admin.locator('.item[data-item="0"] .pagina input').first().fill('45');
  await admin.waitForSelector('#status.pendente');
  await admin.waitForSelector('#status.salvo:has-text("salvo às")', { timeout: 15000 });
  const salvo = await admin.evaluate(async (c) => (await (await fetch('/api/telas/' + c)).json()).itens[0].paginas[0].segundos, codigo);
  assert.equal(salvo, 45);
  passo('modelo pronto adicionado e salvo automaticamente');

  await admin.click('#formatoEmPe');
  const caixa = await admin.locator('#previaMoldura').boundingBox();
  assert.ok(caixa.height > caixa.width, 'prévia em pé');
  await admin.click('#formatoDeitada');
  passo('prévia 9:16 e 16:9');

  await admin.click('#previaSequencia');
  const vistas = new Set();
  const inicio = Date.now();
  while (vistas.size < 3 && Date.now() - inicio < 30000) {
    const src = await admin.locator('#previaPalco iframe.pnt-visivel').getAttribute('src').catch(() => null);
    if (src) vistas.add(src);
    await admin.waitForTimeout(500);
  }
  assert.equal(vistas.size, 3, 'a prévia da sequência passou pelas 3 páginas');
  await admin.click('#previaSequencia');
  if (process.env.CAPTURAS) await admin.screenshot({ path: process.env.CAPTURAS + '/painel-editor.png' });
  passo('prévia da sequência acelerada percorreu as 3 páginas');

  await admin.click('#voltar');
  await admin.waitForSelector('.tela .qr svg path');
  if (process.env.CAPTURAS) await admin.screenshot({ path: process.env.CAPTURAS + '/painel-telas.png' });
  passo('lista com link e QR code');

  // ---------- TV ----------
  const tv = await contexto.newPage();
  vigiar(tv, 'tv');
  const respTv = await tv.goto(`${BASE}/tv?tela=${codigo}&relogio=1`);
  assert.match(respTv.headers()['content-security-policy'], /frame-src https:/);
  const ordem = [];
  const inicioTv = Date.now();
  while (ordem.length < 4 && Date.now() - inicioTv < 60000) {
    const src = await tv.locator('iframe.pnt-visivel').getAttribute('src').catch(() => null);
    if (src && src !== ordem[ordem.length - 1]) ordem.push(src);
    await tv.waitForTimeout(250);
  }
  // Tempo padrão é 30 s; reduz para 5 s pela API e espera a TV aplicar.
  assert.ok(ordem.length >= 1);
  assert.ok(await tv.locator('#relogio:not(.pnt-oculto)').isVisible());
  const guardado = await tv.evaluate((c) => localStorage.getItem('sugescontv:' + c), codigo);
  assert.ok(guardado && JSON.parse(guardado).itens.length === 2, 'lista guardada no localStorage');
  passo('TV abriu a primeira página, relógio e cache local');

  // TV acelerada: ajusta os tempos para 5 s e recarrega.
  await admin.evaluate(async (c) => {
    const t = await (await fetch('/api/telas/' + c)).json();
    t.itens.forEach((i) => i.paginas.forEach((p) => (p.segundos = 5)));
    await fetch('/api/telas/' + c, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: t.itens }) });
  }, codigo);
  const pedidosTv = {};
  tv.on('request', (r) => {
    if (r.url().startsWith('https://')) pedidosTv[r.url()] = (pedidosTv[r.url()] || 0) + 1;
  });
  await tv.reload();
  const seq = [];
  const t0 = Date.now();
  while (seq.length < 4 && Date.now() - t0 < 40000) {
    const visiveis = await tv.locator('iframe.pnt-visivel').count();
    assert.ok(visiveis <= 1);
    const src = await tv.locator('iframe.pnt-visivel').getAttribute('src').catch(() => null);
    if (src && src !== seq[seq.length - 1]) seq.push(src);
    await tv.waitForTimeout(200);
  }
  assert.deepEqual(seq.slice(0, 4).map((u) => u.split('/').pop().split('#')[0].slice(0, 20)), ['PAG1', 'PAG2', '?locale=br', 'PAG1']);
  passo('TV rodou as páginas em sequência e voltou ao início');

  // Cache: na segunda volta nada é baixado de novo e todas as páginas ficam prontas na memória.
  assert.equal(await tv.locator('iframe').count(), 3, 'as 3 páginas ficam carregadas');
  const pag1 = Object.keys(pedidosTv).find((u) => u.endsWith('/page/PAG1'));
  assert.equal(pedidosTv[pag1], 1, 'a página 1 foi baixada uma vez só');
  assert.ok(Object.values(pedidosTv).every((n) => n === 1), 'nenhuma página recarregada: ' + JSON.stringify(pedidosTv));
  passo('páginas ficam em cache: troca instantânea sem recarregar');

  // Limite de memória: com ?quadros=2 só 2 páginas ficam carregadas e a sequência continua.
  const economica = await contexto.newPage();
  vigiar(economica, 'tv-economica');
  await economica.goto(`${BASE}/tv?tela=${codigo}&quadros=2`);
  const seqEco = [];
  const t1 = Date.now();
  while (seqEco.length < 4 && Date.now() - t1 < 40000) {
    assert.ok((await economica.locator('iframe').count()) <= 2, 'no máximo 2 iframes');
    const src = await economica.locator('iframe.pnt-visivel').getAttribute('src').catch(() => null);
    if (src && src !== seqEco[seqEco.length - 1]) seqEco.push(src);
    await economica.waitForTimeout(200);
  }
  assert.equal(seqEco.length, 4, 'modo econômico também gira');
  await economica.close();
  passo('?quadros=2 limita a memória e continua girando');

  // "Reiniciar TVs" no painel: a TV recarrega a página na próxima consulta (até 1 min).
  await tv.evaluate(() => (window.__antesDoReinicio = true));
  await admin.click('.tela .botao.principal');
  await admin.waitForSelector('#telaEditor:not([hidden])');
  admin.once('dialog', (d) => d.accept());
  await admin.click('#reiniciarTvs');
  await admin.waitForSelector('#status:has-text("reiniciam")');
  await tv.waitForFunction(() => !window.__antesDoReinicio, null, { timeout: 75000 });
  await tv.waitForSelector('iframe.pnt-visivel');
  passo('botão "Reiniciar TVs" recarrega a TV');

  await contexto.setOffline(true);
  await tv.waitForSelector('#semConexao:not(.pnt-oculto)');
  await contexto.setOffline(false);
  await tv.waitForSelector('#semConexao.pnt-oculto', { state: 'attached' });
  passo('aviso "sem conexão" aparece e some');

  const vertical = await contexto.newPage();
  vigiar(vertical, 'tv-vertical');
  await vertical.setViewportSize({ width: 1280, height: 720 });
  await vertical.goto(`${BASE}/tv?tela=${codigo}&girar=90`);
  await vertical.waitForSelector('iframe.pnt-visivel');
  const medidas = await vertical.evaluate(() => {
    const p = document.getElementById('palco');
    return [p.style.width, p.style.height, p.style.transform];
  });
  assert.deepEqual(medidas, ['720px', '1280px', 'translate(1280px, 0px) rotate(90deg)']);
  await vertical.setViewportSize({ width: 1920, height: 1080 });
  await vertical.waitForFunction(() => document.getElementById('palco').style.width === '1080px');
  passo('?girar=90 recalcula as medidas no resize');

  const inexistente = await contexto.newPage();
  vigiar(inexistente, 'tv-inexistente');
  await inexistente.goto(`${BASE}/tv?tela=ZZZZZZ`);
  await inexistente.waitForSelector('#mensagem:has-text("não encontrada")');
  passo('código inexistente mostra aviso');

  const cot = await contexto.newPage();
  vigiar(cot, 'cotacoes');
  const respCot = await cot.goto(`${BASE}/cotacoes?ativos=cobre,aluminio,dolar`);
  assert.match(respCot.headers()['content-security-policy'], /frame-ancestors 'self'/);
  assert.doesNotMatch(respCot.headers()['content-security-policy'], /frame-ancestors 'none'/);
  await cot.waitForSelector('.cot-linha:nth-child(3) svg path');
  const textoCot = await cot.locator('#ativos').innerText();
  assert.match(textoCot, /Cobre \(US\$\/t\)/);
  assert.match(textoCot, /US\$ 14\.771/);
  assert.match(textoCot, /R\$ 81,24/);
  if (process.env.CAPTURAS) await cot.screenshot({ path: process.env.CAPTURAS + '/cotacoes.png' });
  passo('tela de cotações: cobre e alumínio em US$/t e R$/kg');

  // Ignora erros de rede do teste offline.
  const reais = problemas.filter((p) => !/ERR_INTERNET_DISCONNECTED|net::ERR/.test(p));
  assert.deepEqual(reais, [], 'sem erros no console nem violações de CSP');
  passo('nenhum erro no console e nenhuma violação de CSP');
  console.log('\nTudo certo.');
} catch (e) {
  console.error('\nFALHOU:', e.message);
  if (problemas.length) console.error('Console:\n' + problemas.join('\n'));
  process.exitCode = 1;
} finally {
  await navegador.close();
  servidor.close();
}
