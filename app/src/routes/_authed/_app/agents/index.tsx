import {
  IconArrowLeft,
  IconChevronRight,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentManagementPanel } from "@/components/agents/agent-dialog";
import { CreateAgentDialog } from "@/components/agents/create-agent-dialog";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { StaggerItem } from "@/components/layout/stagger";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type AgentProfile,
  agentListQueryOptions,
  agentQueryOptions,
  isSharedWithYou,
} from "@/lib/agents/queries";

const agentsSearchSchema = z.object({
  new: z.boolean().optional(),
  agent: z.string().optional(),
});

export const Route = createFileRoute("/_authed/_app/agents/")({
  validateSearch: agentsSearchSchema,
  component: AgentsScreen,
});

function AgentGrid({
  agents,
  empty,
  failed,
  loading,
  title,
}: {
  agents: AgentProfile[] | undefined;
  empty: string;
  failed: boolean;
  loading: boolean;
  title: string;
}) {
  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {["one", "two", "three", "four", "five", "six"].map((placeholder) => (
            <Skeleton className="h-[180px] rounded-lg" key={placeholder} />
          ))}
        </div>
      ) : agents?.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {agents.map((agent, index) => (
            <StaggerItem index={index} key={agent.id}>
              <Link className="block" to="/agents" search={{ agent: agent.id }}>
                <AgentCard agent={agent} />
              </Link>
            </StaggerItem>
          ))}
        </div>
      ) : failed ? (
        <Empty className="h-[180px] border border-dashed border-destructive">
          <EmptyHeader>
            <EmptyTitle className="text-destructive">
              Agents couldn't be loaded.
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty className="h-[180px] border border-dashed">
          <EmptyHeader>
            <EmptyTitle className="text-muted-foreground">{empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

function AgentsScreen() {
  const { new: isCreating, agent: selectedAgentId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const {
    data: agents,
    isPending: loading,
    isError: failed,
  } = useQuery(agentListQueryOptions());
  const mine = agents?.filter((a) => a.mine);
  const explore = agents?.filter(isSharedWithYou);
  const close = () => navigate({ search: {} });

  return (
    <>
      <SidebarToggleBar />
      {selectedAgentId && !isCreating ? (
        <AgentEditPage agentId={selectedAgentId} />
      ) : (
        <main className="mx-auto flex w-full max-w-[1540px] flex-col gap-8 px-6 py-8">
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">AI Agent</p>
              <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            </div>
            <Button
              render={(props) => (
                <Link to="/agents" search={{ new: true }} {...props} />
              )}
            >
              <IconPlus />
              New agent
            </Button>
          </header>
          <AgentGrid
            agents={mine}
            empty="You don't have any agents created."
            failed={failed && agents === undefined}
            loading={loading}
            title="Your agents"
          />
          <AgentGrid
            agents={explore}
            empty="Nobody has shared an agent with you yet."
            failed={failed && agents === undefined}
            loading={loading}
            title="Explore agents"
          />
        </main>
      )}
      <CreateAgentDialog
        onClose={close}
        onCreated={(agentId) => navigate({ search: { agent: agentId } })}
        open={isCreating === true}
      />
    </>
  );
}

function AgentEditPage({ agentId }: { agentId: string }) {
  const navigate = Route.useNavigate();
  const agent = useQuery(agentQueryOptions(agentId));

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] flex-col gap-5 overflow-hidden px-6 py-8">
      <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 pb-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            aria-label="Back to agents"
            onClick={() => navigate({ search: {} })}
            size="icon-sm"
            variant="ghost"
          >
            <IconArrowLeft />
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-lg">
            <IconSettings className="size-5 text-muted-foreground" />
            <span className="text-muted-foreground">AI Agent</span>
            <IconChevronRight className="size-4 text-muted-foreground" />
            <span className="truncate font-semibold">
              {agent.data?.name ?? "Edit"}
            </span>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background shadow-xs">
        <AgentManagementPanel agentId={agentId} page />
      </div>
    </main>
  );
}
