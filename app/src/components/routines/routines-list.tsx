import { IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/relative-time";
import {
  createRoutineMutationOptions,
  deleteRoutineMutationOptions,
  setRoutineEnabledMutationOptions,
} from "@/lib/routines/mutations";
import {
  type RoutineRecord,
  routinesQueryOptions,
} from "@/lib/routines/queries";
import { cn } from "@/lib/utils";
import { queryClient } from "@/query-client";

/**
 * What the last-run cell says, and in what tone.
 *
 * `lastRun === null` and `lastRun.status === null` are different facts, and saying the wrong one
 * invents news: the first is "this routine has never finished a run," the second is "one is open
 * right now" — which is also what a run stuck open after repeated dispatch failures looks like from
 * here. Neither is a failure, so neither gets the destructive tone; only `status: "failed"` does.
 */
function lastRunLabel(lastRun: RoutineRecord["lastRun"]): {
  text: string;
  className: string;
  /** The chip's dot, which carries the tone so the text can stay readable. */
  dot: string;
} {
  if (lastRun === null) {
    return {
      text: "Never run yet",
      className: "text-muted-foreground",
      dot: "bg-muted-foreground/40",
    };
  }
  if (lastRun.status === null) {
    return {
      text: "Running…",
      className: "text-muted-foreground",
      dot: "animate-pulse bg-muted-foreground",
    };
  }
  const when = lastRun.at ? relativeTime(lastRun.at) : "recently";
  if (lastRun.status === "failed") {
    return {
      text: `Failed ${when}`,
      className: "text-destructive",
      dot: "bg-destructive",
    };
  }
  if (lastRun.status === "skipped") {
    return {
      text: `Skipped ${when}`,
      className: "text-amber-600 dark:text-amber-500",
      dot: "bg-amber-500",
    };
  }
  if (lastRun.status === "succeeded") {
    return {
      text: `Ran ${when}`,
      className: "text-muted-foreground",
      dot: "bg-emerald-500",
    };
  }
  // An outcome this DTO doesn't recognise degrades to a neutral label rather than an invented
  // success — the contract typing (`RoutineRunOutcome | null`) makes a fourth outcome a build-time
  // error, but this is the runtime fallback if that ever slips through.
  return {
    text: `Finished ${when}`,
    className: "text-muted-foreground",
    dot: "bg-muted-foreground/40",
  };
}

/**
 * One fact about a routine, worn as a small pill so the footer reads as a row of states rather
 * than a sentence. On the muted item the pill's own background is what keeps it legible.
 */
function Chip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2 py-0.5 text-xs",
        className,
      )}
    >
      {children}
    </span>
  );
}

const DEFAULT_TIMEZONE = "Europe/Paris";

const scheduleOptions = [
  { value: "daily-09", label: "Daily at 09:00", cron: "0 9 * * *" },
  { value: "daily-14", label: "Daily at 14:00", cron: "0 14 * * *" },
  { value: "weekdays-09", label: "Weekdays at 09:00", cron: "0 9 * * 1-5" },
  { value: "weekly-monday-09", label: "Mondays at 09:00", cron: "0 9 * * 1" },
  { value: "custom", label: "Custom cron", cron: "" },
] as const;

function cronFor(value: string, custom: string) {
  const option = scheduleOptions.find((candidate) => candidate.value === value);
  if (!option) return custom;
  return option.value === "custom" ? custom : option.cron;
}

function CreateRoutineForm({ agentId }: { agentId: string }) {
  const createRoutine = useMutation(createRoutineMutationOptions(queryClient));
  const [instruction, setInstruction] = useState("");
  const [schedule, setSchedule] =
    useState<(typeof scheduleOptions)[number]["value"]>("daily-14");
  const [customCron, setCustomCron] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  const cron = cronFor(schedule, customCron);
  const canSubmit = instruction.trim().length > 0 && cron.trim().length > 0;

  return (
    <form
      className="mb-4 rounded-lg border bg-muted/20 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        createRoutine.mutate(
          {
            agentId,
            instruction,
            cron,
            timezone,
          },
          {
            onSuccess: () => {
              setInstruction("");
              setSchedule("daily-14");
              setCustomCron("");
            },
          },
        );
      }}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor={`routine-instruction-${agentId}`}>Instruction</Label>
          <Textarea
            className="min-h-20 resize-none"
            id={`routine-instruction-${agentId}`}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Extract MinaJobs data and post the summary here."
            value={instruction}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label>Schedule</Label>
          <Select
            onValueChange={(value) =>
              setSchedule(value as (typeof scheduleOptions)[number]["value"])
            }
            value={schedule}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {scheduleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schedule === "custom" ? (
            <Input
              aria-label="Custom cron"
              onChange={(event) => setCustomCron(event.target.value)}
              placeholder="0 14 * * *"
              value={customCron}
            />
          ) : null}
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`routine-timezone-${agentId}`}>Timezone</Label>
          <Input
            id={`routine-timezone-${agentId}`}
            onChange={(event) => setTimezone(event.target.value)}
            value={timezone}
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full lg:w-auto"
            disabled={!canSubmit || createRoutine.isPending}
            type="submit"
          >
            {createRoutine.isPending ? "Creating…" : "Create routine"}
          </Button>
        </div>
      </div>
      {createRoutine.error ? (
        <p className="mt-2 text-destructive text-sm" role="alert">
          {createRoutine.error.message}
        </p>
      ) : null}
      <p className="mt-2 text-muted-foreground text-xs">
        The routine will appear below and post back into this agent's channel.
        If the agent has several channels, create it from the exact channel by
        asking the agent there.
      </p>
    </form>
  );
}

/**
 * The signed-in person's standing instructions: a switch to stop one taking effect, and a delete
 * that ends it for good.
 *
 * Scoped by `agentId` on a Bot's own dialog, unscoped on the Routines page. One query either way —
 * the list is owner-scoped and small, so the scope is a filter here rather than a second endpoint.
 */
export function RoutinesList({
  agentId,
  embedded = false,
}: {
  /** Show only the routines this Bot carries out. Absent shows all of the person's. */
  agentId?: string;
  /** Inside a dialog, where the page section's own top margin is somebody else's spacing. */
  embedded?: boolean;
} = {}) {
  const routines = useQuery(routinesQueryOptions());
  const setEnabled = useMutation(setRoutineEnabledMutationOptions(queryClient));
  const deleteRoutine = useMutation(deleteRoutineMutationOptions(queryClient));
  /** The routine a delete is being confirmed for, or null. Its own dialog rather than one per row. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const rows = (routines.data ?? []).filter(
    (row) => agentId === undefined || row.agentId === agentId,
  );
  const confirming = rows.find((row) => row.id === confirmingId) ?? null;

  return (
    <PageSection className={embedded ? "mt-0" : undefined}>
      {agentId ? <CreateRoutineForm agentId={agentId} /> : null}

      {setEnabled.error ? (
        <p className="text-destructive text-sm" role="alert">
          {setEnabled.error.message}
        </p>
      ) : null}

      {/* Pending renders nothing: the empty-state sentence would otherwise flash for the fetch. */}
      {routines.isPending ? null : routines.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          Your routines could not be loaded.
        </p>
      ) : rows.length === 0 ? (
        <Empty className="h-[180px] border border-dashed">
          <EmptyHeader>
            <EmptyTitle className="text-muted-foreground">
              {agentId
                ? "Nothing scheduled for this coworker"
                : "Nothing scheduled"}
            </EmptyTitle>
            <EmptyDescription>
              {agentId
                ? 'Ask it in a channel — "every weekday at 9, …" — and it will appear here.'
                : 'Ask a Bot — "every weekday at 9, …" — and it will appear here.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((routine) => {
            const lastRun = lastRunLabel(routine.lastRun);
            return (
              <Item key={routine.id} variant="muted">
                {/* Paused reads at a glance: the content dims, and a chip below says the word. */}
                <ItemContent className={routine.enabled ? "" : "opacity-60"}>
                  <ItemTitle>
                    {routine.schedule}
                    <span className="font-normal text-muted-foreground text-xs">
                      {routine.timezone}
                    </span>
                  </ItemTitle>
                  <ItemDescription className="line-clamp-2">
                    {routine.instruction}
                  </ItemDescription>
                  {/* A set, so it wraps onto its own line rather than crowding the title. */}
                  <ItemFooter>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {routine.channel.gone ? (
                        <Chip className="border-destructive/40 text-destructive">
                          This channel is gone
                        </Chip>
                      ) : (
                        // Where it posts is a place, so the chip goes there.
                        <Link
                          params={{ channelId: routine.channel.id }}
                          to="/channel/$channelId"
                        >
                          <Chip className="text-muted-foreground transition-colors hover:text-foreground">
                            {routine.channel.name ?? "Unnamed channel"}
                          </Chip>
                        </Link>
                      )}
                      <Chip className={lastRun.className}>
                        <span
                          className={cn("size-1.5 rounded-full", lastRun.dot)}
                        />
                        {lastRun.text}
                      </Chip>
                      {/*
                       * Enabled only: the store recomputes nextRunAt on cron/timezone change or
                       * re-enable, so a disabled routine's stamp is frozen in the past — rendering
                       * it unguarded would announce a stale "3 days ago" as the next run. Paused
                       * takes its place, so the switch's state has a word as well as a position.
                       */}
                      {!routine.enabled ? (
                        <Chip className="text-muted-foreground">Paused</Chip>
                      ) : new Date(routine.nextRunAt).getTime() <=
                        Date.now() ? (
                        /*
                         * A stamp in the past is a firing the sweep has not picked up, and "Next 5
                         * hours ago" is nonsense. Said as what it is: due, and visibly waiting.
                         */
                        <Chip className="text-amber-600 dark:text-amber-500">
                          <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                          Due
                        </Chip>
                      ) : (
                        <Chip className="text-muted-foreground">
                          Next {relativeTime(routine.nextRunAt)}
                        </Chip>
                      )}
                    </div>
                  </ItemFooter>
                </ItemContent>
                <ItemActions>
                  {/*
                   * Binary and immediate: it takes effect when switched, there is no save.
                   * Disabled only while its own write is in flight, so switching one routine
                   * does not freeze the rest of the list — the same idiom the per-tool plugins
                   * page uses for its per-Bot grant switches.
                   */}
                  <Switch
                    aria-label={`Enable the routine scheduled ${routine.schedule}`}
                    checked={routine.enabled}
                    disabled={
                      setEnabled.isPending &&
                      setEnabled.variables?.id === routine.id
                    }
                    onCheckedChange={(next) =>
                      setEnabled.mutate({ id: routine.id, enabled: next })
                    }
                  />
                  <Button
                    aria-label={`Delete the routine scheduled ${routine.schedule}`}
                    onClick={() => {
                      deleteRoutine.reset();
                      setConfirmingId(routine.id);
                    }}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash />
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </div>
      )}

      {/*
       * One dialog for the whole list rather than one per row, keyed by which routine is being
       * confirmed. It names the schedule, not the id or the instruction, because the schedule is
       * the word a person reads first on the row and the one most likely to tell two routines apart
       * at a glance.
       */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setConfirmingId(null);
        }}
        open={confirming !== null}
      >
        {/* The heavier backdrop, forced: opened from a Bot's dialog this stacks over it, and Base
            UI would otherwise render a nested dialog with no backdrop at all. */}
        <DialogContent overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Delete "{confirming?.schedule}"?</DialogTitle>
            <DialogDescription>
              This standing instruction stops for good. Nothing further runs on
              this schedule, and there is no undo.
            </DialogDescription>
          </DialogHeader>
          {deleteRoutine.error ? (
            <p className="text-destructive text-sm" role="alert">
              {deleteRoutine.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => setConfirmingId(null)}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteRoutine.isPending}
              onClick={() => {
                if (!confirmingId) return;
                deleteRoutine.mutate(confirmingId, {
                  onSuccess: () => setConfirmingId(null),
                });
              }}
              size="sm"
              variant="destructive"
            >
              {deleteRoutine.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
