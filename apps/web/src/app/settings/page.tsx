import { SettingsForm } from "@/components/settings/settings-form";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Preferences for this render workspace. Render behaviour itself (preset, concurrency, variants, frame upload) is configured by environment variables — see .env.example.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <SettingsForm />
      </div>
    </div>
  );
}
