# CondoFlow — Manual do Utilizador e Guia de Desenvolvimento

> Plataforma SaaS de gestão de condomínios, desenvolvida em conformidade com o DL 268/94 (Regime de Propriedade Horizontal).

---

## Índice

1. [O que é o CondoFlow](#1-o-que-é-o-condoflow)
2. [Como iniciar o projeto](#2-como-iniciar-o-projeto)
3. [Estrutura do projeto](#3-estrutura-do-projeto)
4. [Os três perfis de utilizador](#4-os-três-perfis-de-utilizador)
5. [Como cada perfil usa a plataforma](#5-como-cada-perfil-usa-a-plataforma)
6. [User Stories](#6-user-stories)
7. [Fluxos principais passo a passo](#7-fluxos-principais-passo-a-passo)
8. [Tecnologias utilizadas](#8-tecnologias-utilizadas)

---

## 1. O que é o CondoFlow

O CondoFlow é uma plataforma de gestão de condomínios multi-tenant (ou seja, suporta vários condomínios independentes na mesma instalação). Permite que gestores de condomínio administrem edifícios, orçamentos, quotas, despesas, assembleias e incidentes, enquanto os condóminos acompanham as suas quotas, votam em assembleias e comunicam problemas.

A plataforma é **multi-tenant**: um Gestor pode gerir vários edifícios, e cada edifício tem os seus próprios dados completamente isolados dos outros. Toda a segurança é reforçada tanto a nível da aplicação como diretamente na base de dados através de Row-Level Security (RLS).

---

## 2. Como iniciar o projeto

### Pré-requisitos

- **Node.js** 20 ou superior
- **npm** 10 ou superior
- Uma conta no [Supabase](https://supabase.com) com um projeto criado

### Passo a passo

```bash
# 1. Clonar o repositório
git clone <url-do-repositório>
cd Building-Manager

# 2. Instalar as dependências
npm install

# 3. Criar o ficheiro de variáveis de ambiente
cp .env.local.example .env.local
```

Abrir o ficheiro `.env.local` e preencher com as credenciais do projeto Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<id-do-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave-anon-publica>
SUPABASE_SERVICE_ROLE_KEY=<chave-service-role-secreta>
```

```bash
# 4. Aplicar as migrações da base de dados
npx supabase db push

# 5. Gerar os tipos TypeScript a partir do schema
npx supabase gen types typescript --project-id <id-do-projeto> --schema public \
  > src/lib/supabase/types.ts

# 6. Iniciar o servidor de desenvolvimento
npm run dev
```

A aplicação fica disponível em **http://localhost:3000**.

### Criar a primeira conta

1. Aceder a `http://localhost:3000/register` e criar uma conta com email e password.
2. Confirmar o email (se o Supabase tiver confirmação activada).
3. Fazer login — será redirecionado para `/dashboard`.

### Criar um utilizador SuperAdmin

Para aceder ao portal de administração da plataforma (`/admin`), é necessário definir a `role` nos metadados do utilizador no Supabase. No SQL Editor do Supabase:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "SUPERADMIN"}'
where email = 'o-teu-email@exemplo.com';
```

---

## 3. Estrutura do projeto

O projeto segue a estrutura do **Next.js App Router** com a pasta `src/`. As rotas estão organizadas em grupos de layout:

```
src/app/
├── (auth)/          → Páginas públicas: login, registo, recuperação de password
├── (dashboard)/     → Área autenticada: Gestor e Condómino
│   ├── dashboard/   → Painel do Gestor
│   └── my-building/ → Painel do Condómino
├── (admin)/         → Portal SuperAdmin (requer role SUPERADMIN)
└── (marketing)/     → Página pública (homepage)
```

**Toda a lógica de negócio** (leituras e escritas na base de dados) está em `src/app/actions/`. Os componentes React não chamam o Supabase diretamente — apenas invocam Server Actions.

---

## 4. Os três perfis de utilizador

| Perfil | Onde é definido | O que pode fazer |
|---|---|---|
| **SuperAdmin** | `app_metadata.role = 'SUPERADMIN'` no Supabase Auth | Acesso total à plataforma: gerir todos os edifícios, todos os utilizadores, ver estatísticas globais |
| **Gestor** | `user_building_roles.role = 'GESTOR'` | Gestão completa de um ou mais edifícios atribuídos: orçamentos, quotas, despesas, assembleias, incidentes |
| **Condómino** | `user_building_roles.role = 'CONDÓMINO'` | Acesso de leitura e participação no seu edifício: ver quotas, votar em assembleias, reportar incidentes |

Os perfis de Gestor e Condómino são **por edifício**: o mesmo utilizador pode ser Gestor no Edifício A e Condómino no Edifício B.

---

## 5. Como cada perfil usa a plataforma

### SuperAdmin — Portal `/admin`

O SuperAdmin não gere condomínios directamente. A sua função é **administrar a plataforma**:

- **`/admin/buildings`** — Ver todos os edifícios registados, com o email do gestor, número de fracções, incidentes abertos e última data de geração de quotas.
- **`/admin/users`** — Ver todos os utilizadores, o seu perfil, edifícios associados e data do último login. Pode suspender ou reactivar contas.
- **`/admin/stats`** — Dashboard com métricas globais: total de edifícios, utilizadores registados, receita mensal recorrente (MRR) agregada, dívida total em aberto, e taxa de cumprimento de SLA em incidentes.
- **Pedidos RGPD** — Processar pedidos de eliminação de dados de utilizadores, anonimizando os campos PII sem eliminar registos financeiros (exigência do DL 268/94).

---

### Gestor — Painel `/dashboard`

O Gestor é o utilizador central da plataforma. Depois de fazer login, é redirecionado para `/dashboard`.

**Selector de edifício**: se gerir mais do que um edifício, existe um seletor no topo da barra lateral para mudar entre eles. Todos os ecrãs mostram apenas dados do edifício seleccionado.

**Módulos disponíveis:**

| Módulo | URL | O que faz |
|---|---|---|
| Dashboard | `/dashboard` | KPIs (receita mensal, despesas, fundo de reserva, incidentes abertos), gráficos de fluxo de caixa e distribuição de despesas |
| Edifícios | `/dashboard/buildings` | Lista de edifícios geridos; criar novo edifício via wizard de 3 passos |
| Financeiro — Orçamento | `/dashboard/financials/budget` | Criar orçamento anual com rubricas; aprovar orçamento (valida fundo de reserva ≥ 10%) |
| Financeiro — Quotas | `/dashboard/financials/quotas` | Gerar quotas mensais automáticas por fracção; marcar como pagas, em atraso ou dispensadas; exportar recibo PDF |
| Despesas | `/dashboard/expenses` | Registar despesas com upload de fatura (PDF/imagem); aprovar despesas; exportar relatório PDF |
| Fornecedores | `/dashboard/suppliers` | Diretório de fornecedores por tipo de serviço; activar/desactivar |
| Assembleias | `/dashboard/assemblies` | Criar e gerir assembleias; definir ordem do dia; abrir/fechar votação por ponto; redigir a ata no editor de texto rico; exportar ata em PDF |
| Incidentes | `/dashboard/incidents` | Quadro Kanban com colunas REPORTADO / RECONHECIDO / EM PROGRESSO / RESOLVIDO; gerir tickets de resolução |
| Notificações | `/dashboard/settings/notifications` | Configurar preferências de notificação por edifício (email, SMS, push) para cada tipo de evento |

---

### Condómino — Painel `/my-building`

O Condómino acede a uma vista simplificada do seu edifício, sem acesso à gestão.

| Ecrã | URL | O que faz |
|---|---|---|
| Início | `/my-building` | Resumo do saldo em dívida, total pago no ano, próxima assembleia e incidentes abertos |
| Os meus pagamentos | `/my-building/payments` | Histórico de quotas por ano; estado de cada quota (paga, pendente, em atraso); download de recibo PDF |
| Incidentes | `/my-building/incidents` | Ver todos os incidentes do edifício; reportar novos incidentes |
| Assembleias | `/dashboard/assemblies/[id]` | Aceder a assembleias IN_PROGRESS; votar em cada ponto da ordem do dia (FAVOR / ABSTENÇÃO / CONTRA); ler a ata final |

---

## 6. User Stories

### Gestor de Condomínio

---

**US-G01 — Configurar um novo edifício**

> *Como Gestor, quero criar um novo edifício na plataforma para começar a geri-lo.*

**Fluxo:**
1. Aceder a `/dashboard/buildings/new`.
2. **Passo 1:** Preencher o nome, morada e NIF do condomínio.
3. **Passo 2:** Adicionar as fracções — identificador (ex: "1A") e permilagem de cada uma. O contador em tempo real mostra o total acumulado; o botão "Próximo" só fica disponível quando o somatório atingir exactamente 10 000 (permilagem completa).
4. **Passo 3:** Convidar os condóminos por email. Cada convite gera um link mágico de aceitação.
5. Após confirmação, o edifício e todas as fracções são criados atomicamente.

---

**US-G02 — Criar e aprovar o orçamento anual**

> *Como Gestor, quero definir o orçamento do condomínio para o ano corrente, com discriminação por rubrica, para poder gerar as quotas mensais.*

**Fluxo:**
1. Aceder a `/dashboard/financials/budget`.
2. Seleccionar o ano fiscal e clicar em "Criar orçamento".
3. Adicionar rubricas de despesa (ex: "Limpeza — 4 800 €", "Seguros — 1 200 €").
4. O sistema valida automaticamente que o fundo de reserva representa no mínimo 10% do orçamento total (obrigação legal do DL 268/94).
5. Clicar em "Aprovar orçamento" — a partir deste momento o orçamento fica bloqueado.

---

**US-G03 — Gerar e gerir quotas mensais**

> *Como Gestor, quero gerar as quotas de cada mês automaticamente, calculadas com base na permilagem de cada fracção.*

**Fluxo:**
1. Aceder a `/dashboard/financials/quotas`.
2. Seleccionar o mês e clicar em "Gerar quotas".
3. O sistema calcula a quota de cada fracção proporcional à sua permilagem; o arredondamento é atribuído à fracção com maior permilagem para garantir que a soma é exactamente igual ao orçamento mensal.
4. À medida que os condóminos pagam, marcar individualmente como "Paga", ou usar "Marcar todas como pagas".
5. Quotas não pagas na data de vencimento são marcadas automaticamente como "Em atraso" pelo processo diário agendado, e é enviada uma notificação ao condómino.

---

**US-G04 — Gerir uma assembleia geral**

> *Como Gestor, quero convocar uma assembleia, gerir a votação de cada ponto e publicar a ata.*

**Fluxo:**
1. Criar a assembleia em `/dashboard/assemblies/new` (tipo, data, local, quórum).
2. No estado RASCUNHO, adicionar os pontos da ordem do dia e reordená-los.
3. Publicar a assembleia (PUBLICADA) — os condóminos ficam notificados.
4. No dia da assembleia, mudar para IN_PROGRESS.
5. Por cada ponto: "Abrir votação" → condóminos votam em tempo real → "Fechar votação".
6. Redigir a ata no editor de texto rico (suporte a formatação, listas, etc.).
7. Concluir a assembleia e publicar a ata — fica disponível para download em PDF por todos os condóminos.

---

**US-G05 — Gerir uma ocorrência**

> *Como Gestor, quero acompanhar o ciclo de vida de uma avaria reportada até à sua resolução.*

**Fluxo:**
1. O incidente é criado (por um condómino ou pelo próprio Gestor) e aparece na coluna "REPORTADO" do Kanban em `/dashboard/incidents`.
2. O Gestor clica "Reconhecer" → passa a "RECONHECIDO".
3. Ao contactar um fornecedor e iniciar a reparação: "Iniciar" → passa a "EM PROGRESSO".
4. Após resolução: "Resolver" → passa a "RESOLVIDO". O condómino que reportou recebe uma notificação automática.

---

### Condómino

---

**US-C01 — Aceitar o convite e aceder à plataforma**

> *Como Condómino, quero aceitar o convite do meu gestor para começar a usar a plataforma.*

**Fluxo:**
1. Receber o email de convite com o link mágico.
2. Clicar no link → conta criada automaticamente, associada à fracção correspondente.
3. Definir a password e fazer login → redirecionado para `/my-building`.

---

**US-C02 — Consultar e pagar as quotas**

> *Como Condómino, quero ver as minhas quotas pendentes e confirmar os pagamentos efectuados.*

**Fluxo:**
1. Aceder a `/my-building/payments`.
2. Seleccionar o ano e ver todas as quotas, com o estado (pendente, paga, em atraso).
3. Fazer o pagamento por transferência bancária (fora da plataforma) e aguardar que o Gestor marque como paga.
4. Após pagamento confirmado, descarregar o recibo em PDF.

---

**US-C03 — Votar numa assembleia**

> *Como Condómino, quero participar na votação da assembleia geral sem precisar de estar fisicamente presente.*

**Fluxo:**
1. Receber notificação de que a assembleia está IN_PROGRESS.
2. Aceder à assembleia através de `/my-building` ou do link na notificação.
3. No separador "Votação", ver os pontos com votação aberta.
4. Seleccionar "FAVOR", "ABSTENÇÃO" ou "CONTRA" para cada ponto — o voto é imutável após submissão.
5. Ver o resultado em tempo real na barra de permilagem (FAVOR / ABSTENÇÃO / CONTRA).
6. Após a assembleia, ler a ata publicada e descarregá-la em PDF.

---

**US-C04 — Reportar uma avaria**

> *Como Condómino, quero reportar um problema nas partes comuns do edifício para que o Gestor o possa acompanhar.*

**Fluxo:**
1. Aceder a `/my-building/incidents`.
2. Clicar em "Reportar incidente", preencher o título, descrição e prioridade.
3. O incidente aparece no Kanban do Gestor e fica visível a todos os condóminos.
4. Acompanhar o estado do incidente (REPORTADO → RECONHECIDO → EM PROGRESSO → RESOLVIDO).
5. Receber notificação automática quando o incidente for resolvido.

---

### SuperAdmin

---

**US-A01 — Suspender um utilizador problemático**

> *Como SuperAdmin, quero suspender temporariamente uma conta sem eliminar os dados associados.*

**Fluxo:**
1. Aceder a `/admin/users`.
2. Localizar o utilizador na tabela.
3. Clicar em "Suspender" — a acção é registada no `session_log` com timestamp e actor.
4. O utilizador deixa de conseguir fazer login. Para repor o acesso, clicar em "Activar".

---

**US-A02 — Processar um pedido de eliminação de dados (RGPD)**

> *Como SuperAdmin, quero processar um pedido de direito ao esquecimento em conformidade com o Artigo 17.º do RGPD.*

**Fluxo:**
1. O condómino submete o pedido em `/my-building` (ou via suporte).
2. O pedido aparece na fila do SuperAdmin.
3. Ao processar, o sistema anonimiza todos os campos PII:
   - `full_name` → "REDACTED"
   - `email` → `{uuid}@deleted.condoflow.pt`
   - NIF e contactos → nulos
4. Os registos financeiros (quotas, pagamentos, audit_log) são **preservados** para efeitos de contabilidade legal.

---

## 7. Fluxos principais passo a passo

### Fluxo completo de um mês financeiro

```
Gestor cria orçamento anual
        ↓
Aprova orçamento (≥10% reserva)
        ↓
No início de cada mês: gera quotas
        ↓
Condóminos recebem notificação
        ↓
Condóminos pagam (transferência bancária)
        ↓
Gestor marca quotas como pagas
        ↓
Quotas em atraso: processo diário corre às 07:00 UTC
        ↓
Condóminos em atraso recebem notificação automática
        ↓
Gestor pode dispensar (waive) quotas caso a caso
```

### Ciclo de vida de uma assembleia

```
RASCUNHO → (Gestor configura pontos da ordem do dia)
        ↓
PUBLICADA → (condóminos notificados, 48h antes: 2ª notificação)
        ↓
EM PROGRESSO → (Gestor abre votação ponto a ponto)
        ↓
CONCLUÍDA → (Gestor redige e publica a ata)
        ↓
Ata disponível para download em PDF por todos
```

### Ciclo de vida de um incidente

```
REPORTADO (qualquer membro do edifício)
        ↓
RECONHECIDO (Gestor)
        ↓
EM PROGRESSO (Gestor — contactou fornecedor)
        ↓
RESOLVIDO → notificação automática ao criador do incidente
```

---

## 8. Tecnologias utilizadas

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript (modo strict) |
| Base de dados / Auth / Storage / Realtime | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| Estilos | Tailwind CSS v4, dark-mode-first, paleta zinc/indigo |
| Componentes UI | shadcn/ui (base-nova, `@base-ui/react`) |
| Ícones | lucide-react |
| Gráficos | recharts |
| Formulários | react-hook-form v7 + Zod v4 |
| Editor de texto rico | @tiptap/react |
| Geração de PDF | @react-pdf/renderer (apenas servidor) |
| Upload de ficheiros | react-dropzone |

### Princípios de segurança

- **Dinheiro é sempre guardado em cêntimos inteiros** — sem `float` ou `parseFloat` em qualquer cálculo financeiro.
- **Toda a lógica de negócio corre no servidor** — os componentes React nunca chamam o Supabase diretamente.
- **RLS activado em todas as 21 tabelas** — isolamento multi-tenant garantido a nível da base de dados.
- **Notificações só podem ser criadas pelo servidor** — sem política de INSERT para utilizadores autenticados na tabela `notifications`.
- **Audit log imutável** — um trigger de base de dados impede qualquer UPDATE ou DELETE, mesmo com a service role.
