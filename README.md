# Juris8 DET · Painel de Leads

Projeto separado da landing page para receber, salvar e administrar os leads interessados no monitoramento DET.

## O que já funciona

- Endpoint público `POST /api/leads` compatível com o formulário da landing page.
- Armazenamento persistente em `data/leads.json`.
- Validação dos campos obrigatórios, consentimento, e-mail e WhatsApp.
- Proteção simples contra spam, limite de requisições e CORS configurável.
- Login administrativo com sessão protegida por cookie HTTP-only.
- Busca e filtro dos leads por status.
- Detalhes de contato, atalho de e-mail e WhatsApp.
- Atualização de status e anotações internas.
- Interface responsiva inspirada no Mockup 9 da Juris8.

## Como iniciar (local - recomendado para testes)

1. Crie um arquivo `.env` na raiz com:
   ```
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sua_publishable_key
   SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
   ADMIN_PASSWORD=qualquercoisa
   LEAD_ORIGINS=*
   ```

2. Rode: `npm start`
3. Acesse http://localhost:8787

### Forma MAIS SIMPLES para testes (recomendado agora)

Use o servidor local + ngrok. É bem mais fácil que Vercel pra testar agora.

**Passos:**

1. Crie o arquivo `.env` na raiz do projeto com isso (cole suas chaves reais):

```
SUPABASE_URL=https://myyawepbfvxzjnlxcjql.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_fvDRMrZzyRiZWH9W32-RYw_P-9wXYWw
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (cole a chave completa aqui)
ADMIN_PASSWORD=123456
LEAD_ORIGINS=*
```

2. Rode o servidor:
   ```powershell
   npm start
   ```

3. Instale o ngrok (uma única vez):
   ```powershell
   npm install -g ngrok
   ```

4. Abra **outro terminal** e rode:
   ```powershell
   ngrok http 8787
   ```

5. Copie a URL que o ngrok mostrar (ex: `https://abc123.ngrok-free.app`)

6. Use essa URL no formulário da landing page (https://lp-det-atualizada.vercel.app):
   ```html
   <form id="lead-form" data-endpoint="https://SEU-NGROK.ngrok.io/api/leads">
   ```

Para a landing real (https://lp-det-atualizada.vercel.app), aponte para a URL do admin deployado no Vercel + /api/leads.

7. Acesse o painel admin pela mesma URL do ngrok.

---

**Teste sem login (já configurado para testes)**

O código está em modo teste (sem segurança):
- `/api/session` sempre retorna autenticado
- Endpoints de leads não exigem login
- Login aceita qualquer senha

Basta rodar `npm start` + ngrok e abrir o painel direto. 

**Como testar no Supabase de verdade:**
1. Envie leads pelo formulário usando a URL do ngrok.
2. Abra o Supabase Dashboard > Table Editor > tabela "leads"
3. Veja os registros aparecendo (usa a SERVICE_ROLE_KEY, bypass RLS).
4. Atualize status/notas no painel -> salva no Supabase.

Quando quiser voltar ao modo normal (com segurança), descomente as verificações de `isAuthenticated` nos arquivos server.mjs e api/*.js.

---

Isso é o jeito mais simples e rápido possível pra testar agora. Você vê tudo no terminal e não precisa se preocupar com deploy, cookies entre requisições, etc. 

Quando o teste estiver funcionando, aí a gente volta pro Vercel de forma correta.

O projeto não possui dependências externas. É necessário Node.js 20 ou superior.

## Conectar a landing page

No formulário da LP, use a URL deste serviço no atributo `data-endpoint`:

```html
<form id="lead-form" data-endpoint="https://SEU-ADMIN.vercel.app/api/leads">
```

Para produção, substitua essa URL pelo endereço público em que este projeto for hospedado e atualize `LEAD_ORIGINS` no arquivo `.env` com o domínio real da landing page.

## Configuração

Copie `.env.example` para `.env` quando for instalar em outro ambiente e configure:

- `PORT`: porta da aplicação.
- `HOST`: `127.0.0.1` para uso local ou `0.0.0.0` em servidor.
- `ADMIN_PASSWORD`: senha forte do painel.
- `LEAD_ORIGINS`: domínios autorizados a enviar leads, separados por vírgula.

## Observação sobre armazenamento

Este painel agora usa **Supabase** (PostgreSQL) como fonte de dados.

- Configure `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no `.env`.
- Os leads vindos do formulário da landing page são salvos automaticamente no Supabase.
- Para suporte completo a atualização de status e anotações, execute o seguinte SQL no SQL Editor do Supabase:

```sql
alter table public.leads
  add column if not exists status text not null default 'novo',
  add column if not exists notes text default '',
  add column if not exists received_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
```

Ajuste as RLS policies conforme necessário ou use SUPABASE_SERVICE_ROLE_KEY no servidor (recomendado, bypass RLS para writes).

Exemplo de políticas permissivas (use apenas em desenvolvimento):

```sql
-- permitir que o anon insira leads (formulário público)
create policy "anon_insert_leads" on public.leads
  for insert to anon with check (true);

-- permitir leitura pelo anon (para o painel ler)
create policy "anon_select_leads" on public.leads
  for select to anon using (true);
```

O arquivo `data/leads.json` não é mais utilizado.
"# Leads-Juris8" 
