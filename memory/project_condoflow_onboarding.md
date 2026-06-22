---
name: project-condoflow-onboarding
description: CondoFlow product identity, feature set, and agent team specialization status
metadata:
  type: project
---

The project is named **CondoFlow** — a premium multi-tenant SaaS for Portuguese condominium management.

**Why:** Full-stack platform aligned with PT legislation (Decreto-Lei n.º 268/94), serving SuperAdmin, Gestor de Condomínio, and Condómino roles.

**How to apply:** All architecture and code decisions must be framed around this domain. Use Portuguese legal terminology (permilagem, fração, ata, assembleia geral) in DB schema naming.

## Agent team onboarded on 2026-06-09
- `agent_architect.md` SPECIFIC section rewritten with CondoFlow business rules (domain model, permilagem ledger, expense ingestion, notifications, assembly/voting, incidents, GDPR/audit, analytics).
- `agent_developer.md` SPECIFIC section rewritten with CondoFlow tech stack rules (Next.js 14 App Router, Supabase, Tailwind dark-mode-first, lucide-react, recharts, shadcn/ui, tiptap, react-hook-form + zod).

## Key architectural decisions locked
- All money stored as integer cents in PostgreSQL. No FLOAT/DECIMAL for money.
- Permilagem stored as integer 0–10000 (sum must = 10000 per building).
- RLS mandatory on every table; policy naming: `{table}_{role}_{action}`.
- Supabase service role key server-side only; anon key for client Realtime only.
- `lucide-react` only for icons; `recharts` only for charts; `shadcn/ui` for primitives.
- Design system: zinc-950 shell, zinc-900 cards, indigo-500 accent, dark-mode primary.
