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

## Como iniciar

1. Abra um terminal nesta pasta.
2. Execute `npm start`.
3. Acesse `http://127.0.0.1:8787`.
4. Use a senha definida em `.env`.

O projeto não possui dependências externas. É necessário Node.js 20 ou superior.

## Conectar a landing page

No formulário da LP, use a URL deste serviço no atributo `data-endpoint`:

```html
<form id="lead-form" data-endpoint="http://127.0.0.1:8787/api/leads">
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
