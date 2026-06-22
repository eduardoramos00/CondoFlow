"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useUser } from "./UserContext";

// Mirrors the `notifications` table schema defined in Migration 005.
// Replace with generated DB types once migrations are applied.
type DeliveryStatus = "PENDING" | "SENT" | "FAILED" | "READ";

export type AppNotification = {
  id: string;
  building_id: string;
  recipient_user_id: string;
  event_type: string;
  channel: string;
  payload: Record<string, unknown>;
  sent_at: string | null;
  delivery_status: DeliveryStatus;
  created_at: string;
};

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAsRead: () => undefined,
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Optimistic update + persist to DB. The RLS policy notifications_recipient_update_status
  // allows the authenticated user to update delivery_status on their own rows.
  // Fire-and-forget: a failed persist leaves the row as SENT/FAILED in the DB but the
  // UI stays READ; it will self-correct on the next session load via the initial fetch.
  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, delivery_status: "READ" as const } : n,
      ),
    );
    void createBrowserSupabaseClient()
      .from("notifications")
      .update({ delivery_status: "READ" })
      .eq("id", id);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const supabase = createBrowserSupabaseClient();

    // Initial page-load fetch: last 20 IN_APP notifications, newest first.
    // Scoped to IN_APP channel so EMAIL delivery-tracking rows are excluded from the bell.
    void supabase
      .from("notifications")
      .select(
        "id, building_id, recipient_user_id, event_type, channel, payload, sent_at, delivery_status, created_at",
      )
      .eq("recipient_user_id", user.id)
      .eq("channel", "IN_APP")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setNotifications(data as unknown as AppNotification[]);
      });

    // Realtime subscription — prepends new IN_APP rows as they arrive.
    // Non-IN_APP inserts (e.g. EMAIL delivery rows) are filtered out in the callback
    // so the bell only shows actionable in-app notifications.
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as AppNotification;
          if (row.channel !== "IN_APP") return;
          setNotifications((prev) => [row, ...prev]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const unreadCount = notifications.filter(
    (n) => n.delivery_status !== "READ",
  ).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}
