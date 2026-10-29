// Todas as rotas /api/* são tratadas por src/api.js.
import { tratar } from '../../src/api.js';

export function onRequest(contexto) {
  return tratar(contexto.request, contexto.env, { esperar: (p) => contexto.waitUntil(p) });
}
