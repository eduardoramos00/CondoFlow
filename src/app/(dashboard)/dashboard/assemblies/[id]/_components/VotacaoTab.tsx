"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Lock } from "lucide-react";

import {
  castVote,
  getMyUnitsForBuilding,
  getMyVoteForItem,
  getVoteTally,
  type AgendaItem,
  type Assembly,
  type OwnedUnit,
  type VoteChoice,
  type VoteTally,
} from "@/app/actions/assemblies";
import { VoteTallyBar } from "@/components/assemblies/VoteTallyBar";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemState = {
  tally: VoteTally;
  myVote: VoteChoice | null;
};

type Props = {
  assembly: Assembly;
  items: AgendaItem[];
  isGestor: boolean;
};

// ---------------------------------------------------------------------------
// VotacaoTab
// ---------------------------------------------------------------------------

export function VotacaoTab({ assembly, items, isGestor }: Props) {
  const { user } = useUser();
  const [myUnits, setMyUnits] = useState<OwnedUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [voting, setVoting] = useState<string | null>(null);
  const [voteErrors, setVoteErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const votingItems = items.filter((i) => i.voting_enabled);
  const votingItemIds = useMemo(
    () => votingItems.map((i) => i.id).join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  // Fetch tally + my vote for every voting item, and load owned units.
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [units, ...tallies] = await Promise.all([
      getMyUnitsForBuilding(assembly.building_id),
      ...votingItems.map((i) => getVoteTally(i.id)),
    ]);

    setMyUnits(units);
    if (units.length > 0 && !selectedUnitId) {
      setSelectedUnitId(units[0]!.id);
    }

    const states: Record<string, ItemState> = {};
    for (let idx = 0; idx < votingItems.length; idx++) {
      const item = votingItems[idx]!;
      const tally = tallies[idx]!;
      states[item.id] = { tally, myVote: null };
    }

    // Fetch existing votes for the selected unit (if any).
    const unitId = units[0]?.id;
    if (unitId) {
      const myVotes = await Promise.all(
        votingItems.map((i) => getMyVoteForItem(i.id, unitId)),
      );
      for (let idx = 0; idx < votingItems.length; idx++) {
        const item = votingItems[idx]!;
        states[item.id] = {
          ...states[item.id]!,
          myVote: myVotes[idx]?.vote ?? null,
        };
      }
    }

    setItemStates(states);
    setLoading(false);
  }, [assembly.building_id, votingItemIds, user?.id]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Re-fetch my vote when selected unit changes.
  useEffect(() => {
    if (!selectedUnitId || votingItems.length === 0) return;
    void (async () => {
      const myVotes = await Promise.all(
        votingItems.map((i) => getMyVoteForItem(i.id, selectedUnitId)),
      );
      setItemStates((prev) => {
        const next = { ...prev };
        for (let idx = 0; idx < votingItems.length; idx++) {
          const item = votingItems[idx]!;
          next[item.id] = { ...next[item.id]!, myVote: myVotes[idx]?.vote ?? null };
        }
        return next;
      });
    })();
  }, [selectedUnitId, votingItemIds]);

  async function handleVote(agendaItemId: string, choice: VoteChoice) {
    if (!selectedUnitId) return;
    setVoting(agendaItemId);
    setVoteErrors((prev) => ({ ...prev, [agendaItemId]: "" }));

    const result = await castVote(agendaItemId, selectedUnitId, choice);
    setVoting(null);

    if ("error" in result) {
      setVoteErrors((prev) => ({ ...prev, [agendaItemId]: result.error }));
      return;
    }

    // Refresh tally + my vote for this item.
    const [newTally, newMyVote] = await Promise.all([
      getVoteTally(agendaItemId),
      getMyVoteForItem(agendaItemId, selectedUnitId),
    ]);

    setItemStates((prev) => ({
      ...prev,
      [agendaItemId]: { tally: newTally, myVote: newMyVote?.vote ?? null },
    }));
  }

  // ── Assembly not in progress ───────────────────────────────────────────────

  if (assembly.status !== "IN_PROGRESS" && assembly.status !== "CONCLUDED" && assembly.status !== "ARCHIVED") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 py-16 text-center">
        <Lock className="mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">
          A votação estará disponível quando a assembleia estiver em curso
        </p>
      </div>
    );
  }

  if (votingItems.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        Nenhum ponto tem votação formal associada.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar votos…
      </div>
    );
  }

  const canVote =
    !isGestor &&
    myUnits.length > 0 &&
    assembly.status === "IN_PROGRESS";

  return (
    <div className="space-y-6">
      {/* Unit selector (Condóminos with multiple units) */}
      {canVote && myUnits.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-400">Votar pela fração:</label>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
          >
            {myUnits.map((u) => (
              <option key={u.id} value={u.id}>
                Fração {u.identifier}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isGestor && myUnits.length === 0 && assembly.status === "IN_PROGRESS" && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Não tem frações ativas associadas a este edifício.
        </p>
      )}

      {/* Voting items */}
      {votingItems.map((item, idx) => {
        const state = itemStates[item.id];
        const isVoting = voting === item.id;
        const err = voteErrors[item.id];
        const alreadyVoted = !!state?.myVote;
        const votingOpen = item.voting_status === "OPEN";

        return (
          <div
            key={item.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4"
          >
            {/* Item header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Ponto {idx + 1}
                </p>
                <p className="mt-0.5 text-sm font-medium text-zinc-100">
                  {item.title}
                </p>
                {item.description && (
                  <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
                )}
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.voting_status === "OPEN"
                    ? "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20"
                    : item.voting_status === "CONCLUDED"
                    ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                    : "bg-zinc-500/10 text-zinc-400 ring-1 ring-zinc-500/20"
                }`}
              >
                {item.voting_status === "OPEN"
                  ? "Aberta"
                  : item.voting_status === "CONCLUDED"
                  ? "Encerrada"
                  : "Fechada"}
              </span>
            </div>

            {/* Tally bar */}
            {state && (
              <VoteTallyBar
                favor={state.tally.favor_permilagem}
                against={state.tally.against_permilagem}
                abstain={state.tally.abstain_permilagem}
              />
            )}

            {/* Vote counts */}
            {state && state.tally.total_permilagem > 0 && (
              <p className="text-xs text-zinc-500">
                {state.tally.favor_count + state.tally.against_count + state.tally.abstain_count} voto(s) registado(s)
                {" · "}
                {state.tally.total_permilagem}‰ representados
              </p>
            )}

            {/* Already voted display */}
            {alreadyVoted && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-emerald-300">
                  Votou:{" "}
                  <strong>
                    {state?.myVote === "FAVOR"
                      ? "A Favor"
                      : state?.myVote === "AGAINST"
                      ? "Contra"
                      : "Abstenção"}
                  </strong>
                </span>
              </div>
            )}

            {/* Vote buttons */}
            {canVote && votingOpen && !alreadyVoted && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-400">O seu voto:</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={isVoting}
                    onClick={() => void handleVote(item.id, "FAVOR")}
                    className="bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95"
                  >
                    {isVoting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "A Favor"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={isVoting}
                    onClick={() => void handleVote(item.id, "ABSTAIN")}
                    className="bg-zinc-700 text-zinc-200 hover:bg-zinc-600 active:scale-95"
                  >
                    {isVoting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Abstenção"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={isVoting}
                    onClick={() => void handleVote(item.id, "AGAINST")}
                    className="bg-red-700 text-white hover:bg-red-600 active:scale-95"
                  >
                    {isVoting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Contra"}
                  </Button>
                </div>
                {err && <p className="text-xs text-red-400">{err}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
