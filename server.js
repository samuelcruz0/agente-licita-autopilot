/**
 * Autopilot de social do Agente Licita
 * Agenda e publica sozinho no Instagram via Graph API da Meta.
 *
 * Modos:
 *  - SEM META_PAGE_TOKEN → modo SECO: agendador roda, gera cards, marca postado
 *    no posts.json, mas NUNCA publica (evita post acidental). /health indica seco.
 *  - COM token+ig_user → publica de verdade via meta.js.
 *
 * Rodar o agendador: SchedulerEnable=true (padrão) + agendamento em data/posts.json
 * (campo `agendado` com data ISO). A cada tick o servidor publica quem está na
 * janela e ainda não foi publicado.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { gerarCard } = require('./card');
const meta = require('./meta');

const PORT = process.env.PORT || 8130;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const CARDS_DIR = path.join(DATA_DIR, 'cards');
const PUBLIC_DIR = path.join(__dirname, 'public');

const DIARIO = parseInt(process.env.META_POSTS_DIARIO || '1', 10);
const HORARIO = (process.env.META_HORARIO_POST || '12:00').split(':');
const AGENDADOR_ON = process.env.SCHEDULER_ENABLE !== 'false';

const app = express();
app.use(express.json());

function carregarPosts() {
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); }
  catch (e) { console.error('Falha ao ler posts.json:', e.message); return []; }
}
function salvarPosts(posts) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}
function gravarAgendamento() {
  // grava a próxima data de cada post ainda não agendado (se não tiver data)
  const posts = carregarPosts();
  let mudou = false;
  let diaAtual = 1;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  posts.forEach(p => {
    if (!p.agendado) {
      const quando = new Date(hoje.getTime() + diaAtual * 86400000);
      quando.setHours(parseInt(HORARIO[0], 10), parseInt(HORARIO[1] || '0', 10), 0, 0);
      p.agendado = quando.toISOString();
      diaAtual++;
      mudou = true;
    }
  });
  if (mudou) salvarPosts(posts);
  return posts;
}

// ===== Rotas =====

app.get('/health', (req, res) => {
  const posts = carregarPosts();
  const publicados = posts.filter(p => p.publicado).length;
  const pendentes = posts.filter(p => !p.publicado).length;
  res.json({
    ok: true,
    servico: 'autopilot-agente-licita',
    modo: process.env.META_PAGE_TOKEN ? 'publicar' : 'seco',
    scheduler: AGENDADOR_ON,
    horarioPost: HORARIO.join(':'),
    posts: { total: posts.length, publicados, pendentes },
    instagram: process.env.AGENTE_INSTAGRAM || '@licitaagente',
    hora: new Date().toISOString()
  });
});

app.get('/status', (req, res) => {
  const posts = carregarPosts();
  res.json({
    modo: process.env.META_PAGE_TOKEN ? 'publicar' : 'seco',
    scheduler: AGENDADOR_ON,
    horario: HORARIO.join(':'),
    posts
  });
});

app.get('/plano', (req, res) => {
  res.json(carregarPosts().map(({ agendado, publicado, dia, titulo, tipo }) => ({ dia, titulo, tipo, agendado, publicado })));
});

app.get('/cards/:dia.png', (req, res) => {
  const posts = carregarPosts();
  const post = posts.find(p => String(p.dia) === req.params.dia);
  if (!post) return res.status(404).json({ erro: 'dia não encontrado' });
  const arquivo = path.join(CARDS_DIR, `dia-${post.dia}.png`);
  if (fs.existsSync(arquivo)) return res.sendFile(arquivo);
  gerarCard(post, arquivo).then(f => res.sendFile(f)).catch(e => res.status(500).json({ erro: e.message }));
});

app.post('/gerar-card', (req, res) => {
  const post = req.body && req.body.post;
  if (!post || !post.titulo) return res.status(400).json({ erro: 'envie { post: { titulo, texto, tipo, hashtags } }' });
  const arquivo = path.join(CARDS_DIR, 'avulso.png');
  gerarCard(post, arquivo).then(() => {
    res.json({ ok: true, card: `/cards/avulso.png`, arquivo });
  }).catch(e => res.status(500).json({ erro: e.message }));
});

app.post('/publicar/:dia', async (req, res) => {
  const posts = carregarPosts();
  const post = posts.find(p => String(p.dia) === req.params.dia);
  if (!post) return res.status(404).json({ erro: 'dia não encontrado' });

  if (post.publicado) return res.json({ ok: true, jaPublicado: true, post });

  const arquivo = path.join(CARDS_DIR, `dia-${post.dia}.png`);
  if (!fs.existsSync(arquivo)) await gerarCard(post, arquivo);

  const legenda = montarLegenda(post);
  try {
    const r = await meta.publicarFoto(arquivo, legenda);
    post.publicado = true;
    post.publicadoEm = new Date().toISOString();
    post.link = r.url;
    salvarPosts(posts);
    res.json({ ok: true, post });
  } catch (e) {
    if (e.codigo === 'META_NAO_CONFIGURADO') {
      // modo seco: marca como publicado localmente (demonstração) — não posta
      post.publicado = true;
      post.publicadoEm = new Date().toISOString();
      post.modoSeco = true;
      salvarPosts(posts);
      return res.json({ ok: true, modoSeco: true, aviso: 'Sem token da Meta — marcado como publicado localmente (nada foi postado).', post });
    }
    res.status(500).json({ erro: e.message });
  }
});

function montarLegenda(post) {
  const tags = (post.hashtags || []).map(h => '#' + h).join(' ');
  const link = (process.env.AGENTE_LINK || 'https://agente-licita.onrender.com');
  return `${post.titulo}\n\n${post.texto || ''}\n\n${tags}\n\nTeste grátis: ${link}`;
}

app.use(express.static(PUBLIC_DIR));

// ===== Agendador =====

function tick() {
  if (!AGENDADOR_ON) return;
  const agora = new Date();
  const posts = carregarPosts();
  let mudou = false;

  for (const post of posts) {
    if (post.publicado || !post.agendado) continue;
    const quando = new Date(post.agendado);
    if (quando <= agora) {
      const arquivo = path.join(CARDS_DIR, `dia-${post.dia}.png`);
      const legenda = montarLegenda(post);
      console.log(`[autopilot] Publicando dia ${post.dia} (agendado ${post.agendado})`);
      // tenta publicar de verdade; sem token marca seco
      (async () => {
        try {
          if (!fs.existsSync(arquivo)) await gerarCard(post, arquivo);
          const r = await meta.publicarFoto(arquivo, legenda);
          post.publicado = true;
          post.publicadoEm = new Date().toISOString();
          post.link = r.url;
          console.log(`[autopilot] Publicado: ${r.url}`);
        } catch (e) {
          if (e.codigo === 'META_NAO_CONFIGURADO') {
            post.publicado = true;
            post.publicadoEm = new Date().toISOString();
            post.modoSeco = true;
            console.log(`[autopilot] (seco) Dia ${post.dia} marcado — sem token Meta`);
          } else {
            console.error(`[autopilot] Falha no dia ${post.dia}:`, e.message);
            return; // não marca publicado
          }
        }
        salvarPosts(posts);
        mudou = true;
      })();
    }
  }
}

// grava agendamento inicial (primeira vez que sobe) e agenda o tick
gravarAgendamento();
setInterval(tick, 60 * 1000); // verifica a cada 1 min
setTimeout(tick, 5000);       // primeiro tick rápido

// ===== Servidor =====
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[autopilot] no ar em http://localhost:${PORT}`);
  console.log(`[autopilot] modo: ${process.env.META_PAGE_TOKEN ? 'publicar' : 'seco'} · scheduler: ${AGENDADOR_ON}`);
});

// desliga limpo no Ctrl+C
process.on('SIGINT', () => { console.log('\n[autopilot] encerrando...'); process.exit(0); });
