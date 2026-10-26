import { auth } from "@clerk/nextjs/server";

import { SettingsView } from "@/components/settings-view";

export const metadata = { title: "Settings — PageIndex Reader" };

export default async function SettingsPage() {
  await auth.protect();

  return <SettingsView />;
}
