/**
 * Smoke test do autopilot — sobe em porta separada, testa /health, /plano,
 * geração de card e proteção, depois desliga.
 * Não precisa de token da Meta (roda em modo seco).
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 8131;
const TOKEN = process.env.SMOKE_TOKEN || 'segredo-autopilot';
let terminado = false;
let saiu = false;

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${url}`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString('utf8') });
      });
    }).on('error', reject);
  });
}

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const req = http.request({
      hostname: 'localhost', port: PORT, path: url, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString('utf8') });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function aguardarSaude(tentativas = 40) {
  return new Promise((resolve, reject) => {
    const tenta = async (n) => {
      try {
        const r = await get('/health');
        if (r.status === 200) return resolve(r);
      } catch (e) {}
      if (n <= 0) return reject(new Error('servidor não subiu'));
      setTimeout(() => tenta(n - 1), 500);
    };
    tenta(tentativas);
  });
}

function gerarCard(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost', port: PORT, path: '/gerar-card',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let dados = '';
      res.on('data', c => dados += c);
      res.on('end', () => resolve({ status: res.statusCode, body: dados }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const filho = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  filho.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  filho.stderr.on('data', d => process.stderr.write(`[server-err] ${d}`));
  filho.on('exit', () => { saiu = true; });

  let falhas = 0;
  const falha = (msg) => { falhas++; console.error('✗ ' + msg); };
  const ok = (msg) => console.log('✓ ' + msg);

  try {
    await aguardarSaude();
    ok('servidor subiu');

    const health = await get('/health');
    const hj = JSON.parse(health.text);
    ok('health respondeu');
    if (hj.ok && hj.modo === 'seco') ok('modo seco (sem token Meta)');
    else falha('health não mostra modo seco: ' + health.text);
    if (hj.posts && hj.posts.total === 30) ok('plano tem 30 posts');
    else falha('posts total != 30: ' + (hj.posts && hj.posts.total));

    const plano = await get('/plano');
    const pl = JSON.parse(plano.text);
    if (Array.isArray(pl) && pl.length === 30) ok('GET /plano: 30 itens');
    else falha('plano não tem 30: ' + plano.text);

    const card = await gerarCard({ post: { titulo: 'Teste do card', texto: 'Testando a geração de imagem do autopilot.', tipo: 'educar', hashtags: ['teste', 'licitacoes'] } });
    const cardText = (card.text || card.body || '').toString();
    let cj;
    try { cj = JSON.parse(cardText); } catch (e) { falha('card não é JSON: status ' + card.status + ' body ' + cardText.slice(0, 300)); throw e; }
    if (card.status === 200 && cj.ok) ok('card gerado: ' + cj.card);
    else falha('card não gerado: status ' + card.status + ' ' + cardText);

    // card do dia 1 direto (binário PNG)
    const c1 = await get('/cards/1.png');
    const ehPng = c1.headers['content-type'] && c1.headers['content-type'].includes('png');
    if (c1.status === 200 && ehPng) ok('GET /cards/1.png: PNG ok (content-type)');
    else falha('card dia 1 não PNG: status ' + c1.status + ' type ' + c1.headers['content-type']);

    // publicar em modo seco (sem token) — deve marcar seco, não postar.
    // escolhe o primeiro post ainda não publicado (o agendador pode ter marcado o dia 1)
    const pendente = pl.find(p => !p.publicado);
    if (!pendente) { falha('nenhum post pendente para testar'); }
    else {
      const pub = await post('/publicar/' + pendente.dia, {});
      const pj = JSON.parse(pub.text);
      if (pub.status === 200 && pj.modoSeco) ok('POST /publicar/' + pendente.dia + ' (seco) ok');
      else falha('publicar seco falhou: ' + pub.text);
    }

  } catch (e) {
    falha('erro geral: ' + e.message);
  } finally {
    if (!terminado) {
      terminado = true;
      filho.kill();
      // pequena espera para o log de saída aparecer antes do exit
      await new Promise(r => setTimeout(r, 800));
    }
  }

  console.log(falhas === 0 ? '\n✅ Todos os testes passaram.' : `\n❌ ${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
})();
