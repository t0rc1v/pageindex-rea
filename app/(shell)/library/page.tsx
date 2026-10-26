import { auth } from "@clerk/nextjs/server";

import { LibraryView } from "@/components/library-view";

export const metadata = { title: "Documents — PageIndex Reader" };

export default async function LibraryPage() {
  await auth.protect();

  return <LibraryView />;
}
