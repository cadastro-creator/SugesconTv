// Modo imagem: páginas marcadas são fotografadas de tempos em tempos (GitHub Actions)
// e a TV mostra a foto, em vez de abrir o site ao vivo.

const codificador = new TextEncoder();

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Identificador da foto de um link (o mesmo link em várias telas usa a mesma foto).
export async function chaveFoto(url) {
  return hex(await crypto.subtle.digest('SHA-256', codificador.encode(url))).slice(0, 24);
}

// Chave de acesso do robô das fotos, derivada da senha do painel (mostrada no painel).
export async function tokenFotos(senha) {
  const k = await crypto.subtle.importKey('raw', codificador.encode(senha), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, codificador.encode('sugescontv-fotos-v1'))).slice(0, 40);
}

// Acrescenta a chave da foto às páginas dos itens em modo imagem.
export async function marcarFotos(itens) {
  return Promise.all(
    (itens || []).map(async (item) => {
      if (!item.imagem) return item;
      const paginas = await Promise.all(item.paginas.map(async (p) => ({ ...p, foto: await chaveFoto(p.url) })));
      return { ...item, paginas };
    })
  );
}
