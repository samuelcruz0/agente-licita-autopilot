/**
 * meta.js — publicação no Instagram via Graph API da Meta (API oficial)
 *
 * Fluxo real (obrigatório — regra da própria Meta para postagem automática):
 *   Instagram profissional (tipo Empresa) → linkado a uma Página do Facebook
 *   → App na Meta Developers → Long-lived token → POST no Instagram container
 *   → publicação.
 *
 * Sem token válido o servidor NUNCA publica de verdade — só agenda no arquivo
 * `data/posts.json` (modo seco, `SECO`). Isso evita postar acidentalmente e
 * permite testar o agendador sem chave.
 */
'use strict';
const fetch = require('node-fetch');

const GRAPH = 'https://graph.facebook.com/v21.0';

function extrairErro(res) {
  const b = res.body || {};
  if (b.error && b.error.message) return b.error.message;
  return `HTTP ${res.status}`;
}

/**
 * Publica uma imagem única no Instagram.
 * - se META_PAGE_TOKEN não estiver definido, retorna erro claro (não publica).
 * - carrega a imagem local, cria o container e confirma a publicação.
 */
async function publicarFoto(imagemPath, legenda) {
  const token = process.env.META_PAGE_TOKEN;
  const igUserId = process.env.META_IG_USER_ID;
  if (!token || !igUserId) {
    const e = new Error('META_PAGE_TOKEN / META_IG_USER_ID não configurados');
    e.codigo = 'META_NAO_CONFIGURADO';
    throw e;
  }

  const url = new URL(imagemPath);
  let imagemData = null;
  if (url.protocol === 'file:' || !/^https?:/.test(imagemPath)) {
    const fs = require('fs');
    const b64 = fs.readFileSync(imagemPath).toString('base64');
    imagemData = 'data:image/png;base64,' + b64;
  } else {
    // URL pública — deixa a Meta baixar direto
    imagemData = imagemPath;
  }

  // 1. container da imagem
  const cont = await fetch(
    `${GRAPH}/${igUserId}/media?image_url=${encodeURIComponent(imagemData)}&caption=${encodeURIComponent(legenda)}&access_token=${encodeURIComponent(token)}`,
    { method: 'POST' }
  );
  const contJson = await cont.json();
  if (!cont.ok) throw new Error('Erro ao criar container: ' + extrairErro(cont));

  const creationId = contJson.id;

  // 2. confirma a publicação
  const pub = await fetch(
    `${GRAPH}/${igUserId}/media_publish?creation_id=${creationId}&access_token=${encodeURIComponent(token)}`,
    { method: 'POST' }
  );
  const pubJson = await pub.json();
  if (!pub.ok) throw new Error('Erro ao publicar: ' + extrairErro(pub));

  return { container: creationId, media: pubJson.id, url: `https://www.instagram.com/p/${pubJson.id}/` };
}

module.exports = { publicarFoto, GRAPH };
