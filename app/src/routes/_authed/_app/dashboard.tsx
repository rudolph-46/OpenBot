import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AgentCard } from "@/components/agents/agent-card";
import {
  hasUnseenActivity,
  pinnedFirst,
} from "@/components/app-sidebar/app-sidebar";
import {
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { MoodAvatar } from "@/lib/avatars/mood-avatar";
import { channelListQueryOptions } from "@/lib/channels/queries";
import { relativeTime } from "@/lib/relative-time";

/**
 * A personal overview: what your channels and coworkers actually look like right now, rather than
 * only the composer `/` opens with. `/` stays the fastest way to start something; this is the
 * fastest way to see what is already going on.
 */
export const Route = createFileRoute("/_authed/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const channels = useInfiniteQuery(channelListQueryOptions());
  const { data: agents, isPending: agentsPending } = useQuery(
    agentListQueryOptions(),
  );

  const allChannels = channels.data ?? [];
  const recent = pinnedFirst(allChannels).slice(0, 6);
  const unreadCount = allChannels.filter(hasUnseenActivity).length;
  const mine = agents?.filter((agent) => !agent.systemOwned) ?? [];

  return (
    <PageShell
      description="What your channels and coworkers look like right now."
      title="Dashboard"
      width="wide"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active channels"
          loading={channels.isPending}
          value={allChannels.length}
        />
        <StatCard
          label="Unread"
          loading={channels.isPending}
          value={unreadCount}
        />
        <StatCard
          label="Your coworkers"
          loading={agentsPending}
          value={mine.length}
        />
      </div>

      <PageSection title="Recent conversations">
        {channels.isPending ? (
          <Skeleton className="mt-4 h-[240px]" />
        ) : recent.length === 0 ? (
          <Empty className="mt-4 h-[180px] border border-dashed">
            <EmptyHeader>
              <EmptyTitle className="text-muted-foreground">
                You don't have any channels yet.
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <PageRows>
            {recent.map((channel, index) => (
              <div key={channel.id}>
                <Link
                  className="block"
                  params={{ channelId: channel.id }}
                  to="/channel/$channelId"
                >
                  <Item size="sm">
                    <MoodAvatar
                      className="rounded-full"
                      seed={channel.agentIds[0] ?? channel.id}
                      size={32}
                    />
                    <ItemContent>
                      <ItemTitle>{channel.name}</ItemTitle>
                      <ItemDescription>
                        {channel.lastMessage ?? channel.summary ?? "—"}
                      </ItemDescription>
                    </ItemContent>
                    {channel.lastMessageAt ? (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {relativeTime(channel.lastMessageAt)}
                      </span>
                    ) : null}
                  </Item>
                </Link>
                {index !== recent.length - 1 && <Separator />}
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>

      <PageSection title="Your coworkers">
        {agentsPending ? (
          <Skeleton className="mt-4 h-[180px]" />
        ) : mine.length === 0 ? (
          <Empty className="mt-4 h-[180px] border border-dashed">
            <EmptyHeader>
              <EmptyTitle className="text-muted-foreground">
                You haven't created a coworker yet.
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mt-4 flex flex-wrap gap-4">
            {mine.map((agent) => (
              <Link
                key={agent.id}
                search={{ agent: agent.id }}
                to="/agents"
              >
                <AgentCard agent={agent} />
              </Link>
            ))}
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      {loading ? (
        <Skeleton className="h-8 w-12" />
      ) : (
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
