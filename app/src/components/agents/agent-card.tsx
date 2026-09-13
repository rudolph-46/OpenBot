import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import type { AgentProfile } from "@/lib/agents/queries";

const CATEGORY_COLORS = [
  "bg-violet-500",
  "bg-emerald-600",
  "bg-slate-500",
  "bg-rose-600",
  "bg-amber-500",
  "bg-cyan-600",
];

function hashString(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function agentPresentation(agent: AgentProfile) {
  const hash = hashString(agent.id);
  const titleWords = agent.title.trim().split(/\s+/).filter(Boolean);
  const category =
    titleWords.length > 0
      ? `${titleWords.slice(0, 2).join(" ")} Agent`
      : "AI Agent";
  return {
    category,
    categoryDot: CATEGORY_COLORS[hash % CATEGORY_COLORS.length],
    status: agent.hidden ? "Paused" : "Active",
    statusTone: agent.hidden
      ? "bg-destructive/10 text-destructive"
      : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  };
}

export function AgentCard({ agent }: { agent: AgentProfile }) {
  const meta = agentPresentation(agent);

  return (
    <div className="group flex h-[180px] min-w-0 flex-col justify-between rounded-lg border border-border bg-background p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/20 shadow-xs">
            <AbstractAvatar
              name={agent.name}
              seed={agent.avatarSeed}
              size={28}
            />
          </span>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {agent.name}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-md px-2.5 py-1 text-sm font-medium ${meta.statusTone}`}
        >
          {meta.status}
        </span>
      </div>

      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
        {agent.description || agent.roleDescription || agent.title}
      </p>

      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
          <span
            className={`size-1.5 shrink-0 rounded-full ${meta.categoryDot}`}
          />
          <span className="truncate">{meta.category}</span>
        </span>
        <span className="size-1 rounded-full bg-muted-foreground/20" />
        <span className="shrink-0">
          {agent.visibility === "private" ? "Private" : "Public"}
        </span>
        {agent.model ? (
          <>
            <span className="size-1 rounded-full bg-muted-foreground/20" />
            <span className="truncate">{agent.model.name}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
