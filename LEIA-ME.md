# 🤖 Autopilot de Social — Agente Licita

Agenda e publica sozinho no **Instagram** via Graph API da Meta (API oficial).

```
Agendador (Node) → gera o card (PNG) → publica via Graph API → Instagram
```

O sistema tem **3 peças**: (1) este código (`autopilot/`), (2) o **Render**
(onde ele fica no ar 24/7), (3) a **Meta** (Instagram + Facebook + app + token).

> ⏱ Montagem: **~1h** na primeira vez. Sem token da Meta, o sistema roda em
> **modo seco** (agenda e gera os cards, mas **não publica nada de verdade**).

---

## ⚠️ Regra de ouro da Meta (leia antes)

Para postar **100% automático** na sua própria conta, o Instagram exige que você
ligue: **conta profissional (tipo Empresa)** → **Página do Facebook** → **App na
Meta** → **token de longa duração**. Não há atalho — é a regra da própria Meta.

Isso só é necessário para **postagem automática**. Para postar na mão (agendando
no app), nada disso é preciso.

---

## O que você precisa (só você pode criar — contas suas)

| Item | Onde | Custo |
|---|---|---|
| Instagram **profissional** (tipo Empresa) | App do Instagram | Grátis |
| **Página do Facebook** (do negócio) | facebook.com → Criar Página | Grátis |
| App na **Meta for Developers** | developers.facebook.com | Grátis |
| Token de longa duração | Meta → app → token | Grátis |
| Deploy no **Render** | render.com | Grátis |

---

## Passo 0 — Suba o código para o GitHub

1. Crie um repositório novo (público ou privado) no GitHub.
2. Copie **a pasta `autopilot` inteira** para dentro do repositório.
3. Suba (`git push`). O `npm install` acontece no Render na hora do deploy.

---

## Passo 1 — Deploy no Render

**Opção A (fácil):** Dashboard → **New → Web Service** → conectar GitHub →
**Root Directory: `autopilot`** → **Build:** `npm install` → **Start:** `node server.js`
→ **Health Check Path:** `/health`.

**Opção B (blueprint):** use o `render.yaml` (Dashboard → New → Blueprint).

### Variáveis de ambiente (Render → seu serviço → Environment)

| Variável | Valor | Obrigatória? |
|---|---|---|
| `META_PAGE_TOKEN` | Token de longa duração (Passo 3) | Para **publicar de verdade** |
| `META_IG_USER_ID` | ID numérico do seu Instagram (Passo 3) | Para **publicar de verdade** |
| `META_POSTS_DIARIO` | `1` (posts por dia) | Opcional (padrão 1) |
| `META_HORARIO_POST` | `12:00` (horário de postagem) | Opcional (padrão 12:00) |
| `CLAUDE_API_KEY` | Sua chave (regenerar posts) | Opcional |
| `CLAUDE_MODEL` | `claude-opus-5` | Opcional |
| `AGENTE_INSTAGRAM` | `@licitaagente` | Opcional |
| `AGENTE_LINK` | `https://agente-licita.onrender.com` | Opcional |

> Sem `META_PAGE_TOKEN` o servidor sobe em **modo seco**: agenda, gera os cards e
> marca os posts no `posts.json`, mas **nunca publica** — impossível postar
> acidentalmente. Ótimo para testar o agendador de graça.

**Teste rápido:** abra `https://SEU-SERVICO.onrender.com/health`
→ `{"ok":true,...,"modo":"seco"...}`.

### ❄️ O plano grátis "dorme" (cold start)

Render free hiberna ~15 min sem uso. Como o autopilot só publica 1×/dia no horário,
use **UptimeRobot** (grátis) pingando `/health` a cada 5 min para manter acordado —
assim ele publica no horário certo. (O `/health` é barato, não publica nada.)

---

## Passo 2 — Instagram profissional + Página do Facebook

1. **Instagram:** App → Configurações → Tipo de conta → **Profissional → Empresa**.
2. **Vincule a um Facebook:** no app do IG, nas configurações profissionais, conecte
   uma Página do Facebook (crie uma em facebook.com se ainda não tiver, mesmo sem
   postar nela). O IG **empresa** precisa de uma Página do FB para a Meta deixar
   postar automático.
3. Use o perfil `@licitaagente` (ver [[Playbook Instagram]]).

---

## Passo 3 — App na Meta + token de longa duração

1. Acesse **developers.facebook.com** com o mesmo e-mail (admin `samuelalvescruz30@gmail.com`).
2. **My Apps → Create App** → tipo: **Business** → nome `Agente Licita Autopilot`.
3. No app, adicione o produto **Instagram Graph API** (Data Sources → Add).
4. **Instagram → Connect**: autorize com a sua conta profissional e a Página do FB.
   Anote o **Instagram User ID** (número) → é o `META_IG_USER_ID`.
5. Gere o **User Access Token** com as permissões:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.
6. **Estenda o token** (de horas para 60 dias): use o **Token Debugger** da Meta
   (developers.facebook.com/tools/debug) → Extend Token → cole o token de **60 dias**
   no Render (`META_PAGE_TOKEN`).

> ⚠️ **Token de 60 dias** não é para sempre. Quando expirar (perto do dia 59), refaça
> o passo 6 — ou coloque um lembrete. O `/health` mostra `modo` (seco/publicar) e o
> `/status` mostra o que já foi postado, então você percebe se parou.

---

## Passo 4 — Teste (antes de deixar 100% automático)

1. Com o servidor no ar, no Render, abra `https://SEU-SERVICO.onrender.com/status`.
2. Veja a lista de posts: `agendado`, `publicado`, `modoSeco`.
3. Publique **1 card de teste** na mão:
   `POST https://SEU-SERVICO.onrender.com/publicar/1` (via ferramenta como Postman,
   ou um navegador com método POST). Confirme que aparece no Instagram.
4. Só depois confie no agendador automático (ele publica quem está na janela).

---

## Como funciona o agendador

- O `server.js` lê `data/posts.json` (30 posts, um por dia).
- Ao subir, preenche `agendado` com as datas (hoje+1, hoje+2, …) no horário configurado.
- A cada 1 min, o `tick()` publica quem está na janela (agendado <= agora) e ainda
  não foi publicado.
- Cada post publicado gera o card (`data/cards/dia-N.png`) e chama a Graph API.
- **Segurança:** sem token da Meta nada é postado de verdade (modo seco).
- Os **cards** são gerados via SVG → PNG (identidade azul do app). O mesmo card pode
  ser revisado antes em `https://SEU-SERVICO.onrender.com/cards/1.png`.

---

## Regenerar os posts com o Claude (opcional)

O `data/posts.json` tem 30 posts prontos. Para gerar **novos** posts com o Claude
(quando tiver `CLAUDE_API_KEY`), o endpoint `POST /gerar-plano` (a implementar)
usaria o modelo para escrever legendas + hashtags novas. Até lá, edite o
`posts.json` na mão — ele é o "conteúdo" do autopilot.

---

## Rotas do servidor

| Rota | O que faz |
|---|---|
| `GET /health` | Saúde + modo (seco/publicar) + contagem |
| `GET /status` | Estado completo (posts + agendamentos) |
| `GET /plano` | Lista resumida dos 30 posts |
| `GET /cards/:dia.png` | Card PNG de um dia (revisar antes) |
| `POST /gerar-card` | Gera um card avulso `{post:{titulo,texto,tipo,hashtags}}` |
| `POST /publicar/:dia` | Publica (ou marca seco) um dia específico |

---

## Erros comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `/health` mostra `modo: seco` | `META_PAGE_TOKEN` não configurado | Coloque o token no Render |
| Erro `OAuthException` ao publicar | Token inválido/vencido/perm. errada | Regere token (Passo 3) |
| `#200: Permission` | Permissões do token faltando | Adicione `instagram_content_publish` |
| Primeira resposta demora | Render free dormindo | UptimeRobot no `/health` |
| Card não aparece no IG | IG não é tipo Empresa / sem Página FB | Passo 2 |
| Publica do jeito errado | `data/posts.json` editado fora do padrão | Confira o JSON |

---

## Segurança e custo

- **Não coloque o token no código.** Sempre nas variáveis de ambiente do Render.
- O token da Meta é poderoso — quem o tem posta na sua conta. Não compartilhe.
- **Custo:** Render free + UptimeRobot free = **R$ 0**. O `sharp` (geração de PNG)
  roda localmente no Render.
- **Backup:** o `data/posts.json` é o seu conteúdo agendado — versionado no GitHub.
