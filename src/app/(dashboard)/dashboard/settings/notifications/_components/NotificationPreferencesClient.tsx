"use client";

import { useState, useTransition } from "react";
import { Bell, Mail, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BuildingPreference } from "@/app/actions/notifications";
import { updateNotificationPreferences } from "@/app/actions/notifications";

// ---------------------------------------------------------------------------
// Channel definitions (maps to the three boolean flags on notification_preferences)
// ---------------------------------------------------------------------------

type ChannelKey = "email_enabled" | "sms_enabled" | "push_enabled";

const CHANNELS: {
  key: ChannelKey;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "email_enabled",
    label: "Email",
    description:
      "Quotas, assembleias, incidentes e lembretes por correio eletrónico",
    Icon: Mail,
  },
  {
    key: "sms_enabled",
    label: "SMS",
    description: "Alertas urgentes por mensagem de texto",
    Icon: MessageSquare,
  },
  {
    key: "push_enabled",
    label: "Notificação na app",
    description: "Atualizações em tempo real dentro da aplicação",
    Icon: Bell,
  },
];

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

function Toggle({
  enabled,
  onToggle,
  disabled,
  label,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        enabled ? "bg-indigo-600" : "bg-gray-200",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Per-building preference card (owns its own local state)
// ---------------------------------------------------------------------------

type ChannelState = Record<ChannelKey, boolean>;

function BuildingCard({ pref }: { pref: BuildingPreference }) {
  const [state, setState] = useState<ChannelState>({
    email_enabled: pref.email_enabled,
    sms_enabled: pref.sms_enabled,
    push_enabled: pref.push_enabled,
  });
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleToggle(key: ChannelKey) {
    const next: ChannelState = { ...state, [key]: !state[key] };
    const prev: ChannelState = { ...state };
    setState(next);
    setErrorMsg(null);

    startTransition(async () => {
      const result = await updateNotificationPreferences(
        pref.building_id,
        next,
      );
      if (result.error) {
        setState(prev);
        setErrorMsg(result.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div>
          <h3 className="font-medium text-gray-900">{pref.building_name}</h3>
          <span className="text-xs text-gray-500">
            {pref.user_role === "GESTOR" ? "Gestor" : "Condómino"}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="mx-6 mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Channel rows */}
      <ul className="divide-y divide-gray-100 px-6">
        {CHANNELS.map(({ key, label, description, Icon }) => (
          <li key={key} className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
            </div>
            <Toggle
              enabled={state[key]}
              onToggle={() => handleToggle(key)}
              disabled={isPending}
              label={`${label} para ${pref.building_name}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component — receives server-fetched preferences as props
// ---------------------------------------------------------------------------

export function NotificationPreferencesClient({
  initialPreferences,
}: {
  initialPreferences: BuildingPreference[];
}) {
  if (initialPreferences.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
        Não pertence a nenhum edifício.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {initialPreferences.map((pref) => (
        <BuildingCard key={pref.building_id} pref={pref} />
      ))}
    </div>
  );
}
