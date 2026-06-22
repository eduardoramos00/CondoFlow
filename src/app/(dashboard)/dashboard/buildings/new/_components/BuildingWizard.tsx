"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";

import {
  createBuildingWithUnits,
  inviteCondominos,
  type CreatedUnit,
} from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const inputError =
  "border-red-500 focus:border-red-500 focus:ring-red-500";
const labelBase = "mb-1.5 block text-sm font-medium text-zinc-300";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3;

type BuildingDetails = { name: string; address: string; fiscalNumber: string };

type UnitDraft = {
  draftId: string;
  identifier: string;
  floor: string;
  permilagem: string;
};

type InviteDraft = {
  draftId: string;
  email: string;
  unitId: string;
};

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Dados do edifício",
  2: "Fracções",
  3: "Convidar condóminos",
};

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {([1, 2, 3] as WizardStep[]).map((n) => {
        const done = current > n;
        const active = current === n;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done
                  ? "bg-indigo-600 text-white"
                  : active
                  ? "bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span
              className={`text-xs ${active ? "font-medium text-zinc-200" : done ? "text-zinc-400" : "text-zinc-600"}`}
            >
              {STEP_LABELS[n]}
            </span>
            {n < 3 && (
              <div
                className={`h-px w-8 ${done ? "bg-indigo-600" : "bg-zinc-700"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Building details
// ---------------------------------------------------------------------------

type Step1Errors = Partial<Record<keyof BuildingDetails, string>>;

function validateStep1(d: BuildingDetails): Step1Errors {
  const errs: Step1Errors = {};
  if (!d.name.trim() || d.name.trim().length < 2)
    errs.name = "Nome obrigatório (mínimo 2 caracteres).";
  if (!d.address.trim() || d.address.trim().length < 5)
    errs.address = "Morada obrigatória (mínimo 5 caracteres).";
  if (!d.fiscalNumber.trim() || d.fiscalNumber.trim().length < 5)
    errs.fiscalNumber = "NIF/NIPC obrigatório (mínimo 5 caracteres).";
  return errs;
}

function Step1Form({
  data,
  onChange,
  errors,
}: {
  data: BuildingDetails;
  onChange: (d: BuildingDetails) => void;
  errors: Step1Errors;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className={labelBase}>Nome do edifício</label>
        <input
          type="text"
          placeholder="ex. Edifício Figueira, Bloco A"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          className={`${inputBase} ${errors.name ? inputError : ""}`}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-400">{errors.name}</p>
        )}
      </div>

      <div>
        <label className={labelBase}>Morada</label>
        <input
          type="text"
          placeholder="ex. Rua das Flores, 12, 1200-001 Lisboa"
          value={data.address}
          onChange={(e) => onChange({ ...data, address: e.target.value })}
          className={`${inputBase} ${errors.address ? inputError : ""}`}
        />
        {errors.address && (
          <p className="mt-1 text-xs text-red-400">{errors.address}</p>
        )}
      </div>

      <div>
        <label className={labelBase}>NIF / NIPC do condomínio</label>
        <input
          type="text"
          placeholder="ex. 510000000"
          value={data.fiscalNumber}
          onChange={(e) => onChange({ ...data, fiscalNumber: e.target.value })}
          className={`${inputBase} ${errors.fiscalNumber ? inputError : ""}`}
        />
        {errors.fiscalNumber && (
          <p className="mt-1 text-xs text-red-400">{errors.fiscalNumber}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Units
// ---------------------------------------------------------------------------

type UnitDraftErrors = Partial<Record<"identifier" | "floor" | "permilagem", string>>;

function validateUnits(drafts: UnitDraft[]): {
  rowErrors: UnitDraftErrors[];
  sumError: string | null;
} {
  const rowErrors: UnitDraftErrors[] = drafts.map((u) => {
    const errs: UnitDraftErrors = {};
    if (!u.identifier.trim()) errs.identifier = "Obrigatório.";
    if (u.floor === "" || Number.isNaN(parseInt(u.floor)))
      errs.floor = "Piso inválido.";
    const p = parseInt(u.permilagem);
    if (!u.permilagem || Number.isNaN(p) || p < 1 || p > 10000)
      errs.permilagem = "1–10 000.";
    return errs;
  });

  const sum = drafts.reduce((s, u) => {
    const p = parseInt(u.permilagem);
    return s + (Number.isNaN(p) ? 0 : p);
  }, 0);

  const sumError =
    sum !== 10000
      ? `Total: ${sum.toLocaleString("pt-PT")} / 10 000 — deve ser exatamente 10 000.`
      : null;

  return { rowErrors, sumError };
}

function newUnitDraft(): UnitDraft {
  return {
    draftId:    crypto.randomUUID(),
    identifier: "",
    floor:      "0",
    permilagem: "",
  };
}

function Step2Form({
  drafts,
  onChange,
}: {
  drafts: UnitDraft[];
  onChange: (d: UnitDraft[]) => void;
}) {
  const { rowErrors, sumError } = validateUnits(drafts);
  const sum = drafts.reduce((s, u) => {
    const p = parseInt(u.permilagem);
    return s + (Number.isNaN(p) ? 0 : p);
  }, 0);
  const sumOk = sum === 10000;

  function update(draftId: string, patch: Partial<UnitDraft>) {
    onChange(
      drafts.map((u) => (u.draftId === draftId ? { ...u, ...patch } : u)),
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_80px_100px_32px] gap-2 px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Identificador
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Piso
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Permilagem
        </span>
        <span />
      </div>

      {drafts.map((u, idx) => {
        const errs = rowErrors[idx] ?? {};
        return (
          <div key={u.draftId} className="grid grid-cols-[1fr_80px_100px_32px] gap-2">
            <div>
              <input
                type="text"
                placeholder="ex. 1ºA"
                value={u.identifier}
                onChange={(e) =>
                  update(u.draftId, { identifier: e.target.value })
                }
                className={`${inputBase} ${errs.identifier ? inputError : ""}`}
              />
              {errs.identifier && (
                <p className="mt-0.5 text-[10px] text-red-400">
                  {errs.identifier}
                </p>
              )}
            </div>

            <div>
              <input
                type="number"
                step="1"
                value={u.floor}
                onChange={(e) => update(u.draftId, { floor: e.target.value })}
                className={`${inputBase} ${errs.floor ? inputError : ""}`}
              />
              {errs.floor && (
                <p className="mt-0.5 text-[10px] text-red-400">{errs.floor}</p>
              )}
            </div>

            <div>
              <input
                type="number"
                step="1"
                min="1"
                max="10000"
                placeholder="ex. 250"
                value={u.permilagem}
                onChange={(e) =>
                  update(u.draftId, { permilagem: e.target.value })
                }
                className={`${inputBase} ${errs.permilagem ? inputError : ""}`}
              />
              {errs.permilagem && (
                <p className="mt-0.5 text-[10px] text-red-400">
                  {errs.permilagem}
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={drafts.length === 1}
              onClick={() =>
                onChange(drafts.filter((d) => d.draftId !== u.draftId))
              }
              className="flex h-10 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
              aria-label="Remover fracção"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...drafts, newUnitDraft()])}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
      >
        <Plus className="h-4 w-4" />
        Adicionar fracção
      </button>

      {/* Permilagem live counter */}
      <div
        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
          sumOk
            ? "border-emerald-700/50 bg-emerald-900/20 text-emerald-400"
            : "border-zinc-700 bg-zinc-800/50 text-zinc-400"
        }`}
      >
        <span>Total permilagem</span>
        <span className="font-mono font-semibold">
          {sum.toLocaleString("pt-PT")} / 10 000
          {sumOk && " ✓"}
        </span>
      </div>

      {sumError && (
        <p className="text-xs text-red-400">{sumError}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Invite condóminos
// ---------------------------------------------------------------------------

function newInviteDraft(): InviteDraft {
  return { draftId: crypto.randomUUID(), email: "", unitId: "" };
}

function Step3Form({
  drafts,
  onChange,
  createdUnits,
}: {
  drafts: InviteDraft[];
  onChange: (d: InviteDraft[]) => void;
  createdUnits: CreatedUnit[];
}) {
  function update(draftId: string, patch: Partial<InviteDraft>) {
    onChange(
      drafts.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d)),
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Opcional — convide os condóminos por email. Receberão um link mágico
        para activar a sua conta e aceder ao edifício.
      </p>

      {/* Header row */}
      <div
        className={`grid gap-2 px-1 ${createdUnits.length > 0 ? "grid-cols-[1fr_160px_32px]" : "grid-cols-[1fr_32px]"}`}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Email
        </span>
        {createdUnits.length > 0 && (
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Fracção (opcional)
          </span>
        )}
        <span />
      </div>

      {drafts.map((invite) => (
        <div
          key={invite.draftId}
          className={`grid gap-2 ${createdUnits.length > 0 ? "grid-cols-[1fr_160px_32px]" : "grid-cols-[1fr_32px]"}`}
        >
          <input
            type="email"
            placeholder="condómino@email.pt"
            value={invite.email}
            onChange={(e) =>
              update(invite.draftId, { email: e.target.value })
            }
            className={inputBase}
          />

          {createdUnits.length > 0 && (
            <select
              value={invite.unitId}
              onChange={(e) =>
                update(invite.draftId, { unitId: e.target.value })
              }
              className={inputBase}
            >
              <option value="">— sem fracção —</option>
              {createdUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.identifier}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={drafts.length === 1}
            onClick={() =>
              onChange(drafts.filter((d) => d.draftId !== invite.draftId))
            }
            className="flex h-10 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
            aria-label="Remover convite"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...drafts, newInviteDraft()])}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
      >
        <Plus className="h-4 w-4" />
        Adicionar convite
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BuildingWizard — orchestrator
// ---------------------------------------------------------------------------

export function BuildingWizard() {
  const router = useRouter();

  const [step, setStep] = useState<WizardStep>(1);
  const [buildingDetails, setBuildingDetails] = useState<BuildingDetails>({
    name: "",
    address: "",
    fiscalNumber: "",
  });
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});
  const [unitDrafts, setUnitDrafts] = useState<UnitDraft[]>([newUnitDraft()]);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [createdUnits, setCreatedUnits] = useState<CreatedUnit[]>([]);
  const [inviteDrafts, setInviteDrafts] = useState<InviteDraft[]>([
    newInviteDraft(),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    sent: number;
    errors: string[];
  } | null>(null);

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  function handleStep1Next() {
    const errs = validateStep1(buildingDetails);
    if (Object.keys(errs).length > 0) {
      setStep1Errors(errs);
      return;
    }
    setStep1Errors({});
    setStep(2);
  }

  async function handleStep2Next() {
    const { rowErrors, sumError } = validateUnits(unitDrafts);
    const hasRowErrors = rowErrors.some((e) => Object.keys(e).length > 0);
    if (hasRowErrors || sumError) return;

    setIsSubmitting(true);
    setServerError(null);

    const units = unitDrafts.map((u) => ({
      identifier: u.identifier.trim(),
      floor:      parseInt(u.floor),
      permilagem: parseInt(u.permilagem),
    }));

    const result = await createBuildingWithUnits(
      {
        name:         buildingDetails.name.trim(),
        address:      buildingDetails.address.trim(),
        fiscalNumber: buildingDetails.fiscalNumber.trim(),
      },
      units,
    );

    setIsSubmitting(false);

    if ("error" in result) {
      setServerError(result.error);
      return;
    }

    setBuildingId(result.buildingId);
    setCreatedUnits(result.createdUnits);
    setStep(3);
  }

  async function handleFinish() {
    if (!buildingId) return;

    const validInvites = inviteDrafts.filter((d) => d.email.trim() !== "");

    if (validInvites.length === 0) {
      router.push("/dashboard");
      return;
    }

    setIsSubmitting(true);
    setServerError(null);
    setInviteResult(null);

    const result = await inviteCondominos(
      buildingId,
      validInvites.map((d) => {
        const entry: { email: string; unitId?: string } = {
          email: d.email.trim(),
        };
        if (d.unitId) entry.unitId = d.unitId;
        return entry;
      }),
    );

    setIsSubmitting(false);
    setInviteResult(result);

    if (result.errors.length === 0) {
      router.push("/dashboard");
    }
  }

  // -------------------------------------------------------------------------
  // Derived state for step 2 "Next" button
  // -------------------------------------------------------------------------

  const { rowErrors: step2RowErrors, sumError: step2SumError } =
    validateUnits(unitDrafts);
  const step2Valid =
    !step2SumError &&
    step2RowErrors.every((e) => Object.keys(e).length === 0) &&
    unitDrafts.length > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <StepIndicator current={step} />

      {/* Step 1 */}
      {step === 1 && (
        <>
          <Step1Form
            data={buildingDetails}
            onChange={setBuildingDetails}
            errors={step1Errors}
          />
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              onClick={handleStep1Next}
              className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
            >
              Próximo
            </Button>
          </div>
        </>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <>
          <Step2Form drafts={unitDrafts} onChange={setUnitDrafts} />

          {serverError && (
            <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {serverError}
            </p>
          )}

          <div className="mt-6 flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setServerError(null);
                setStep(1);
              }}
              className="border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            >
              Anterior
            </Button>
            <Button
              type="button"
              disabled={!step2Valid || isSubmitting}
              onClick={() => {
                void handleStep2Next();
              }}
              className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar edifício e fracções
            </Button>
          </div>
        </>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <>
          <Step3Form
            drafts={inviteDrafts}
            onChange={setInviteDrafts}
            createdUnits={createdUnits}
          />

          {serverError && (
            <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {serverError}
            </p>
          )}

          {inviteResult && inviteResult.errors.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2">
              <p className="text-sm font-medium text-amber-400">
                {inviteResult.sent > 0
                  ? `${inviteResult.sent} convite(s) enviado(s). Erros:`
                  : "Erros ao enviar convites:"}
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {inviteResult.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-300">
                    {e}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="mt-3 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                variant="outline"
              >
                Ir para o dashboard
              </Button>
            </div>
          )}

          {!inviteResult && (
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard")}
                className="border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                Saltar e terminar
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  void handleFinish();
                }}
                className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Enviar convites e terminar
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
