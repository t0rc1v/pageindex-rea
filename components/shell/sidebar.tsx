"use client";

import { UserButton } from "@clerk/nextjs";
import {
  ChevronDown,
  ExternalLink,
  LayoutGrid,
  MessageSquare,
  Settings,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "cn";

import { useFetch, useLocalFlag } from "@/lib/client/hooks";
import { useChats, useChatsStatus } from "@/lib/client/use-chats";
import { deleteChat, renameChat } from "@/lib/chat-store";
import type { StoredChat } from "@/lib/chat-types";
import { formatRelative } from "@/lib/format";
import type { DocumentListResponse } from "@/lib/pageindex/types";
import {
  ChatActionsMenu,
  DeleteChatDialog,
  RenameChatDialog,
} from "@/components/chat/chat-actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

const RECENTS_KEY = "pageindex-reader/sidebar/recents-open";

/**
 * App sidebar.
 *
 * Nav structure mirrors the shipped app (recovered from its public `/explore`
 * bundle): New Chat, Documents; Recents; usage + Settings + dashboard in the
 * footer. Desktop collapses to an icon rail (`collapsible="icon"`, ⌘/Ctrl+B or
 * the trigger); mobile uses the Sheet shadcn builds into Sidebar.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const chats = useChats();
  const chatsStatus = useChatsStatus();
  const docs = useFetch<DocumentListResponse>("/api/docs?limit=200");
  const [recentsOpen, setRecentsOpen] = useLocalFlag(RECENTS_KEY, true);
  const [renameTarget, setRenameTarget] = useState<StoredChat | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredChat | null>(null);

  const usage = useMemo(() => {
    const list = docs.data?.documents ?? [];
    return {
      documents: docs.data?.total ?? list.length,
      pages: list.reduce((sum, doc) => sum + (doc.pageNum ?? 0), 0),
    };
  }, [docs.data]);

  return (
    <Sidebar collapsible="icon" className="border-r border-line">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="PageIndex Reader" onClick={() => router.push("/chat")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink text-[10px] font-semibold text-paper">
                PI
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-serif text-[15px] text-ink">PageIndex</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-muted">Reader</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New chat"
                  isActive={pathname === "/chat"}
                  onClick={() => router.push("/chat")}
                >
                  <MessageSquare />
                  <span className="group-data-[collapsible=icon]:hidden">New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Documents"
                  isActive={pathname.startsWith("/library") || pathname.startsWith("/doc/")}
                  onClick={() => router.push("/library")}
                >
                  <LayoutGrid />
                  <span className="group-data-[collapsible=icon]:hidden">Documents</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="min-h-0 flex-1 group-data-[collapsible=icon]:hidden">
          <button
            type="button"
            onClick={() => setRecentsOpen(!recentsOpen)}
            aria-expanded={recentsOpen}
            className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-ink group-data-[collapsible=icon]:hidden"
          >
            <span>Recents</span>
            <ChevronDown
              className={`size-3.5 transition-transform ${recentsOpen ? "" : "-rotate-90"}`}
            />
          </button>

          {recentsOpen && (
            <SidebarGroupContent className="min-h-0 overflow-y-auto">
              {chatsStatus === "idle" || chatsStatus === "loading" ? (
                <div
                  aria-busy
                  aria-label="Loading conversations"
                  className="flex flex-col gap-1"
                >
                  {["w-3/4", "w-2/3", "w-1/2", "w-4/5", "w-3/5"].map((width) => (
                    <div key={width} className="flex h-8 items-center px-2">
                      <Skeleton className={cn("h-4", width)} />
                    </div>
                  ))}
                </div>
              ) : chats.length === 0 ? (
                <p className="px-2 py-2 text-[11.5px] leading-relaxed text-ink-muted group-data-[collapsible=icon]:hidden">
                  {chatsStatus === "error" ? "Could not load chats." : "No chats yet."}
                </p>
              ) : (
                <SidebarMenu>
                  {chats.map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        tooltip={chat.title}
                        isActive={pathname === `/chat/${chat.id}`}
                        onClick={() => router.push(`/chat/${chat.id}`)}
                      >
                        <span className="truncate">{chat.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-[9px] text-ink-muted group-data-[collapsible=icon]:hidden">
                          {formatRelative(new Date(chat.updatedAt).toISOString())}
                        </span>
                      </SidebarMenuButton>
                      <ChatActionsMenu
                        chat={chat}
                        onRename={() => setRenameTarget(chat)}
                        onDelete={() => setDeleteTarget(chat)}
                        trigger={
                          <SidebarMenuAction
                            showOnHover
                            aria-label={`Actions for ${chat.title}`}
                          />
                        }
                      />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-1 pb-1 group-data-[collapsible=icon]:hidden">
          <div className="flex items-baseline justify-between text-[10px] text-ink-muted">
            <span className="uppercase tracking-[0.14em]">Indexed</span>
            <span className="font-mono">
              {usage.documents} docs · {usage.pages} pages
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/8">
            <div
              className="h-full rounded-full bg-brand/70"
              style={{ width: `${Math.min(100, Math.max(2, (usage.pages / 2000) * 100))}%` }}
            />
          </div>
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            {/* The signed-in control: avatar opens Manage account / Sign out. */}
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <UserButton />
              <span className="min-w-0 flex-1 truncate text-[13px] group-data-[collapsible=icon]:hidden">
                Account
              </span>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              isActive={pathname === "/settings"}
              onClick={() => router.push("/settings")}
            >
              <Settings />
              <span className="group-data-[collapsible=icon]:hidden">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="PageIndex dashboard"
              onClick={() => window.open("https://dash.pageindex.ai", "_blank", "noreferrer")}
            >
              <ExternalLink />
              <span className="group-data-[collapsible=icon]:hidden">PageIndex dashboard</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />

      <RenameChatDialog
        chat={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={(title) => {
          if (renameTarget) renameChat(renameTarget.id, title);
        }}
      />
      <DeleteChatDialog
        chat={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={() => {
          if (!deleteTarget) return;
          deleteChat(deleteTarget.id);
          if (pathname === `/chat/${deleteTarget.id}`) router.push("/chat");
        }}
      />
    </Sidebar>
  );
}
