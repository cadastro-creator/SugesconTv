// Imitação simples do Cloudflare KV para desenvolvimento local e testes.
import { readFileSync, writeFileSync } from 'node:fs';

export function criarKvMemoria(arquivo) {
  let dados = {};
  if (arquivo) {
    try {
      dados = JSON.parse(readFileSync(arquivo, 'utf8'));
    } catch {
      dados = {};
    }
  }
  const salvar = () => arquivo && writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  const vivo = (k) => {
    const d = dados[k];
    if (!d) return null;
    if (d.expiration && d.expiration <= Date.now() / 1000) {
      delete dados[k];
      return null;
    }
    return d;
  };
  return {
    dados,
    async get(k, tipo) {
      const d = vivo(k);
      if (!d) return null;
      return tipo === 'json' ? JSON.parse(d.valor) : d.valor;
    },
    async put(k, valor, op = {}) {
      dados[k] = { valor: String(valor), metadata: op.metadata || null, expiration: op.expiration || null };
      salvar();
    },
    async delete(k) {
      delete dados[k];
      salvar();
    },
    async list({ prefix = '' } = {}) {
      const keys = Object.keys(dados)
        .filter((k) => k.startsWith(prefix) && vivo(k))
        .sort()
        .map((name) => ({ name, metadata: dados[name].metadata }));
      return { keys, list_complete: true };
    }
  };
}
