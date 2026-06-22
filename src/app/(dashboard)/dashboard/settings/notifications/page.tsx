import { getNotificationPreferences } from "@/app/actions/notifications";
import { NotificationPreferencesClient } from "./_components/NotificationPreferencesClient";

export const dynamic = "force-dynamic";

export default async function NotificationsSettingsPage() {
  const preferences = await getNotificationPreferences();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Notificações</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gira como recebe notificações em cada edifício.
        </p>
      </div>
      <NotificationPreferencesClient initialPreferences={preferences} />
    </div>
  );
}
