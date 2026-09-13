import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
import useMeasure from "react-use-measure";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { Textarea } from "@/components/ui/textarea";
import {
  type AgentFormValues,
  agentFormSchema,
  agentInputFrom,
  emptyAgentForm,
} from "@/lib/agents/form";
import { createAgentMutationOptions } from "@/lib/agents/mutations";
import {
  agentCapabilitiesQueryOptions,
  type ConnectionVerdict,
  testAgentConnection,
} from "@/lib/agents/queries";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { MoodAvatar } from "@/lib/avatars/mood-avatar";
import { useStartChannel } from "@/lib/channels/start";
import { client } from "@/lib/client";
import { grantPlugin, invalidatePlugins } from "@/lib/plugins/mutations";
import {
  type CatalogueItem,
  type PluginServer,
  type PluginSkill,
  pluginsPageQueryOptions,
  type SkillCatalogueItem,
} from "@/lib/plugins/queries";
import { queryClient } from "@/query-client";

/**
 * Creating a coworker, one question at a time.
 *
 * A wizard rather than a form, because the answers are three different kinds of decision: who this
 * coworker is, who may see it, and where it runs. The last one is the fork — a built-in coworker
 * needs nothing more, a managed one needs an endpoint — and a flat form showing endpoint fields to
 * everybody made the common case read like the hard one.
 */
export function CreateAgentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** The new coworker's id, so the caller can open its dialog on it. */
  onCreated: (agentId: string) => void;
}) {
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[920px]">
        {/* All wizard state lives below DialogContent, whose portal unmounts on close: dismissing
            the dialog mid-way discards the half-answered steps rather than pickling them. */}
        <CreateAgentWizard onClose={onClose} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

/** The steps, in the order they are asked. The name is the questionnaire item's name. */
const STEPS = [
  "identity",
  "knowledge",
  "visibility",
  "kind",
  "plugins",
  "skills",
  "tools",
  "routine",
] as const;
type StepName = (typeof STEPS)[number];

const DEFAULT_TIMEZONE = "Europe/Paris";

const scheduleOptions = [
  { value: "daily-09", label: "Daily at 09:00", cron: "0 9 * * *" },
  { value: "daily-14", label: "Daily at 14:00", cron: "0 14 * * *" },
  { value: "weekdays-09", label: "Weekdays at 09:00", cron: "0 9 * * 1-5" },
  { value: "weekly-monday-09", label: "Mondays at 09:00", cron: "0 9 * * 1" },
  { value: "custom", label: "Custom cron", cron: "" },
] as const;

type ScheduleValue = (typeof scheduleOptions)[number]["value"];

function scheduleLabel(value: ScheduleValue, customCron: string) {
  const option = scheduleOptions.find((candidate) => candidate.value === value);
  if (!option) return customCron;
  return option.value === "custom"
    ? customCron
    : `${option.label} (${option.cron})`;
}

/** The two ways a coworker can be seen. */
const VISIBILITY_OPTIONS: Array<{
  value: AgentFormValues["visibility"];
  title: string;
  description: string;
}> = [
  {
    value: "private",
    title: "Private",
    description: "Only you can see it and start channels with it.",
  },
  {
    value: "public",
    title: "Public",
    description: "Everyone in the deployment can find and use it.",
  },
];

/**
 * Where the coworker runs. Not a stored field: the server knows only whether an endpoint was
 * given, so "built-in" is the empty endpoint and this choice exists to make that fork explicit.
 */
type AgentKind = "builtin" | "managed";

const KIND_OPTIONS: Array<{
  value: AgentKind;
  title: string;
  description: string;
}> = [
  {
    value: "builtin",
    title: "Built-in",
    description:
      "Runs on this deployment's own Bot. Nothing to host or connect — it is ready the moment it is created.",
  },
  {
    value: "managed",
    title: "Managed",
    description:
      "Runs on an agent you host, spoken to over AG-UI. This server dials your endpoint on every run.",
  },
];

/** The first step's slice of the form contract, so its errors match the server's limits. */
const identitySchema = agentFormSchema.pick({
  name: true,
  title: true,
  roleDescription: true,
  description: true,
  instructions: true,
});

type IdentityField = keyof typeof identitySchema.shape;

/** First message per field, or nothing when the step parses. */
function identityIssues(
  values: AgentFormValues,
): Partial<Record<IdentityField, string>> {
  const parsed = identitySchema.safeParse(values);
  if (parsed.success) return {};
  const issues: Partial<Record<IdentityField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as IdentityField | undefined;
    if (field && !issues[field]) issues[field] = issue.message;
  }
  return issues;
}

/** A short random string, good enough as a DiceBear seed and nothing else. */
function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Add a member if it is absent, remove it if it is present. */
function toggled(set: ReadonlySet<string>, member: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(member)) next.add(member);
  return next;
}

function knowledgeSetupPrompt(
  links: string,
  files: readonly File[],
): string | null {
  const trimmedLinks = links
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (trimmedLinks.length === 0 && files.length === 0) return null;
  const lines = ["Use these knowledge sources when configuring this coworker."];
  if (trimmedLinks.length > 0) {
    lines.push("Links:");
    lines.push(...trimmedLinks.map((link) => `- ${link}`));
  }
  if (files.length > 0) {
    lines.push("Documents selected during setup:");
    lines.push(
      ...files.map(
        (file) => `- ${file.name} (${Math.ceil(file.size / 1024)} KB)`,
      ),
    );
    lines.push(
      "Ask me to attach these documents in this channel so you can read their contents.",
    );
  }
  return lines.join("\n");
}

/** A pane arrives from the side the journey is moving toward, and leaves out the other. */
const variants = {
  initial: (direction: number) => ({ x: `${110 * direction}%`, opacity: 0 }),
  active: { x: "0%", opacity: 1 },
  exit: (direction: number) => ({ x: `${-110 * direction}%`, opacity: 0 }),
};

function CreateAgentWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (agentId: string) => void;
}) {
  const createAgent = useMutation(createAgentMutationOptions(queryClient));
  const { data: me } = useQuery(currentUserQueryOptions());
  const pluginsQuery = useQuery(pluginsPageQueryOptions());
  const { data: plugins } = pluginsQuery;
  const { start: startChannel } = useStartChannel();
  /*
   * Whether "built-in" is a coworker this deployment can actually make. Assumed true while the
   * answer is loading, so the common deployment never sees the card flash from disabled to
   * enabled; the server refuses the create either way, so an optimistic card risks nothing.
   */
  const { data: capabilities } = useQuery(agentCapabilitiesQueryOptions());
  const builtInAvailable = capabilities?.builtInAvailable ?? true;

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  /** Whether this step's Continue was pressed, which is when its errors become worth showing. */
  const [tried, setTried] = useState(false);
  const [values, setValues] = useState<AgentFormValues>(emptyAgentForm);
  /** Deliberately unanswered to start with: revealing endpoint fields is the point of asking. */
  const [kind, setKind] = useState<AgentKind | null>(null);

  const [connection, setConnection] = useState<ConnectionVerdict | null>(null);
  const [testing, setTesting] = useState(false);
  const [ref, bounds] = useMeasure();

  // A handful of faces to choose from, generated once when the dialog opens rather than on every
  // keystroke: nothing about the identity step should reshuffle the row underneath a person still
  // typing the name.
  const [avatarCandidates, setAvatarCandidates] = useState<string[]>(() =>
    Array.from({ length: 6 }, randomSeed),
  );
  const [avatarSeed, setAvatarSeed] = useState(() => avatarCandidates[0]);

  /**
   * Set once "kind" is answered: the create moves here now that three more questions follow it,
   * because granting a skill or a tool needs an id to grant it to. A coworker abandoned after this
   * point is already real and already saved, the same as it always was the moment "kind" was
   * answered — only the step it happens on moved.
   */
  const [agentId, setAgentId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [selectedSkillRefs, setSelectedSkillRefs] = useState<Set<string>>(
    new Set(),
  );
  const [appliedSkillRefs, setAppliedSkillRefs] = useState<Set<string>>(
    new Set(),
  );
  const [selectedToolRefs, setSelectedToolRefs] = useState<Set<string>>(
    new Set(),
  );
  const [appliedToolRefs, setAppliedToolRefs] = useState<Set<string>>(
    new Set(),
  );
  const [selectedPluginKeys, setSelectedPluginKeys] = useState<Set<string>>(
    new Set(),
  );
  const [installedPluginKeys, setInstalledPluginKeys] = useState<Set<string>>(
    new Set(),
  );
  const [knowledgeLinks, setKnowledgeLinks] = useState("");
  const [knowledgeFiles, setKnowledgeFiles] = useState<File[]>([]);
  const [routineTask, setRoutineTask] = useState("");
  const [routineSchedule, setRoutineSchedule] =
    useState<ScheduleValue>("daily-09");
  const [routineCustomCron, setRoutineCustomCron] = useState("");
  const [routineTimezone, setRoutineTimezone] = useState(DEFAULT_TIMEZONE);

  const last = step === STEPS.length - 1;
  const set = <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  /** Test endpoint reachability from the server, which is what runs will use. */
  const testConnection = async () => {
    setTesting(true);
    setConnection(null);
    try {
      setConnection(
        await testAgentConnection(values.endpoint, values.authValue),
      );
    } finally {
      setTesting(false);
    }
  };

  const identityErrors = tried ? identityIssues(values) : {};
  const endpointError = !tried
    ? undefined
    : kind === "managed" && values.endpoint.trim() === ""
      ? "An endpoint is required for a managed coworker."
      : agentFormSchema.shape.endpoint.safeParse(values.endpoint).error
          ?.issues[0]?.message;

  const stepValid = (): boolean => {
    if (STEPS[step] === "identity") {
      return identitySchema.safeParse(values).success;
    }
    if (STEPS[step] === "kind") {
      if (kind === null) return false;
      if (kind === "builtin") return true;
      return (
        values.endpoint.trim() !== "" &&
        agentFormSchema.shape.endpoint.safeParse(values.endpoint).success
      );
    }
    // Visibility always holds an answer; the radio starts on private. Skills, tools and the
    // routine are all optional questions: none of them can fail to be "answered".
    return true;
  };

  /** Grant every selected skill and tool to the coworker just created, skipping what already holds. */
  const installSelectedPlugins = async () => {
    if (selectedPluginKeys.size === 0) return;
    setApplying(true);
    setApplyError(null);
    try {
      const existing = new Set(
        (plugins?.servers ?? []).map((server) => server.id),
      );
      for (const key of selectedPluginKeys) {
        if (existing.has(key) || installedPluginKeys.has(key)) continue;
        await client("/api/plugins/servers", {
          method: "POST",
          body: { key },
          fallback: "The plugin could not be added.",
        });
      }
      setInstalledPluginKeys(new Set(selectedPluginKeys));
      await invalidatePlugins(queryClient);
      await pluginsQuery.refetch();
    } catch (error) {
      setApplyError(
        error instanceof Error
          ? error.message
          : "That plugin could not be added.",
      );
      throw error;
    } finally {
      setApplying(false);
    }
  };

  const applySelections = async () => {
    if (!agentId) return;
    setApplying(true);
    setApplyError(null);
    try {
      const catalogueByKey = new Map(
        (plugins?.skillsCatalogue ?? []).map((entry) => [entry.key, entry]),
      );
      const existingSlugs = new Set(
        (plugins?.skills ?? []).map((skill) => skill.slug),
      );
      for (const slug of selectedSkillRefs) {
        if (appliedSkillRefs.has(slug)) continue;
        if (!existingSlugs.has(slug)) {
          // A Discover entry nobody has added yet: writing it is what "selecting" it means here.
          const entry = catalogueByKey.get(slug);
          if (!entry) continue;
          await client("/api/plugins/skills", {
            method: "POST",
            body: {
              slug: entry.key,
              title: entry.title,
              summary: entry.summary,
              instructions: entry.instructions,
            },
            fallback: "The skill could not be saved.",
          });
        }
        await grantPlugin({ kind: "skill", ref: slug, agentId });
      }
      for (const toolRef of selectedToolRefs) {
        if (appliedToolRefs.has(toolRef)) continue;
        await grantPlugin({ kind: "mcp", ref: toolRef, agentId });
      }
      setAppliedSkillRefs(new Set(selectedSkillRefs));
      setAppliedToolRefs(new Set(selectedToolRefs));
      await invalidatePlugins(queryClient);
    } catch (error) {
      setApplyError(
        error instanceof Error
          ? error.message
          : "That could not be granted to the coworker.",
      );
      throw error;
    } finally {
      setApplying(false);
    }
  };

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setTried(false);
    setStep(to);
  };

  /**
   * Every way forward lands here — the Continue button, Enter in a field, Enter on a choice — as
   * the questionnaire form's submit. Backwards never validates; half answers are fine to leave.
   */
  const advance = async () => {
    if (!stepValid()) {
      setTried(true);
      return;
    }

    // The create moves here, off the last step: three more questions grant things to the
    // coworker's own id, so it has to exist before they can be asked. A step revisited after
    // Back does not create a second one — the id already set is reused.
    if (STEPS[step] === "kind" && !agentId) {
      const agent = await createAgent.mutateAsync({
        ...agentInputFrom(values),
        avatarSeed,
      });
      setAgentId(agent.id);
      go(step + 1);
      return;
    }

    if (STEPS[step] === "plugins") {
      try {
        await installSelectedPlugins();
      } catch {
        return;
      }
      go(step + 1);
      return;
    }

    if (!last) {
      go(step + 1);
      return;
    }

    // Whatever was ticked on the skills and tools steps is granted now, in one place, so a
    // person who went Back and forth between them is not granted things twice or left with a
    // partial set from a step they never returned to.
    try {
      await applySelections();
    } catch {
      return; // applyError is already set; stay on this step rather than finish partway.
    }

    const knowledgePrompt = knowledgeSetupPrompt(
      knowledgeLinks,
      knowledgeFiles,
    );
    if (agentId && (routineTask.trim() !== "" || knowledgePrompt)) {
      const frequency = scheduleLabel(
        routineSchedule,
        routineCustomCron.trim(),
      );
      const routinePrompt =
        routineTask.trim() === ""
          ? null
          : [
              "Create a routine for this coworker with these settings.",
              `Task: ${routineTask.trim()}`,
              `Frequency: ${frequency}`,
              `Timezone: ${routineTimezone.trim() || DEFAULT_TIMEZONE}`,
            ].join("\n");
      const setupPrompt = [knowledgePrompt, routinePrompt]
        .filter(Boolean)
        .join("\n\n");
      // Navigates to the new channel itself, which is what leaves /agents and this dialog with
      // it — calling onClose here as well would fire a second, competing navigation back to it.
      await startChannel(agentId, setupPrompt);
      return;
    }
    if (agentId) onCreated(agentId);
  };

  return (
    <>
      {/* Read aloud, never shown: each step carries its own heading, and a dialog-level title
          above them made two heading sizes compete. The popup still needs an accessible name. */}
      <DialogTitle className="sr-only">New coworker</DialogTitle>
      <DialogBody className="overflow-y-auto">
        <Questionnaire
          item={STEPS[step]}
          noValidate
          /*
           * Enter means Continue, handled here rather than through the form's submit. The
           * questionnaire's own submit path refuses any item it does not consider answered, and it
           * cannot see these fields: the identity inputs are this dialog's own, not registered
           * answers. Running first and preventing default also keeps the primitive's Enter
           * handling out of the way; a textarea keeps Enter for its line breaks.
           */
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              event.target instanceof HTMLInputElement
            ) {
              event.preventDefault();
              void advance();
            }
          }}
          onSubmit={(event) => event.preventDefault()}
        >
          {/* A plain element rather than QuestionnaireProgress: only the active step is mounted,
              so the primitive would count one question and announce the wrong total. */}
          <p className="text-xs font-medium text-muted-foreground tabular-nums">
            Step {step + 1} of {STEPS.length}
          </p>
          <MotionConfig
            transition={{ duration: 0.5, type: "spring", bounce: 0 }}
          >
            {/* The frame follows each pane's height, so the buttons glide instead of jumping.
                `relative` is load-bearing: popLayout positions the exiting pane absolutely, and an
                absolute element is clipped by overflow-hidden only on an ancestor that positions
                it. Without this its containing block is the dialog popup, and the old pane slides
                across the whole dialog instead of out of this frame. */}
            <motion.div
              animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}
              className="relative overflow-hidden"
            >
              <div ref={ref}>
                <AnimatePresence
                  custom={direction}
                  initial={false}
                  mode="popLayout"
                >
                  <motion.div
                    animate="active"
                    className="pt-4"
                    custom={direction}
                    exit="exit"
                    initial="initial"
                    key={STEPS[step]}
                    variants={variants}
                  >
                    {STEPS[step] === "identity" ? (
                      <IdentityStep
                        avatarCandidates={avatarCandidates}
                        avatarSeed={avatarSeed}
                        errors={identityErrors}
                        onSelectAvatar={setAvatarSeed}
                        onShuffleAvatars={() => {
                          const next = Array.from({ length: 6 }, randomSeed);
                          setAvatarCandidates(next);
                          setAvatarSeed(next[0]);
                        }}
                        set={set}
                        values={values}
                      />
                    ) : STEPS[step] === "knowledge" ? (
                      <KnowledgeStep
                        files={knowledgeFiles}
                        links={knowledgeLinks}
                        onFilesChange={setKnowledgeFiles}
                        onLinksChange={setKnowledgeLinks}
                      />
                    ) : STEPS[step] === "visibility" ? (
                      <VisibilityStep set={set} values={values} />
                    ) : STEPS[step] === "kind" ? (
                      <KindStep
                        builtInAvailable={builtInAvailable}
                        endpointError={endpointError}
                        kind={kind}
                        onKind={(next) => {
                          setKind(next);
                          if (next === "builtin") {
                            // A built-in coworker has no endpoint; whatever was typed on the way
                            // past must not ride along into the create.
                            set("endpoint", "");
                            set("authValue", "");
                            setConnection(null);
                          }
                        }}
                        onTest={() => void testConnection()}
                        connection={connection}
                        set={set}
                        showKindError={tried && kind === null}
                        testing={testing}
                        values={values}
                      />
                    ) : STEPS[step] === "plugins" ? (
                      <PluginsStep
                        catalogue={plugins?.catalogue ?? []}
                        onToggle={(key) =>
                          setSelectedPluginKeys((current) =>
                            toggled(current, key),
                          )
                        }
                        selected={selectedPluginKeys}
                        servers={plugins?.servers ?? []}
                      />
                    ) : STEPS[step] === "skills" ? (
                      <SkillsStep
                        catalogue={plugins?.skillsCatalogue ?? []}
                        onToggle={(ref) =>
                          setSelectedSkillRefs((current) =>
                            toggled(current, ref),
                          )
                        }
                        selected={selectedSkillRefs}
                        skills={plugins?.skills ?? []}
                        userId={me?.id}
                      />
                    ) : STEPS[step] === "tools" ? (
                      <ToolsStep
                        onToggle={(ref) =>
                          setSelectedToolRefs((current) =>
                            toggled(current, ref),
                          )
                        }
                        selected={selectedToolRefs}
                        servers={plugins?.servers ?? []}
                      />
                    ) : (
                      <RoutineStep
                        customCron={routineCustomCron}
                        onCustomCronChange={setRoutineCustomCron}
                        onScheduleChange={setRoutineSchedule}
                        onTaskChange={setRoutineTask}
                        onTimezoneChange={setRoutineTimezone}
                        schedule={routineSchedule}
                        task={routineTask}
                        timezone={routineTimezone}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </MotionConfig>

          {createAgent.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {createAgent.error.message}
            </p>
          ) : null}
          {applyError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {applyError}
            </p>
          ) : null}

          <div className="mt-6 flex justify-between gap-2">
            <Button
              onClick={step === 0 ? onClose : () => go(step - 1)}
              type="button"
              variant="outline"
            >
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            <Button
              disabled={createAgent.isPending || applying}
              onClick={() => void advance()}
              type="button"
            >
              {last
                ? createAgent.isPending || applying
                  ? "Working…"
                  : "Create coworker"
                : applying
                  ? "Working…"
                  : STEPS[step] === "kind" && createAgent.isPending
                    ? "Creating…"
                    : "Continue"}
            </Button>
          </div>
        </Questionnaire>
      </DialogBody>
    </>
  );
}

/**
 * `hidden={false}` and `inert={false}` on every item, against the questionnaire's own hiding.
 *
 * The primitive blanks any item that is not the active one, which is right for its stacked layout
 * and wrong here: only the active step is mounted, except for the instant an old pane is sliding
 * out under AnimatePresence — exactly when the primitive would blank it mid-slide. The item's
 * visibility is the animation's job in this dialog, never the questionnaire's.
 */
function StepItem({
  name,
  children,
}: {
  name: StepName;
  children: React.ReactNode;
}) {
  return (
    <QuestionnaireItem hidden={false} inert={false} name={name}>
      {children}
    </QuestionnaireItem>
  );
}

function IdentityStep({
  values,
  errors,
  set,
  avatarSeed,
  avatarCandidates,
  onSelectAvatar,
  onShuffleAvatars,
}: {
  values: AgentFormValues;
  errors: Partial<Record<IdentityField, string>>;
  set: <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => void;
  avatarSeed: string;
  avatarCandidates: string[];
  onSelectAvatar: (seed: string) => void;
  onShuffleAvatars: () => void;
}) {
  return (
    <StepItem name="identity">
      <QuestionnaireTitle>Who is this coworker?</QuestionnaireTitle>
      <QuestionnaireDescription>
        Define how it appears, what it is for, and the instructions it follows.
      </QuestionnaireDescription>
      <Field>
        <FieldLabel>Avatar</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          {avatarCandidates.map((seed) => {
            const chosen = seed === avatarSeed;
            return (
              <button
                aria-label="Use this avatar"
                aria-pressed={chosen}
                className={`rounded-full ring-2 transition-colors ${
                  chosen ? "ring-primary" : "ring-transparent hover:ring-border"
                }`}
                key={seed}
                onClick={() => onSelectAvatar(seed)}
                type="button"
              >
                <MoodAvatar seed={seed} size={44} />
              </button>
            );
          })}
          <Button
            onClick={onShuffleAvatars}
            size="sm"
            type="button"
            variant="outline"
          >
            Shuffle
          </Button>
        </div>
      </Field>
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="create-agent-name">Name</FieldLabel>
          <Input
            aria-invalid={errors.name ? true : undefined}
            id="create-agent-name"
            onChange={(event) => set("name", event.target.value)}
            placeholder="Expense Manager"
            value={values.name}
          />
          {errors.name ? (
            <FieldError errors={[{ message: errors.name }]} />
          ) : null}
        </Field>
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor="create-agent-title">Title</FieldLabel>
          <Input
            aria-invalid={errors.title ? true : undefined}
            id="create-agent-title"
            onChange={(event) => set("title", event.target.value)}
            placeholder="Finance Operations"
            value={values.title}
          />
          {errors.title ? (
            <FieldError errors={[{ message: errors.title }]} />
          ) : null}
        </Field>
        <Field data-invalid={errors.roleDescription ? true : undefined}>
          <FieldLabel htmlFor="create-agent-description">
            Description
          </FieldLabel>
          <Textarea
            aria-invalid={errors.description ? true : undefined}
            id="create-agent-description"
            onChange={(event) => {
              const next = event.target.value;
              set("description", next);
              if (
                !values.roleDescription ||
                values.roleDescription === values.description
              ) {
                set("roleDescription", next);
              }
            }}
            placeholder="Reviews expenses, follows up on missing receipts, and keeps finance work moving."
            rows={3}
            value={values.description}
          />
          {errors.description ? (
            <FieldError errors={[{ message: errors.description }]} />
          ) : null}
        </Field>
        <Field data-invalid={errors.instructions ? true : undefined}>
          <FieldLabel htmlFor="create-agent-instructions">
            Instructions
          </FieldLabel>
          <Textarea
            aria-invalid={errors.instructions ? true : undefined}
            id="create-agent-instructions"
            onChange={(event) => {
              const next = event.target.value;
              set("roleDescription", next);
              set("instructions", next);
            }}
            placeholder="Review receipts, categorize expenses, ask for missing evidence, and never invent transaction details."
            rows={6}
            value={values.instructions}
          />
          {errors.instructions ? (
            <FieldError errors={[{ message: errors.instructions }]} />
          ) : null}
        </Field>
      </FieldGroup>
    </StepItem>
  );
}

function KnowledgeStep({
  links,
  files,
  onLinksChange,
  onFilesChange,
}: {
  links: string;
  files: readonly File[];
  onLinksChange: (value: string) => void;
  onFilesChange: (files: File[]) => void;
}) {
  return (
    <StepItem name="knowledge">
      <QuestionnaireTitle>What should it know?</QuestionnaireTitle>
      <QuestionnaireDescription>
        Optional. Add URLs, YouTube links, or documents to bring into the setup
        channel for this coworker.
      </QuestionnaireDescription>
      <FieldGroup className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="create-agent-knowledge-links">
            Links and YouTube videos
          </FieldLabel>
          <Textarea
            id="create-agent-knowledge-links"
            onChange={(event) => onLinksChange(event.target.value)}
            placeholder={
              "https://example.com/process\nhttps://youtube.com/watch?v=..."
            }
            rows={5}
            value={links}
          />
          <FieldDescription>
            One link per line. The setup channel will ask the coworker to use
            these as sources.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="create-agent-knowledge-files">
            Documents
          </FieldLabel>
          <Input
            id="create-agent-knowledge-files"
            multiple
            onChange={(event) =>
              onFilesChange(Array.from(event.currentTarget.files ?? []))
            }
            type="file"
          />
          {files.length > 0 ? (
            <div className="rounded-md border bg-muted/30 p-2 text-sm">
              {files.map((file) => (
                <div className="truncate" key={`${file.name}-${file.size}`}>
                  {file.name}
                </div>
              ))}
            </div>
          ) : null}
          <FieldDescription>
            File bytes are not persisted as agent knowledge yet. They are listed
            in the setup channel so you can attach them there.
          </FieldDescription>
        </Field>
      </FieldGroup>
    </StepItem>
  );
}

function VisibilityStep({
  values,
  set,
}: {
  values: AgentFormValues;
  set: <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => void;
}) {
  return (
    <StepItem name="visibility">
      <QuestionnaireTitle>Who can see it?</QuestionnaireTitle>
      <QuestionnaireChoices>
        {VISIBILITY_OPTIONS.map((option) => (
          <QuestionnaireChoice
            checked={values.visibility === option.value}
            key={option.value}
            onChange={() => set("visibility", option.value)}
            value={option.value}
          >
            <span className="font-medium">{option.title}</span>
            <QuestionnaireChoiceDescription>
              {option.description}
            </QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
        ))}
      </QuestionnaireChoices>
    </StepItem>
  );
}

function KindStep({
  builtInAvailable,
  kind,
  onKind,
  showKindError,
  values,
  set,
  endpointError,
  connection,
  testing,
  onTest,
}: {
  /** Whether this deployment has a Bot of its own for a coworker to run on. */
  builtInAvailable: boolean;
  kind: AgentKind | null;
  onKind: (kind: AgentKind) => void;
  showKindError: boolean;
  values: AgentFormValues;
  set: <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => void;
  endpointError?: string;
  connection: ConnectionVerdict | null;
  testing: boolean;
  onTest: () => void;
}) {
  return (
    <StepItem name="kind">
      <QuestionnaireTitle>Where does it run?</QuestionnaireTitle>
      <QuestionnaireChoices>
        {KIND_OPTIONS.map((option) => {
          /*
           * Shown but not offerable, rather than hidden: a deployment with no managed Bot cannot
           * back a built-in coworker, and the create would be refused. The card staying visible is
           * what tells the person the kind exists and why it is not theirs to pick.
           */
          const unavailable = option.value === "builtin" && !builtInAvailable;
          return (
            <QuestionnaireChoice
              checked={kind === option.value}
              disabled={unavailable}
              key={option.value}
              onChange={() => onKind(option.value)}
              value={option.value}
            >
              <span className="font-medium">{option.title}</span>
              <QuestionnaireChoiceDescription>
                {unavailable
                  ? "Not available here: this deployment has no Bot of its own for a coworker to run on."
                  : option.description}
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
          );
        })}
      </QuestionnaireChoices>
      {showKindError ? (
        <p className="text-sm text-destructive" role="alert">
          Choose where this coworker runs.
        </p>
      ) : null}
      {kind === "managed" ? (
        <FieldGroup>
          <Field data-invalid={endpointError ? true : undefined}>
            <FieldLabel htmlFor="create-agent-endpoint">
              Agent endpoint
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                aria-invalid={endpointError ? true : undefined}
                id="create-agent-endpoint"
                onChange={(event) => set("endpoint", event.target.value)}
                placeholder="https://your-agent.example.com/ag-ui"
                value={values.endpoint}
              />
              <Button
                disabled={!values.endpoint || testing}
                onClick={onTest}
                type="button"
                variant="outline"
              >
                {testing ? "Testing…" : "Test"}
              </Button>
            </div>
            {endpointError ? (
              <FieldError errors={[{ message: endpointError }]} />
            ) : null}
            {connection ? (
              <p
                className={`text-sm ${connection.ok ? "text-muted-foreground" : "text-destructive"}`}
                role="status"
              >
                {connection.ok
                  ? `It answered: ${connection.events.join(", ")}`
                  : connection.reason}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Anything that speaks AG-UI works. This server dials your agent,
                so an agent on your own machine has to be reachable from here.
              </p>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="create-agent-key">
              Key for that agent (optional)
            </FieldLabel>
            <Input
              autoComplete="off"
              id="create-agent-key"
              onChange={(event) => set("authValue", event.target.value)}
              placeholder="Bearer …"
              type="password"
              value={values.authValue}
            />
            <p className="text-muted-foreground text-sm">
              Sent as an <code>Authorization</code> header on every run, and
              kept in the credential vault.
            </p>
          </Field>
        </FieldGroup>
      ) : null}
    </StepItem>
  );
}

/** One checkbox row, the shape every list in the three new steps below shares. */
function ToggleRow({
  id,
  checked,
  onToggle,
  title,
  description,
  mono,
}: {
  id: string;
  checked: boolean;
  onToggle: () => void;
  title: string;
  description?: string;
  /** Set for a tool's own name, which is an identifier rather than prose. */
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        id={id}
        onCheckedChange={onToggle}
      />
      <label className="flex-1 cursor-pointer" htmlFor={id}>
        <span className={`block text-sm ${mono ? "font-mono text-xs" : ""}`}>
          {title}
        </span>
        {description ? (
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </label>
    </div>
  );
}

function PluginsStep({
  catalogue,
  servers,
  selected,
  onToggle,
}: {
  catalogue: CatalogueItem[];
  servers: PluginServer[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const installed = new Set(servers.map((server) => server.id));
  const available = catalogue.filter((entry) => !installed.has(entry.key));

  return (
    <StepItem name="plugins">
      <QuestionnaireTitle>Which plugins should be active?</QuestionnaireTitle>
      <QuestionnaireDescription>
        Optional. Add deployment plugins here first; the next step lets this
        coworker hold individual tools from the plugins that expose them.
      </QuestionnaireDescription>
      {available.length === 0 ? (
        <Empty className="mt-4 h-[120px] border border-dashed">
          <EmptyHeader>
            <EmptyTitle className="text-muted-foreground">
              Every catalogue plugin is already active.
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {available.map((entry) => (
            <button
              className={`rounded-lg border p-3 text-left transition-colors ${
                selected.has(entry.key)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
              key={entry.key}
              onClick={() => onToggle(entry.key)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{entry.title}</p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {entry.summary}
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
                  {entry.auth === "user-oauth"
                    ? "OAuth"
                    : entry.auth === "deployment-bearer"
                      ? "Key"
                      : entry.auth === "builtin"
                        ? "Built-in"
                        : "No auth"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </StepItem>
  );
}

function SkillsStep({
  skills,
  catalogue,
  userId,
  selected,
  onToggle,
}: {
  skills: PluginSkill[];
  catalogue: SkillCatalogueItem[];
  userId: string | undefined;
  selected: ReadonlySet<string>;
  onToggle: (slug: string) => void;
}) {
  // Yours, plus the deployment's own: both are things this coworker could carry away from this
  // step, and only an administrator writes the second kind, so nothing here can create one.
  const existing = skills.filter(
    (skill) => skill.ownerUserId === null || skill.ownerUserId === userId,
  );
  const existingSlugs = new Set(existing.map((skill) => skill.slug));
  const discoverable = catalogue.filter(
    (entry) => !existingSlugs.has(entry.key),
  );

  return (
    <StepItem name="skills">
      <QuestionnaireTitle>Which skills does it carry?</QuestionnaireTitle>
      <QuestionnaireDescription>
        Optional. A skill is an instruction, invoked with <code>/</code>; this
        coworker only carries the ones ticked here, and more can be added later
        from its own page.
      </QuestionnaireDescription>
      {existing.length === 0 && discoverable.length === 0 ? (
        <Empty className="mt-4 h-[120px] border border-dashed">
          <EmptyHeader>
            <EmptyTitle className="text-muted-foreground">
              No skills exist yet. Write one from{" "}
              <span className="font-mono text-xs">/skills</span> after this
              coworker is created.
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-2 divide-y divide-border">
          {existing.map((skill) => (
            <ToggleRow
              checked={selected.has(skill.slug)}
              description={skill.summary || `/${skill.slug}`}
              id={`create-agent-skill-${skill.slug}`}
              key={skill.slug}
              onToggle={() => onToggle(skill.slug)}
              title={skill.title}
            />
          ))}
          {discoverable.map((entry) => (
            <ToggleRow
              checked={selected.has(entry.key)}
              description={entry.summary}
              id={`create-agent-skill-${entry.key}`}
              key={entry.key}
              onToggle={() => onToggle(entry.key)}
              title={`${entry.title} · Discover`}
            />
          ))}
        </div>
      )}
    </StepItem>
  );
}

function ToolsStep({
  servers,
  selected,
  onToggle,
}: {
  servers: PluginServer[];
  selected: ReadonlySet<string>;
  onToggle: (ref: string) => void;
}) {
  const withTools = servers.filter((server) => server.tools.length > 0);

  return (
    <StepItem name="tools">
      <QuestionnaireTitle>Which tools can it call?</QuestionnaireTitle>
      <QuestionnaireDescription>
        Optional. From the plugins this deployment already holds. Every call is
        still decided, policy-checked and audited when it happens — this only
        says which tools this coworker may be offered at all.
      </QuestionnaireDescription>
      {withTools.length === 0 ? (
        <Empty className="mt-4 h-[120px] border border-dashed">
          <EmptyHeader>
            <EmptyTitle className="text-muted-foreground">
              No callable tools are installed yet.
            </EmptyTitle>
            <p className="max-w-md text-muted-foreground text-sm">
              Add plugins from <span className="font-mono">/admin/plugins</span>
              , then reopen this step to choose exactly which tools this
              coworker may use.
            </p>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          {withTools.map((server) => (
            <div key={server.id}>
              <p className="text-xs font-medium text-muted-foreground">
                {server.title}
              </p>
              <div className="divide-y divide-border">
                {server.tools.map((tool) => (
                  <ToggleRow
                    checked={selected.has(tool.ref)}
                    description={tool.description}
                    id={`create-agent-tool-${tool.ref}`}
                    key={tool.ref}
                    mono
                    onToggle={() => onToggle(tool.ref)}
                    title={tool.name}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </StepItem>
  );
}

function RoutineStep({
  task,
  onTaskChange,
  schedule,
  onScheduleChange,
  customCron,
  onCustomCronChange,
  timezone,
  onTimezoneChange,
}: {
  task: string;
  onTaskChange: (value: string) => void;
  schedule: ScheduleValue;
  onScheduleChange: (value: ScheduleValue) => void;
  customCron: string;
  onCustomCronChange: (value: string) => void;
  timezone: string;
  onTimezoneChange: (value: string) => void;
}) {
  return (
    <StepItem name="routine">
      <QuestionnaireTitle>Should it run on a schedule?</QuestionnaireTitle>
      <QuestionnaireDescription>
        Optional. Fill the task and frequency here; Finish opens a channel with
        this coworker so it can create the routine visibly.
      </QuestionnaireDescription>
      <FieldGroup className="grid gap-4">
        <Field>
          <FieldLabel htmlFor="create-agent-routine-task">
            Task to do
          </FieldLabel>
          <Textarea
            id="create-agent-routine-task"
            onChange={(event) => onTaskChange(event.target.value)}
            placeholder="Check for pending expense reports older than 3 days and post a summary."
            rows={4}
            value={task}
          />
          <FieldDescription>
            Leave this blank to skip — you can always ask for a routine later,
            in any channel with this coworker.
          </FieldDescription>
        </Field>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field>
            <FieldLabel>Frequency</FieldLabel>
            <Select
              onValueChange={(value) =>
                onScheduleChange(value as ScheduleValue)
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
          </Field>
          <Field>
            <FieldLabel htmlFor="create-agent-routine-timezone">
              Timezone
            </FieldLabel>
            <Input
              id="create-agent-routine-timezone"
              onChange={(event) => onTimezoneChange(event.target.value)}
              value={timezone}
            />
          </Field>
        </div>
        {schedule === "custom" ? (
          <Field>
            <FieldLabel htmlFor="create-agent-routine-cron">
              Custom cron
            </FieldLabel>
            <Input
              id="create-agent-routine-cron"
              onChange={(event) => onCustomCronChange(event.target.value)}
              placeholder="0 14 * * *"
              value={customCron}
            />
            <FieldDescription>
              Five-field cron. Example:{" "}
              <span className="font-mono">0 14 * * *</span>.
            </FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>
    </StepItem>
  );
}
