# Painel financeiro pessoal

Painel **somente leitura** das suas entradas e saídas (Telegram → n8n → Ollama → Supabase).
Front-end em HTML/CSS/JS puros, back-end em Vercel Serverless Functions, protegido por senha.

```
index.html            tela do painel (e tela de login)
assets/styles.css     estilos (tema claro/escuro por variáveis CSS)
assets/app.js         estado, filtros, renderização
assets/metricas.js    cálculos puros (KPIs, insights, agregações) – roda no navegador e no Node
assets/graficos.js    gráficos (Chart.js 4)
assets/demo.js        gerador de dados fictícios (?demo=1)
api/login.js          POST  senha → cookie de sessão
api/logout.js         POST  limpa o cookie
api/dados.js          GET   ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD → JSON (exige sessão)
lib/sessao.js         assinatura/validação do cookie (HMAC-SHA256)
test/                 testes (Node, sem framework): npm test
```

## Como funciona a segurança

- O navegador **nunca** recebe chave do Supabase. Só `/api/dados` fala com o banco, no servidor, usando a `service_role key`.
- O `usuario_id` (59) é fixo em `api/dados.js`, nunca vem do cliente. Parâmetros de data são validados (ISO real).
- Sessão: cookie `HttpOnly; Secure; SameSite=Strict`, assinado (HMAC-SHA256), 30 dias. Senha comparada em tempo constante; senha errada leva ~800 ms para responder 401.
- RLS permanece ativo e sem políticas: **não crie políticas e não use a chave anon**.
- O painel só executa `SELECT` (na view `vw_transacoes`). Nada é escrito no banco.
- `vercel.json` define CSP restrita, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store` em `/api/*`. `robots.txt` bloqueia tudo.

## Rodando localmente

1. Instale dependências e a CLI da Vercel:
   ```bash
   npm install
   npm i -g vercel
   ```
2. Copie `.env.example` para `.env.local` e preencha as 5 variáveis (abaixo).
3. `vercel dev` e abra http://localhost:3000 (o cookie `Secure` funciona em `localhost` no Chrome/Firefox; no Safari use outro navegador para testar local).
4. Sem credenciais, veja o layout em http://localhost:3000/?demo=1 (dados fictícios, sem login e sem API).
5. Testes: `npm test`.

## Variáveis de ambiente

| Variável | O que é | Valor |
|---|---|---|
| `SUPABASE_URL` | URL do projeto | `https://yjbqdroieyshlzleazwl.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (secreta) | veja abaixo |
| `PAINEL_SENHA` | senha de acesso ao painel | escolha uma longa |
| `SESSION_SECRET` | segredo de assinatura do cookie (≥ 32 caracteres) | `openssl rand -hex 32` |

**Onde pegar a `service_role key`:** Supabase → projeto **assistente** → *Project Settings* → *API Keys* (ou *API*) → chave **service_role** (em “Legacy API keys”) ou a *secret key* do novo formato → *Reveal/Copy*. Essa chave ignora o RLS: **nunca** coloque em código, commit ou front-end.
A `SUPABASE_URL` está em *Project Settings → API* (“Project URL”).

## Deploy na Vercel

1. Suba o repositório no GitHub (já está em `GuTorelliImpacta/painelpessoal`).
2. Na Vercel: **Add New → Project** → importe o repositório. Framework Preset: **Other**. Sem build command, sem output directory.
3. Em **Settings → Environment Variables**, cadastre as 5 variáveis acima para *Production* (e *Preview*, se for usar).
   Ou via CLI: `vercel env add SUPABASE_URL production` (repita para cada uma).
4. **Deploy**. Abra a URL, digite a senha e pronto.
5. Em **Settings → Functions**, confirme a região **Washington, D.C. (iad1)** (já fixada no `vercel.json`).

Se quiser uma camada extra, ative *Deployment Protection* (Vercel Authentication) nos deploys de preview.

## Como trocar a senha

1. Vercel → *Settings → Environment Variables* → edite `PAINEL_SENHA`.
2. **Redeploy** (Deployments → ⋯ → Redeploy). A chave do cookie é derivada da senha, então **trocar a senha encerra todas as sessões** abertas. Para forçar logout sem trocar a senha, gere um novo `SESSION_SECRET`.

## Notas técnicas

- **Saldo atual** = soma de `valor_assinado` de todas as transações, independente do filtro. Como o PostgREST não agrega sem configuração extra (e não alteramos o banco), a API lê só as colunas mínimas (`tipo, valor, data_transacao`) de todo o histórico para calcular saldo, histórico de 13 meses e ritmo do mês. Para um uso pessoal (milhares de linhas) é rápido; se um dia passar de dezenas de milhares, vale criar uma função SQL de agregação (fase 2).
- **Período anterior equivalente:** meses fechados comparam com o(s) mês(es) anterior(es); mês em andamento compara só até o mesmo dia do mês anterior; intervalos livres comparam com a mesma duração imediatamente antes.
- **Fôlego e projeção** usam a média de saídas dos 3 meses fechados anteriores, ignorando meses anteriores ao primeiro registro.
- **Cache:** cada período é guardado em memória durante a sessão; “Atualizar” limpa o cache.
- **Assets com cache de 1 ano:** ao alterar `assets/*`, aumente o `?v=` no `index.html` para os navegadores baixarem a versão nova.
- **CSV:** separador `;`, decimal com vírgula e BOM UTF-8, para abrir direto no Excel pt-BR.
- Chart.js 4.4.1 vem do cdnjs (permitido na CSP). Se não carregar, o painel continua funcionando sem os gráficos.

## Fase 2 (sugestões, não implementadas)

- Metas de gasto por categoria, com barra de progresso e alerta ao passar de 80%.
- Detecção de gastos recorrentes (assinaturas, parcelas) e projeção do que ainda vai cair no mês.
- Agrupar categorias em essencial / estilo de vida / investimento e acompanhar a regra 50/30/20.
- Função SQL de agregação (saldo, histórico) para não depender de ler todo o histórico.
