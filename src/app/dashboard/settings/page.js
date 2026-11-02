import { Suspense } from "react";
import { PanelSkeleton } from "@/components/dashboard/Panel";
import ProfileForm from "@/components/dashboard/ProfileForm";
import PreferencesForm from "@/components/dashboard/PreferencesForm";
import SecurityForm from "@/components/dashboard/SecurityForm";
import { LoadError, requireDashboardUser } from "@/components/dashboard/guard";
import { loadProfile } from "@/lib/server/dashboard";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { blocked } = await requireDashboardUser("/dashboard/settings");
  if (blocked) return blocked;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Your profile, password and privacy choices.</p>
      </header>
      <Suspense fallback={<PanelSkeleton rows={5} />}>
        <SettingsForms />
      </Suspense>
    </div>
  );
}

async function SettingsForms() {
  const { user, profile, prefs, error } = await loadProfile();
  return (
    <div className="space-y-6">
      <LoadError error={error} what="Your settings" />
      <ProfileForm userId={user.id} email={user.email} initialName={profile?.full_name || ""} />
      <PreferencesForm userId={user.id} initial={prefs} />
      <SecurityForm email={user.email} />
    </div>
  );
}
