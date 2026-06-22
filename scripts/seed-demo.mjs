// Seed de demonstração — povoa o "Edifício São Tomé" com dados realistas:
// condóminos, frações, quotas Jan–Mai 2026, pagamentos, despesas, assembleias
// (uma concluída com votos + ata, uma agendada) e ocorrências.
//
// Executar: node --env-file=.env.local scripts/seed-demo.mjs
// Idempotente: pode ser re-executado sem duplicar dados.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const BUILDING_ID = "6b7a58cf-6f04-4c64-bccf-cc86d4941ebe"; // Edifício São Tomé
const GESTOR_ID = "93277934-afa2-4aba-9ae9-e2375514e998"; // Eduardo Ramos
const BUDGET_ID = "3e7b5f4b-684b-4658-bd79-ae2c4eba6124"; // Orçamento 2026 (APPROVED)
const EDU_CONDOMINO_ID = "77666eef-3b0d-478a-b394-d261e100b889"; // condómino de teste (fração 1ºA)

// Frações existentes com os valores de quota gerados pela app (junho 2026)
const UNITS = {
  "1ºA": { id: "3256dae2-2aac-421e-84b7-2c8e424546bf", perm: 1200, amount: 30000, reserve: 5000 },
  "1ºB": { id: "b5be930c-ae7c-4e79-88c6-ec71501ab0b5", perm: 1200, amount: 30000, reserve: 5000 },
  "2ºA": { id: "bca0945c-2a27-481f-a42a-d5e036a65c24", perm: 2400, amount: 60000, reserve: 10001 },
  "2ºB": { id: "927c2a2b-338c-4f82-a233-555c5d856681", perm: 2400, amount: 60000, reserve: 10000 },
  "3ºA": { id: "b5e2ed70-f30b-4c98-9c4d-e2968714ba80", perm: 1400, amount: 35000, reserve: 5833 },
  "3ºB": { id: "8c331e74-5332-4fa4-8c06-554d60554bd2", perm: 1400, amount: 35000, reserve: 5833 },
};

const DEMO_USERS = [
  { email: "ana.silva@condoflow-demo.pt", full_name: "Ana Silva", unit: "1ºB", since: "2021-03-15" },
  { email: "bruno.costa@condoflow-demo.pt", full_name: "Bruno Costa", unit: "2ºA", since: "2019-07-01" },
  { email: "carla.mendes@condoflow-demo.pt", full_name: "Carla Mendes", unit: "2ºB", since: "2022-11-20" },
  { email: "diogo.ferreira@condoflow-demo.pt", full_name: "Diogo Ferreira", unit: "3ºA", since: "2020-01-10" },
  { email: "sofia.almeida@condoflow-demo.pt", full_name: "Sofia Almeida", unit: "3ºB", since: "2023-05-02" },
];
// Password dos utilizadores demo — lida do ambiente, nunca hardcoded.
//   DEMO_PASSWORD=... node --env-file=.env.local scripts/seed-demo.mjs
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
if (!DEMO_PASSWORD) {
  console.error("Define DEMO_PASSWORD no ambiente antes de correr este script.");
  process.exit(1);
}

function fail(step, error) {
  console.error(`❌ ${step}:`, error.message ?? error);
  process.exit(1);
}

async function insertOk(step, query) {
  const { data, error } = await query;
  if (error) fail(step, error);
  return data;
}

// ── 1. Utilizadores demo ─────────────────────────────────────────────────────
async function ensureUsers() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) fail("listar utilizadores", error);
  const byEmail = new Map(data.users.map((u) => [u.email, u.id]));

  for (const u of DEMO_USERS) {
    if (byEmail.has(u.email)) {
      u.id = byEmail.get(u.email);
      console.log(`• ${u.email} já existe`);
      continue;
    }
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });
    if (cErr) fail(`criar ${u.email}`, cErr);
    u.id = created.user.id;
    console.log(`✅ utilizador ${u.email} criado`);
  }

  // Nome em falta no condómino de teste do Eduardo (fração 1ºA)
  await insertOk(
    "atualizar perfil 1ºA",
    db.from("profiles").update({ full_name: "Edu Ramos" }).eq("id", EDU_CONDOMINO_ID).is("full_name", null),
  );
}

// ── 2. Papéis + propriedade das frações ──────────────────────────────────────
async function ensureRolesAndOwnership() {
  const roles = DEMO_USERS.map((u) => ({
    user_id: u.id,
    building_id: BUILDING_ID,
    role: "CONDÓMINO",
  }));
  await insertOk(
    "papéis CONDÓMINO",
    db.from("user_building_roles").upsert(roles, { onConflict: "user_id,building_id", ignoreDuplicates: true }),
  );

  const { data: active } = await db
    .from("unit_ownership")
    .select("unit_id")
    .is("ended_at", null)
    .in("unit_id", Object.values(UNITS).map((u) => u.id));
  const owned = new Set((active ?? []).map((r) => r.unit_id));

  for (const u of DEMO_USERS) {
    const unit = UNITS[u.unit];
    if (owned.has(unit.id)) {
      console.log(`• fração ${u.unit} já tem proprietário ativo`);
      continue;
    }
    await insertOk(
      `propriedade ${u.unit}`,
      db.from("unit_ownership").insert({ unit_id: unit.id, owner_user_id: u.id, started_at: u.since }),
    );
    console.log(`✅ ${u.full_name} → fração ${u.unit}`);
  }
}

// ── 3. Rubricas do orçamento (completar até 30 000 €) ────────────────────────
async function ensureBudgetLineItems() {
  const { data: existing } = await db.from("budget_line_items").select("category").eq("budget_id", BUDGET_ID);
  const have = new Set((existing ?? []).map((r) => r.category));

  const items = [
    { category: "ELECTRICITY", amount_cents: 480000, description: "Iluminação das zonas comuns" },
    { category: "ELEVATOR", amount_cents: 660000, description: "Contrato de manutenção do elevador" },
    { category: "INSURANCE", amount_cents: 350000, description: "Seguro multirriscos do edifício" },
    { category: "MAINTENANCE", amount_cents: 600000, description: "Manutenção geral e pequenas reparações" },
    { category: "ADMINISTRATIVE", amount_cents: 230000, description: "Despesas administrativas e bancárias" },
    { category: "OTHER", amount_cents: 400000, description: "Fundo para imprevistos" },
  ].filter((i) => !have.has(i.category));

  if (items.length === 0) return console.log("• rubricas do orçamento já completas");
  await insertOk(
    "rubricas do orçamento",
    db.from("budget_line_items").insert(items.map((i) => ({ ...i, budget_id: BUDGET_ID }))),
  );
  console.log(`✅ ${items.length} rubricas adicionadas ao orçamento 2026`);
}

// ── 4. Quotas Jan–Mai 2026 + pagamentos ──────────────────────────────────────
const PAYMENT_METHODS = ["Transferência Bancária", "MB WAY", "Multibanco", "Transferência Bancária"];

async function ensureQuotasAndPayments() {
  const months = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"];
  const lateInMay = new Set(["1ºA", "3ºB"]); // ficam OVERDUE em maio

  const { data: existing } = await db
    .from("quotas")
    .select("id, unit_id, due_date, status")
    .in("unit_id", Object.values(UNITS).map((u) => u.id))
    .in("due_date", months);
  const byKey = new Map((existing ?? []).map((q) => [`${q.unit_id}|${q.due_date}`, q]));

  let created = 0;
  for (const due of months) {
    for (const [label, unit] of Object.entries(UNITS)) {
      const key = `${unit.id}|${due}`;
      let quota = byKey.get(key);

      if (!quota) {
        const rows = await insertOk(
          `quota ${label} ${due}`,
          db
            .from("quotas")
            .insert({
              unit_id: unit.id,
              budget_id: BUDGET_ID,
              due_date: due,
              amount_cents: unit.amount,
              reserve_cents: unit.reserve,
            })
            .select("id, status"),
        );
        quota = { ...rows[0], unit_id: unit.id, due_date: due };
        created++;
      }
      if (quota.status !== "PENDING") continue; // já processada numa execução anterior

      const owner = label === "1ºA" ? EDU_CONDOMINO_ID : DEMO_USERS.find((u) => u.unit === label).id;
      const isMay = due === "2026-05-01";

      if (isMay && lateInMay.has(label)) {
        await insertOk(
          `quota ${label} ${due} → OVERDUE`,
          db.from("quotas").update({ status: "OVERDUE" }).eq("id", quota.id),
        );
        continue;
      }

      // Pagamento 2–7 dias após o vencimento, método variado por fração
      const day = 2 + ((unit.perm + Number(due.slice(5, 7))) % 6);
      const paidAt = `${due.slice(0, 8)}${String(day).padStart(2, "0")}T10:30:00Z`;
      await insertOk(
        `quota ${label} ${due} → PAID`,
        db.from("quotas").update({ status: "PAID", paid_at: paidAt }).eq("id", quota.id),
      );
      await insertOk(
        `pagamento ${label} ${due}`,
        db.from("payments").insert({
          quota_id: quota.id,
          amount_cents: unit.amount + unit.reserve,
          paid_by: owner,
          payment_method: PAYMENT_METHODS[unit.perm % PAYMENT_METHODS.length],
          reference: `QT-${due.slice(0, 7).replace("-", "")}-${label.replace("º", "")}`,
          created_at: paidAt,
        }),
      );
    }
  }
  console.log(`✅ quotas Jan–Mai: ${created} criadas (Jan–Abr pagas; maio com 2 em atraso)`);
}

// ── 5. Fornecedores ──────────────────────────────────────────────────────────
const SUPPLIERS = [
  { name: "Limpamax — Limpezas Profissionais", nif: "509123456", contact_email: "geral@limpamax.pt", service_type: "Limpeza" },
  { name: "EDP Comercial", nif: "503504564", contact_email: "apoio@edp.pt", service_type: "Eletricidade" },
  { name: "Otis Elevadores", nif: "500208427", contact_email: "suporte@otis.pt", service_type: "Manutenção de elevadores" },
  { name: "Fidelidade Seguros", nif: "500918880", contact_email: "condominios@fidelidade.pt", service_type: "Seguros" },
];

async function ensureSuppliers() {
  const { data: existing } = await db.from("suppliers").select("id, name").eq("building_id", BUILDING_ID);
  const byName = new Map((existing ?? []).map((s) => [s.name, s.id]));

  for (const s of SUPPLIERS) {
    if (byName.has(s.name)) continue;
    const rows = await insertOk(
      `fornecedor ${s.name}`,
      db.from("suppliers").insert({ ...s, building_id: BUILDING_ID }).select("id"),
    );
    byName.set(s.name, rows[0].id);
    console.log(`✅ fornecedor ${s.name}`);
  }
  return byName;
}

// ── 6. Despesas ──────────────────────────────────────────────────────────────
async function ensureExpenses(supplierByName) {
  const aguas = supplierByName.get("Aguas de Gaia");
  const desentop = supplierByName.get("Desentop");
  const limpamax = supplierByName.get("Limpamax — Limpezas Profissionais");
  const edp = supplierByName.get("EDP Comercial");
  const otis = supplierByName.get("Otis Elevadores");
  const fidelidade = supplierByName.get("Fidelidade Seguros");

  // status alvo: a inserção é sempre DRAFT; as transições são feitas a seguir
  const expenses = [
    { s: fidelidade, category: "INSURANCE", amount: 350000, date: "2026-01-05", desc: "Prémio anual — seguro multirriscos 2026", to: "RECONCILED" },
    { s: otis, category: "ELEVATOR", amount: 165000, date: "2026-01-10", desc: "Manutenção do elevador — 1.º trimestre", to: "RECONCILED" },
    { s: limpamax, category: "CLEANING", amount: 16600, date: "2026-01-28", desc: "Limpeza das zonas comuns — janeiro", to: "RECONCILED" },
    { s: edp, category: "ELECTRICITY", amount: 39500, date: "2026-01-30", desc: "Eletricidade zonas comuns — janeiro", to: "RECONCILED" },
    { s: limpamax, category: "CLEANING", amount: 16600, date: "2026-02-27", desc: "Limpeza das zonas comuns — fevereiro", to: "RECONCILED" },
    { s: edp, category: "ELECTRICITY", amount: 41200, date: "2026-02-27", desc: "Eletricidade zonas comuns — fevereiro", to: "RECONCILED" },
    { s: limpamax, category: "CLEANING", amount: 16600, date: "2026-03-30", desc: "Limpeza das zonas comuns — março", to: "RECONCILED" },
    { s: edp, category: "ELECTRICITY", amount: 38700, date: "2026-03-30", desc: "Eletricidade zonas comuns — março", to: "APPROVED" },
    { s: otis, category: "ELEVATOR", amount: 165000, date: "2026-04-10", desc: "Manutenção do elevador — 2.º trimestre", to: "APPROVED" },
    { s: limpamax, category: "CLEANING", amount: 16600, date: "2026-04-28", desc: "Limpeza das zonas comuns — abril", to: "APPROVED" },
    { s: edp, category: "ELECTRICITY", amount: 36900, date: "2026-04-29", desc: "Eletricidade zonas comuns — abril", to: "APPROVED" },
    { s: aguas, category: "WATER", amount: 6420, date: "2026-05-20", desc: "Consumo de água — rega e limpeza, maio", to: "APPROVED" },
    { s: limpamax, category: "CLEANING", amount: 16600, date: "2026-05-28", desc: "Limpeza das zonas comuns — maio", to: "APPROVED" },
    { s: desentop, category: "MAINTENANCE", amount: 8500, date: "2026-06-05", desc: "Desentupimento da coluna de esgoto", to: "AWAITING_APPROVAL" },
    { s: edp, category: "ELECTRICITY", amount: 37300, date: "2026-06-08", desc: "Eletricidade zonas comuns — maio (fatura)", to: "DRAFT" },
  ];

  const { data: existing } = await db.from("expenses").select("description").eq("building_id", BUILDING_ID);
  const have = new Set((existing ?? []).map((e) => e.description));

  let n = 0;
  for (const e of expenses) {
    if (have.has(e.desc) || !e.s) continue;
    const rows = await insertOk(
      `despesa ${e.desc}`,
      db
        .from("expenses")
        .insert({
          building_id: BUILDING_ID,
          supplier_id: e.s,
          category: e.category,
          amount_cents: e.amount,
          expense_date: e.date,
          description: e.desc,
        })
        .select("id"),
    );
    const id = rows[0].id;

    if (e.to === "AWAITING_APPROVAL") {
      await insertOk(e.desc, db.from("expenses").update({ status: "AWAITING_APPROVAL" }).eq("id", id));
    } else if (e.to === "APPROVED" || e.to === "RECONCILED") {
      const approvedAt = `${e.date}T15:00:00Z`;
      await insertOk(
        e.desc,
        db.from("expenses").update({ status: "APPROVED", approved_by: GESTOR_ID, approved_at: approvedAt }).eq("id", id),
      );
      if (e.to === "RECONCILED") {
        await insertOk(e.desc, db.from("expenses").update({ status: "RECONCILED" }).eq("id", id));
      }
    }
    n++;
  }
  console.log(`✅ despesas: ${n} criadas`);
}

// ── 7. Assembleias ───────────────────────────────────────────────────────────
async function ensureAssemblies() {
  const ownerOf = (label) => (label === "1ºA" ? EDU_CONDOMINO_ID : DEMO_USERS.find((u) => u.unit === label).id);

  const { data: existing } = await db
    .from("assemblies")
    .select("id, scheduled_at")
    .eq("building_id", BUILDING_ID);
  const dates = new Set((existing ?? []).map((a) => a.scheduled_at?.slice(0, 10)));

  // 7a. Assembleia ordinária de março — concluída, com votos e ata finalizada
  if (!dates.has("2026-03-28")) {
    const [assembly] = await insertOk(
      "assembleia ordinária",
      db
        .from("assemblies")
        .insert({
          building_id: BUILDING_ID,
          type: "ORDINÁRIA",
          scheduled_at: "2026-03-28T21:00:00Z",
          quorum_required: 50.01,
          location: "Sala de condomínio — Edifício São Tomé",
          created_by: GESTOR_ID,
          created_at: "2026-03-10T18:00:00Z",
        })
        .select("id"),
    );

    const items = await insertOk(
      "pontos da ordem de trabalhos",
      db
        .from("agenda_items")
        .insert([
          { assembly_id: assembly.id, order_index: 0, title: "Aprovação das contas de 2025", description: "Apresentação e votação do relatório de contas do exercício de 2025.", voting_enabled: true },
          { assembly_id: assembly.id, order_index: 1, title: "Aprovação do orçamento para 2026", description: "Orçamento anual de 30 000 € com fundo de reserva de 5 000 €.", voting_enabled: true },
          { assembly_id: assembly.id, order_index: 2, title: "Pintura da fachada do edifício", description: "Proposta de obra de pintura da fachada, orçada em 12 500 €.", voting_enabled: true },
          { assembly_id: assembly.id, order_index: 3, title: "Outros assuntos", description: "Assuntos de interesse geral apresentados pelos condóminos.", voting_enabled: false },
        ])
        .select("id, order_index"),
    );

    const step = (status) => insertOk(`assembleia → ${status}`, db.from("assemblies").update({ status }).eq("id", assembly.id));
    await step("PUBLISHED");
    await step("IN_PROGRESS");

    // FAVOR/AGAINST/ABSTAIN por ponto e fração
    const ballots = {
      0: { "1ºA": "FAVOR", "1ºB": "FAVOR", "2ºA": "FAVOR", "2ºB": "FAVOR", "3ºA": "FAVOR", "3ºB": "FAVOR" },
      1: { "1ºA": "FAVOR", "1ºB": "FAVOR", "2ºA": "FAVOR", "2ºB": "FAVOR", "3ºA": "FAVOR", "3ºB": "ABSTAIN" },
      2: { "1ºA": "FAVOR", "1ºB": "FAVOR", "2ºA": "AGAINST", "2ºB": "FAVOR", "3ºA": "AGAINST", "3ºB": "ABSTAIN" },
    };

    for (const item of items.filter((i) => i.order_index < 3).sort((a, b) => a.order_index - b.order_index)) {
      await insertOk("abrir votação", db.from("agenda_items").update({ voting_status: "OPEN" }).eq("id", item.id));
      const votes = Object.entries(ballots[item.order_index]).map(([label, vote], i) => ({
        agenda_item_id: item.id,
        unit_id: UNITS[label].id,
        voter_user_id: ownerOf(label),
        vote,
        weighted_permilagem: UNITS[label].perm,
        cast_at: `2026-03-28T21:${20 + item.order_index * 10 + i}:00Z`,
      }));
      await insertOk("votos", db.from("votes").insert(votes));
      await insertOk("fechar votação", db.from("agenda_items").update({ voting_status: "CONCLUDED" }).eq("id", item.id));
    }

    await step("CONCLUDED");

    const ata = `<h2>Ata da Assembleia Geral Ordinária — 28 de março de 2026</h2>
<p>Aos vinte e oito dias do mês de março de dois mil e vinte e seis, pelas vinte e uma horas, reuniu na sala de condomínio a Assembleia Geral Ordinária do Edifício São Tomé, com a presença de condóminos representando 100% da permilagem total.</p>
<h3>Ponto 1 — Aprovação das contas de 2025</h3>
<p>As contas do exercício de 2025 foram aprovadas por unanimidade (10 000‰ a favor).</p>
<h3>Ponto 2 — Aprovação do orçamento para 2026</h3>
<p>O orçamento anual de 30 000 €, incluindo fundo de reserva de 5 000 €, foi aprovado com 8 600‰ a favor e 1 400‰ de abstenções.</p>
<h3>Ponto 3 — Pintura da fachada do edifício</h3>
<p>A proposta de pintura da fachada foi aprovada com 4 800‰ a favor, 3 800‰ contra e 1 400‰ de abstenções. A obra será adjudicada após recolha de três orçamentos.</p>
<h3>Ponto 4 — Outros assuntos</h3>
<p>Foi registado o pedido de reforço da iluminação da entrada. Nada mais havendo a tratar, a sessão foi encerrada pelas vinte e duas horas e trinta minutos.</p>`;

    const [ataRow] = await insertOk(
      "ata",
      db.from("atas").insert({ assembly_id: assembly.id, content: ata }).select("id"),
    );
    await insertOk(
      "finalizar ata",
      db
        .from("atas")
        .update({ status: "FINALIZED", finalized_by: GESTOR_ID, finalized_at: "2026-03-30T10:00:00Z" })
        .eq("id", ataRow.id),
    );
    console.log("✅ assembleia ordinária de março criada (concluída, com votos e ata)");
  } else {
    console.log("• assembleia de março já existe");
  }

  // 7b. Assembleia extraordinária agendada (futura, publicada)
  if (!dates.has("2026-06-25")) {
    const [assembly] = await insertOk(
      "assembleia extraordinária",
      db
        .from("assemblies")
        .insert({
          building_id: BUILDING_ID,
          type: "EXTRAORDINÁRIA",
          scheduled_at: "2026-06-25T20:30:00Z",
          quorum_required: 50.01,
          location: "Sala de condomínio — Edifício São Tomé",
          created_by: GESTOR_ID,
        })
        .select("id"),
    );
    await insertOk(
      "pontos da extraordinária",
      db.from("agenda_items").insert([
        { assembly_id: assembly.id, order_index: 0, title: "Obras de impermeabilização da garagem", description: "Apreciação dos orçamentos recebidos para resolver as infiltrações na garagem.", voting_enabled: true },
        { assembly_id: assembly.id, order_index: 1, title: "Substituição do porteiro eletrónico", description: "Proposta de substituição do sistema de porteiro por videoporteiro.", voting_enabled: true },
      ]),
    );
    await insertOk("publicar", db.from("assemblies").update({ status: "PUBLISHED" }).eq("id", assembly.id));
    console.log("✅ assembleia extraordinária de 25/06 criada (publicada)");
  } else {
    console.log("• assembleia de junho já existe");
  }
}

// ── 8. Ocorrências ───────────────────────────────────────────────────────────
async function ensureIncidents(supplierByName) {
  const { data: existing } = await db.from("incidents").select("title").eq("building_id", BUILDING_ID);
  const have = new Set((existing ?? []).map((i) => i.title));

  const ana = DEMO_USERS.find((u) => u.full_name === "Ana Silva").id;
  const bruno = DEMO_USERS.find((u) => u.full_name === "Bruno Costa").id;
  const sofia = DEMO_USERS.find((u) => u.full_name === "Sofia Almeida").id;

  async function createIncident({ title, description, reportedBy, createdAt, priority, transitions, dispatch }) {
    if (have.has(title)) return console.log(`• ocorrência "${title}" já existe`);

    const [inc] = await insertOk(
      title,
      db
        .from("incidents")
        .insert({ building_id: BUILDING_ID, reported_by: reportedBy, title, description, created_at: createdAt })
        .select("id"),
    );
    await insertOk(
      `${title} histórico`,
      db.from("incident_history").insert({
        incident_id: inc.id,
        actor_user_id: reportedBy,
        from_status: null,
        to_status: "REPORTED",
        comment: "Ocorrência registada pelo condómino.",
        transitioned_at: createdAt,
      }),
    );

    let prev = "REPORTED";
    for (const t of transitions ?? []) {
      const patch = { status: t.to };
      if (t.to === "ASSESSED" && priority) patch.priority = priority;
      await insertOk(`${title} → ${t.to}`, db.from("incidents").update(patch).eq("id", inc.id));
      await insertOk(
        `${title} histórico ${t.to}`,
        db.from("incident_history").insert({
          incident_id: inc.id,
          actor_user_id: GESTOR_ID,
          from_status: prev,
          to_status: t.to,
          comment: t.comment,
          transitioned_at: t.at,
        }),
      );
      if (t.to === "SUPPLIER_DISPATCHED" && dispatch) {
        await insertOk(`${title} dispatch`, db.from("supplier_dispatches").insert({ incident_id: inc.id, ...dispatch }));
      }
      prev = t.to;
    }
    console.log(`✅ ocorrência "${title}"`);
  }

  await createIncident({
    title: "Infiltração na garagem",
    description: "Mancha de humidade extensa no teto da garagem, junto ao lugar 4. Piora em dias de chuva.",
    reportedBy: bruno,
    createdAt: "2026-06-02T08:45:00Z",
    priority: "HIGH",
    transitions: [
      { to: "ASSESSED", at: "2026-06-02T17:30:00Z", comment: "Confirmada infiltração com origem provável na junta de dilatação. Prioridade alta." },
      { to: "SUPPLIER_DISPATCHED", at: "2026-06-04T11:00:00Z", comment: "Visita técnica agendada com a Desentop para 15/06." },
      { to: "IN_PROGRESS", at: "2026-06-09T09:15:00Z", comment: "Trabalhos de reparação iniciados." },
    ],
    dispatch: {
      supplier_id: supplierByName.get("Desentop"),
      scheduled_date: "2026-06-15",
      quoted_cost_cents: 28500,
      notes: "Inspeção da junta de dilatação e selagem da zona afetada.",
    },
  });

  await createIncident({
    title: "Lâmpada fundida no hall do 2.º piso",
    description: "A luminária do hall do 2.º piso não acende; o sensor de movimento parece funcionar.",
    reportedBy: ana,
    createdAt: "2026-05-18T19:20:00Z",
    priority: "LOW",
    transitions: [
      { to: "ASSESSED", at: "2026-05-19T10:00:00Z", comment: "Substituição simples de lâmpada. Prioridade baixa." },
      { to: "IN_PROGRESS", at: "2026-05-20T14:00:00Z", comment: "Material adquirido; substituição em curso." },
      { to: "RESOLVED", at: "2026-05-20T15:30:00Z", comment: "Lâmpada substituída e testada." },
    ],
  });

  await createIncident({
    title: "Elevador com ruído ao travar",
    description: "O elevador faz um ruído metálico ao parar no rés-do-chão. Aconteceu várias vezes esta semana.",
    reportedBy: sofia,
    createdAt: "2026-06-10T21:05:00Z",
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
console.log("A povoar a base de dados de demonstração (Edifício São Tomé)...\n");
await ensureUsers();
await ensureRolesAndOwnership();
await ensureBudgetLineItems();
await ensureQuotasAndPayments();
const supplierByName = await ensureSuppliers();
await ensureExpenses(supplierByName);
await ensureAssemblies();
await ensureIncidents(supplierByName);

console.log("\nConcluído. Contas de demonstração:");
console.log("  gestor  → (conta de gestor existente no projeto)");
console.log(`  condóminos → ${DEMO_USERS.map((u) => u.email).join(", ")}`);
console.log("  password dos condóminos demo: definida via DEMO_PASSWORD do ambiente.");
