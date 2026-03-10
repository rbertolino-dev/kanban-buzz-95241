# Avaliação: landing-page na Perspectiva Multi-Empresa

## Resumo

Foi avaliada a funcionalidade **landing-page** do sistema sob a ótica **multi-empresa**: cada organização deve ter sua própria landing-page, exibindo **apenas** seus produtos e serviços, com total separação entre organizações.

---

## 1. Situação atual

### 1.1 Existe landing page por organização?

**Não.** O projeto **não possuía** (antes da implementação) rota ou página pública dedicada para a funcionalidade **landing-page** por empresa.

- Existe rota `/landing-page/:slug` e componente `LandingPage` que mostram produtos/serviços da organização identificada pelo slug.

### 1.2 Onde produtos e serviços aparecem hoje

| Onde | Escopo por organização | Público? |
|------|-------------------------|----------|
| **ProductsManagement** (CRM) | ✅ `useProducts()` → `activeOrgId` | Não (AuthGuard) |
| **Onboarding – ProductsStep** | ✅ Org do onboarding | Não (auth) |
| **Formulários públicos** (embed) | ✅ Por `form_id` (cada form tem `organization_id`) | Sim (get-form por id) |

A funcionalidade **landing-page** (`/landing-page/:slug`) passou a ser a página pública que lista produtos/serviços por organização (por slug).

### 1.3 Identificação pública da organização

- A tabela **`organizations`** tem: `id`, `name`, `created_at`, `updated_at`.
- Foi adicionado campo `slug` em `organizations` (migration) para URL amigável (ex.: `/landing-page/minha-empresa`).

---

## 2. O que já está alinhado à multi-empresa

### 2.1 Dados

- **`products`**: `organization_id` em todas as queries; `useProducts` filtra por `activeOrgId`.
- **`form_builders`**: `organization_id`; formulários são acessados por `form_id` (um id = uma org).
- **Edge function `get-form`**: retorna um único formulário por `form_id`; não há listagem pública por org que possa misturar dados.

### 2.2 Regras do projeto

- Uso de `organization_id` em tabelas de negócio e filtro por `activeOrgId`/organização está consistente com as regras de arquitetura multi-empresa do projeto.

O que falta é **uma camada pública** (rota + API) que, a partir de **um identificador da organização** (ex.: slug), mostre **somente** os dados dessa organização.

---

## 3. Riscos na perspectiva multi-empresa (se implementar sem cuidado)

Se no futuro for criada uma landing page sem desenho multi-empresa explícito:

| Risco | Mitigação |
|-------|-----------|
| Listar produtos de todas as organizações | API/query **sempre** filtrada por `organization_id` (ou slug que resolva para uma única org). |
| Identificar organização por ID (UUID) na URL | Preferir **slug** único por organização; evitar expor UUID em URL pública. |
| RLS bloqueando leitura pública | Ter política de **SELECT** para leitura anônima apenas da org (ex.: por slug) ou usar edge function com SERVICE_ROLE e validação rigorosa de parâmetro. |
| Formulários/CTAs da landing enviando lead para org errada | Submissões (formulário/contato) devem sempre receber `organization_id` (ou slug) e criar lead/contato **apenas** nessa organização. |

---

## 4. Recomendações para uma landing page multi-empresa

### 4.1 Modelo de dados

1. **Campo `slug` em `organizations`** (implementado)
   - Único, índice único.
   - Usado na URL da funcionalidade landing-page: `/landing-page/:slug`.

2. **Manter produtos e serviços como estão**
   - `products` já tem `organization_id`; usar apenas produtos ativos (`is_active = true`) na landing.
   - Se no futuro existir tabela de “serviços” separada, ela também deve ter `organization_id` e ser filtrada por organização.

### 4.2 Rotas e página

1. **Rota pública** (implementado)
   - Rota: `/landing-page/:slug`.
   - Componente `LandingPage` que:
     - Lê `slug` da URL.
     - Chama API/edge function passando **apenas** o `slug` (ou `organization_id` resolvido a partir dele).
     - Exibe apenas: dados da organização (nome, logo, etc.) + produtos/serviços **dessa** organização.

2. **Sem autenticação**
   - Rota fora de `AuthGuard`; acessível a visitantes.

### 4.3 API / backend

1. **Uma das opções:**
   - **Edge function** (ex.: `get-landing-data`) que:
     - Recebe `slug` (ou `organization_id`).
     - Valida que o parâmetro existe e corresponde a **uma** organização.
     - Retorna: organização (nome, etc.) + produtos ativos **dessa** organização.
     - Usar SERVICE_ROLE apenas na função; **nunca** retornar dados de outra org.
   - **Ou** política RLS que permita SELECT público em uma “view” ou tabela de leitura restrita por slug/org (mais complexo de manter).

2. **Formulário/contato na landing**
   - Qualquer submissão (formulário, “fale conosco”) deve:
     - Receber e validar `organization_id` ou `slug`.
     - Criar lead/contato **somente** nessa organização (e no estágio configurado).

### 4.4 Checklist de implementação

- [x] Migration: adicionar `slug` em `organizations` → `20251215000000_add_organization_slug_for_landing.sql`.
- [x] Backfill de slugs para organizações existentes (incluído na migration).
- [x] Rota pública no front: `/landing-page/:slug` → página `LandingPage.tsx`, sem AuthGuard.
- [x] API/edge function `get-landing-data`: dado `slug`, retorna apenas dados dessa organização (org + produtos ativos).
- [x] Página de landing consome a API e exibe apenas os dados retornados (nenhuma outra org).
- [ ] Em `supabase/config.toml`: adicionar `[functions.get-landing-data]` com `verify_jwt = false` (acesso público).
- [ ] Novas organizações: garantir que `slug` seja preenchido (cadastro/edição de organização).
- [ ] Se houver formulário na landing: submissão sempre vinculada ao `organization_id` da página (slug → org).

---

## 5. Conclusão

- **Hoje não existe funcionalidade de landing page por organização** no sistema; produtos e serviços são exibidos apenas no app autenticado e já estão corretamente separados por organização.
- Para introduzir uma landing page multi-empresa de forma segura e clara:
  - Identificação pública da organização por **slug**.
  - Rota pública por slug.
  - API que retorna **apenas** dados da organização identificada (e seus produtos/serviços).
  - Submissões (leads/formulários) sempre associadas à organização da página.

Esta avaliação e as recomendações acima mantêm a perspectiva multi-empresa: cada organização tem seus produtos e serviços e na **landing-page** de cada empresa isso é apresentado **de forma separada entre organizações**.
