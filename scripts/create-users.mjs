// Script one-shot para criar contas de teste no Supabase
// Executar: node --env-file=.env.local scripts/create-users.mjs

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.\n" +
      "Executar com: node --env-file=.env.local scripts/create-users.mjs",
  );
  process.exit(1);
}

// Passwords lidas do ambiente — nunca hardcoded. Define-as antes de correr:
//   GESTOR_PASSWORD=... CONDOMINO_PASSWORD=... node --env-file=.env.local scripts/create-users.mjs
const GESTOR_PASSWORD = process.env.GESTOR_PASSWORD;
const CONDOMINO_PASSWORD = process.env.CONDOMINO_PASSWORD;
if (!GESTOR_PASSWORD || !CONDOMINO_PASSWORD) {
  console.error(
    "Define GESTOR_PASSWORD e CONDOMINO_PASSWORD no ambiente antes de correr este script.",
  );
  process.exit(1);
}

const users = [
  { email: "gestor@example.com",      password: GESTOR_PASSWORD,    full_name: "Gestor Demo" },
  { email: "condomino1@example.com",  password: CONDOMINO_PASSWORD, full_name: "Condómino Um" },
  { email: "condomino2@example.com",  password: CONDOMINO_PASSWORD, full_name: "Condómino Dois" },
];

async function createUser({ email, password, full_name }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,           // confirma o email automaticamente
      user_metadata: { full_name },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`❌ ${email}: ${data.message ?? data.error ?? JSON.stringify(data)}`);
    return null;
  }

  console.log(`✅ ${email} criado — id: ${data.id}`);
  return data;
}

console.log("A criar utilizadores...\n");
for (const user of users) {
  await createUser(user);
}
console.log("\nConcluído.");
console.log("Credenciais definidas a partir de GESTOR_PASSWORD / CONDOMINO_PASSWORD do ambiente.");
