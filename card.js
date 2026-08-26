/**
 * card.js — gera os cards 1080x1350 (identidade do Agente Licita)
 * Desenha um SVG (mesmo layout/cores do app) e converte para PNG com `sharp`
 * (binários pré-compilados — sem build de C++ no Windows).
 * Cores da identidade (ver Playbook Instagram):
 *   azul #0071e3 · azul escuro #0059c1 · verde #25D366 · amarelo #FFC107
 */
'use strict';
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const LARGURA = 1080;
const ALTURA = 1350;

// Tipos possíveis de card
const TIPOS = {
  atencao:     { cor: '#0059c1', icone: '🎯' },
  autoridade:  { cor: '#0071e3', icone: '🏗️' },
  educar:      { cor: '#0071e3', icone: '📄' },
  conversao:   { cor: '#0059c1', icone: '💬' },
  prova:       { cor: '#1f8a4c', icone: '✅' },
  regional:    { cor: '#0a6e8a', icone: '📍' },
  oferta:      { cor: '#b98a00', icone: '💰' },
  duvida:      { cor: '#4a4a4a', icone: '❓' },
  demonstracao:{ cor: '#0071e3', icone: '📱' },
};

// escapa texto para uso seguro dentro do SVG
function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// quebra texto em linhas de ~N caracteres (estimativa; SVG não mede fácil)
function quebrar(texto, maxChars) {
  const palavras = String(texto || '').split(/\s+/);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? atual + ' ' + p : p;
    if (teste.length <= maxChars) atual = teste;
    else { if (atual) linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function gerarSvg(post) {
  const estilo = TIPOS[post.tipo] || TIPOS.educar;
  const cor = estilo.cor;

  const tituloLinhas = quebrar(post.titulo, 16).slice(0, 3);
  const textoLinhas = quebrar(post.texto, 26).slice(0, 9);
  const tags = (post.hashtags || []).slice(0, 3);

  const svg = [];
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}" viewBox="0 0 ${LARGURA} ${ALTURA}">`);
  svg.push(`  <rect width="${LARGURA}" height="${ALTURA}" fill="#ffffff"/>`);

  // faixa superior colorida
  svg.push(`  <rect x="0" y="0" width="${LARGURA}" height="420" fill="${cor}"/>`);

  // linhas decorativas "de prancha"
  for (let i = 0; i < 6; i++) {
    svg.push(`  <line x1="60" y1="${60 + i * 60}" x2="${LARGURA - 60}" y2="${60 + i * 60}" stroke="rgba(255,255,255,0.25)" stroke-width="4"/>`);
  }

  // ícone + tag do tipo
  svg.push(`  <text x="70" y="120" font-size="64">${esc(estilo.icone)}</text>`);
  svg.push(`  <text x="70" y="180" font-family="Arial, sans-serif" font-weight="bold" font-size="44" fill="rgba(255,255,255,0.85)">${esc(post.tipo.toUpperCase())}</text>`);

  // título (na faixa)
  svg.push(`  <text x="70" y="280" font-family="Arial, sans-serif" font-weight="bold" font-size="72" fill="#ffffff">`);
  tituloLinhas.forEach((l, i) => svg.push(`    <tspan x="70" dy="${i === 0 ? 0 : 92}">${esc(l)}</tspan>`));
  svg.push(`  </text>`);

  // texto principal
  svg.push(`  <text x="90" y="600" font-family="Arial, sans-serif" font-weight="bold" font-size="44" fill="#111111">`);
  textoLinhas.forEach((l, i) => svg.push(`    <tspan x="90" dy="${i === 0 ? 0 : 66}">${esc(l)}</tspan>`));
  svg.push(`  </text>`);

  // hashtags
  let yTags = 600 + textoLinhas.length * 66 + 50;
  tags.forEach((t, i) => {
    svg.push(`  <text x="90" y="${yTags + i * 52}" font-family="Arial, sans-serif" font-weight="bold" font-size="36" fill="#5f6368">#${esc(t)}</text>`);
  });

  // selo "AGENTE LICITA" + faixa inferior
  svg.push(`  <rect x="90" y="${ALTURA - 120}" width="480" height="64" fill="${cor}"/>`);
  svg.push(`  <text x="120" y="${ALTURA - 76}" font-family="Arial, sans-serif" font-weight="bold" font-size="30" fill="#ffffff">AGENTE LICITA</text>`);
  svg.push(`  <rect x="0" y="${ALTURA - 30}" width="${LARGURA}" height="30" fill="${cor}"/>`);

  svg.push('</svg>');
  return svg.join('\n');
}

async function gerarCard(post, outputPath) {
  const svg = gerarSvg(post);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return outputPath;
}

module.exports = { gerarCard, TIPOS, LARGURA, ALTURA, AZUL: '#0071e3', VERDE: '#25D366', AMARELO: '#FFC107' };
