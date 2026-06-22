"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Vote,
  X,
} from "lucide-react";

import {
  addAgendaItem,
  closeVoting,
  openVoting,
  reorderAgendaItems,
  type AgendaItem,
  type Assembly,
  type AgendaItemVotingStatus,
} from "@/app/actions/assemblies";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const addItemSchema = z.object({
  title: z.string().min(1, "Título obrigatório.").max(300),
  description: z.string().max(2000).optional(),
  votingEnabled: z.boolean(),
});

type AddItemValues = z.infer<typeof addItemSchema>;

const inputBase =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const VOTING_STATUS_LABELS: Record<AgendaItemVotingStatus, string> = {
  CLOSED: "Votação fechada",
  OPEN: "Votação aberta",
  CONCLUDED: "Votação concluída",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  assembly: Assembly;
  items: AgendaItem[];
  isGestor: boolean;
  buildingId: string;
  onRefresh: () => void;
};

// ---------------------------------------------------------------------------
// AgendaTab
// ---------------------------------------------------------------------------

export function AgendaTab({ assembly, items, isGestor, buildingId, onRefresh }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [votingAction, setVotingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEdit = isGestor && ["DRAFT", "PUBLISHED"].includes(assembly.status);
  const canManageVoting = isGestor && assembly.status === "IN_PROGRESS";

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddItemValues>({
    resolver: zodResolver(addItemSchema),
    defaultValues: { title: "", description: "", votingEnabled: false },
  });

  async function onAddItem(values: AddItemValues) {
    setActionError(null);
    const result = await addAgendaItem(
      assembly.id,
      buildingId,
      values.title,
      values.description ?? undefined,
      values.votingEnabled,
    );
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    reset();
    setShowAddForm(false);
    onRefresh();
  }

  async function moveItem(index: number, direction: "up" | "down") {
    if (reordering) return;
    const newOrder = [...items];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    [newOrder[index], newOrder[swapIdx]] = [newOrder[swapIdx]!, newOrder[index]!];

    setReordering(true);
    setActionError(null);
    const result = await reorderAgendaItems(
      assembly.id,
      buildingId,
      newOrder.map((i) => i.id),
    );
    setReordering(false);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    onRefresh();
  }

  async function handleOpenVoting(itemId: string) {
    setVotingAction(itemId);
    setActionError(null);
    const result = await openVoting(itemId, buildingId);
    setVotingAction(null);
    if ("error" in result) { setActionError(result.error); return; }
    onRefresh();
  }

  async function handleCloseVoting(itemId: string) {
    setVotingAction(itemId);
    setActionError(null);
    const result = await closeVoting(itemId, buildingId);
    setVotingAction(null);
    if ("error" in result) { setActionError(result.error); return; }
    onRefresh();
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {actionError}
        </p>
      )}

      {/* Item list */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-12 text-center">
          <Vote className="mb-3 h-8 w-8 text-zinc-600" />
          <p className="text-sm text-zinc-400">Sem pontos na ordem do dia</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              {/* Order number */}
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-400">
                {idx + 1}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">{item.title}</span>
                  {item.voting_enabled && (
                    <StatusBadge status={item.voting_status} />
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-zinc-500">{item.description}</p>
                )}
                {item.voting_enabled && (
                  <p className="text-xs text-zinc-500">
                    {VOTING_STATUS_LABELS[item.voting_status]}
                  </p>
                )}
              </div>

              {/* GESTOR controls */}
              {isGestor && (
                <div className="flex flex-shrink-0 items-center gap-1">
                  {/* Reorder buttons (only in editable states) */}
                  {canEdit && (
                    <>
                      <button
                        onClick={() => void moveItem(idx, "up")}
                        disabled={idx === 0 || reordering}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                        title="Mover para cima"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void moveItem(idx, "down")}
                        disabled={idx === items.length - 1 || reordering}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}

                  {/* Voting controls (only in IN_PROGRESS) */}
                  {canManageVoting && item.voting_enabled && (
                    <>
                      {item.voting_status === "CLOSED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={votingAction === item.id}
                          onClick={() => void handleOpenVoting(item.id)}
                          className="border-emerald-800 text-emerald-400 hover:border-emerald-600 hover:text-emerald-300 active:scale-95 text-xs h-7 px-2"
                        >
                          {votingAction === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <ChevronRight className="mr-1 h-3 w-3" />
                              Abrir votação
                            </>
                          )}
                        </Button>
                      )}
                      {item.voting_status === "OPEN" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={votingAction === item.id}
                          onClick={() => void handleCloseVoting(item.id)}
                          className="border-amber-800 text-amber-400 hover:border-amber-600 hover:text-amber-300 active:scale-95 text-xs h-7 px-2"
                        >
                          {votingAction === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Fechar votação
                            </>
                          )}
                        </Button>
                      )}
                      {item.voting_status === "CONCLUDED" && (
                        <span className="text-xs text-zinc-500">Concluída</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add item form (GESTOR, editable status) */}
      {canEdit && (
        <div>
          {!showAddForm ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Adicionar ponto
            </Button>
          ) : (
            <form
              onSubmit={handleSubmit(onAddItem)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-200">Novo ponto</p>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); reset(); }}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Título do ponto *"
                  {...register("title")}
                  className={inputBase}
                />
                {errors.title && (
                  <p className="mt-1 text-xs text-red-400">{errors.title.message}</p>
                )}
              </div>

              <div>
                <textarea
                  rows={2}
                  placeholder="Descrição (opcional)"
                  {...register("description")}
                  className={`${inputBase} resize-none`}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("votingEnabled")}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-zinc-300">Requer votação formal</span>
              </label>

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95"
                >
                  {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Adicionar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowAddForm(false); reset(); }}
                  className="text-zinc-400"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
