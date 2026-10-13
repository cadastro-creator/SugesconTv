import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisarLink, validarEndereco, MODELOS } from '../public/assets/links.js';

const OCULTAR = 'navContentPaneEnabled=false&filterPaneEnabled=false';

test('Looker Studio: converte /reporting/ para /embed/reporting/ mantendo a página', () => {
  const r = analisarLink('https://lookerstudio.google.com/u/0/reporting/abc-123_X/page/p_xyz9?s=1');
  assert.equal(r.ok, true);
  assert.equal(r.tipo, 'looker');
  assert.equal(r.url, 'https://lookerstudio.google.com/embed/reporting/abc-123_X/page/p_xyz9');
  assert.equal(r.pagina, 'p_xyz9');
});

test('Looker Studio: aceita Data Studio, link já incorporado e relatório sem página', () => {
  assert.equal(analisarLink('https://datastudio.google.com/reporting/R1').url, 'https://lookerstudio.google.com/embed/reporting/R1');
  assert.equal(
    analisarLink('https://lookerstudio.google.com/embed/reporting/R1/page/P2').url,
    'https://lookerstudio.google.com/embed/reporting/R1/page/P2'
  );
});

test('Looker Studio: link curto e link sem relatório são recusados com orientação', () => {
  assert.match(analisarLink('https://lookerstudio.google.com/s/abc').erro, /link curto/);
  assert.match(analisarLink('https://lookerstudio.google.com/navigation/reporting').erro, /reporting/);
});

test('Looker Studio: avisa quando a página é de outro relatório', () => {
  const base = { tipo: 'looker', url: 'https://lookerstudio.google.com/embed/reporting/R1/page/P1' };
  assert.equal(analisarLink('https://lookerstudio.google.com/reporting/R1/page/P2', base).aviso, undefined);
  assert.match(analisarLink('https://lookerstudio.google.com/reporting/R9/page/P2', base).aviso, /outro relatório/);
});

test('Power BI: Publicar na Web ganha parâmetros para esconder as barras', () => {
  const r = analisarLink('https://app.powerbi.com/view?r=eyJrIjoiYWJj');
  assert.equal(r.ok, true);
  assert.equal(r.tipo, 'powerbi');
  assert.equal(r.url, 'https://app.powerbi.com/view?r=eyJrIjoiYWJj&' + OCULTAR);
});

test('Power BI: mantém pageName e aceita página colada do serviço ou só o nome da seção', () => {
  const r = analisarLink('https://app.powerbi.com/view?r=eyJ&pageName=ReportSection2');
  assert.equal(r.url, 'https://app.powerbi.com/view?r=eyJ&pageName=ReportSection2&' + OCULTAR);
  const base = { tipo: 'powerbi', url: r.url };
  const p = analisarLink('https://app.powerbi.com/groups/me/reports/1111-2222/ReportSection9a8b?experience=power-bi', base);
  assert.equal(p.url, 'https://app.powerbi.com/view?r=eyJ&pageName=ReportSection9a8b&' + OCULTAR);
  assert.equal(analisarLink('ReportSection77', base).url, 'https://app.powerbi.com/view?r=eyJ&pageName=ReportSection77&' + OCULTAR);
});

test('Power BI: links que exigem login são recusados pedindo Publicar na Web', () => {
  assert.match(analisarLink('https://app.powerbi.com/reportEmbed?reportId=1&autoAuth=true').erro, /Publicar na Web/);
  assert.match(analisarLink('https://app.powerbi.com/groups/me/reports/1111/ReportSection').erro, /Publicar na Web/);
});

test('Planilhas: converte link publicado e cada aba vira página pelo gid', () => {
  const r = analisarLink('https://docs.google.com/spreadsheets/d/e/2PACX-1vAbC/pubhtml');
  assert.equal(r.tipo, 'planilha');
  assert.equal(r.url, 'https://docs.google.com/spreadsheets/d/e/2PACX-1vAbC/pubhtml?widget=true&headers=false&chrome=false');
  const aba = analisarLink('https://docs.google.com/spreadsheets/d/e/2PACX-1vAbC/pubhtml?gid=123&single=true');
  assert.equal(aba.url, 'https://docs.google.com/spreadsheets/d/e/2PACX-1vAbC/pubhtml?gid=123&single=true&widget=true&headers=false&chrome=false');
  const base = { tipo: 'planilha', url: r.url };
  const outra = analisarLink('https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=456', base);
  assert.equal(outra.url, 'https://docs.google.com/spreadsheets/d/e/2PACX-1vAbC/pubhtml?gid=456&single=true&widget=true&headers=false&chrome=false');
});

test('Planilhas: link normal sem publicar avisa que é preciso publicar', () => {
  assert.match(analisarLink('https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0').erro, /Publicar na Web/);
});

test('Sites: qualquer https público é aceito como site', () => {
  const r = analisarLink('  https://www.exemplo.com.br/painel?x=1#topo ');
  assert.equal(r.ok, true);
  assert.equal(r.tipo, 'site');
  assert.equal(r.url, 'https://www.exemplo.com.br/painel?x=1#topo');
});

test('Recusas: http, IPs, localhost, portas, credenciais e outros esquemas', () => {
  const recusados = [
    'http://exemplo.com',
    'https://192.168.0.10/painel',
    'https://2130706433/',
    'https://0x7f.1/',
    'https://[::1]/',
    'https://localhost/',
    'https://app.localhost/',
    'https://impressora.local/',
    'https://intranet/',
    'https://exemplo.com:8443/',
    'https://user:senha@exemplo.com/',
    'javascript:alert(1)',
    'ftp://exemplo.com/arquivo',
    'data:text/html,oi',
    'file:///etc/passwd',
    'exemplo.com',
    ''
  ];
  for (const link of recusados) {
    const r = analisarLink(link);
    assert.equal(r.ok, false, link);
    assert.ok(r.erro, link);
  }
  assert.equal(validarEndereco('https://exemplo.com').ok, true);
});

test('Modelos prontos: widgets do TradingView em pt-BR e válidos', () => {
  assert.ok(MODELOS.length >= 4);
  for (const m of MODELOS) {
    const r = analisarLink(m.url);
    assert.equal(r.ok, true, m.nome);
    assert.match(m.url, /^https:\/\/s\.tradingview\.com\/embed-widget\/.+locale=br/);
  }
});
