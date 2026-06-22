"use client";

// Props accept raw permilagem integers. Percentages are computed relative to
// the sum of all cast votes (not total building permilagem), so the bar always
// fills 100% when at least one vote exists. This gives an immediate visual read
// of the current split. The VotacaoTab renders the absolute permilagem values
// alongside this bar for the legally-binding numeric record.

type Props = {
  favor: number;
  against: number;
  abstain: number;
};

export function VoteTallyBar({ favor, against, abstain }: Props) {
  const total = favor + against + abstain;

  if (total === 0) {
    return (
      <div className="space-y-1.5">
        <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800" />
        <p className="text-xs text-zinc-500">Sem votos registados</p>
      </div>
    );
  }

  const favorPct = Math.round((favor / total) * 100);
  const againstPct = Math.round((against / total) * 100);
  // Assign remainder to abstain to prevent rounding gaps filling the bar imperfectly.
  const abstainPct = 100 - favorPct - againstPct;

  return (
    <div className="space-y-2">
      {/* Three-segment bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800">
        {favorPct > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${favorPct}%` }}
          />
        )}
        {abstainPct > 0 && (
          <div
            className="bg-zinc-600 transition-all duration-500 ease-out"
            style={{ width: `${abstainPct}%` }}
          />
        )}
        {againstPct > 0 && (
          <div
            className="bg-red-500 transition-all duration-500 ease-out"
            style={{ width: `${againstPct}%` }}
          />
        )}
      </div>

      {/* Percentage labels */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
          A Favor — {favorPct}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-zinc-600" />
          Abstenção — {abstainPct}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
          Contra — {againstPct}%
        </span>
      </div>
    </div>
  );
}
