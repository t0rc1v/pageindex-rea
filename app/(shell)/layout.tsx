import { AppShell } from "@/components/shell/app-shell";

export default function ShellLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
