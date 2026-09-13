import {
  IconAdjustments,
  IconArrowUpRight,
  IconArrowsExchange,
  IconClock,
  IconPencil,
  IconPlugConnected,
  IconPuzzle,
  IconRefresh,
  IconUser,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ZodType } from "zod";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { CallbackTokenPanel } from "@/components/agents/callback-token-panel";
import { HandoffPanel } from "@/components/agents/handoff-panel";
import { RoutinesList } from "@/components/routines/routines-list";
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
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type AgentFormValues,
  agentFormSchema,
  agentInputFrom,
} from "@/lib/agents/form";
import {
  deleteAgentMutationOptions,
  duplicateAgentMutationOptions,
  setAgentHiddenMutationOptions,
  updateAgentMutationOptions,
} from "@/lib/agents/mutations";
import {
  type AgentModelConfig,
  type AgentProfile,
  agentQueryOptions,
} from "@/lib/agents/queries";
import {
  addCuratedServerMutationOptions,
  connectAccountMutationOptions,
  setPluginGrantMutationOptions,
} from "@/lib/plugins/mutations";
import {
  agentPluginsQueryOptions,
  connectionsQueryOptions,
  type PluginServer,
  pluginsPageQueryOptions,
} from "@/lib/plugins/queries";
import { readToolName } from "@/lib/plugins/tool-name";

/**
 * A coworker, in a dialog with its own sidebar.
 *
 * The agents screen used to slide this in as a side panel; a profile carries enough distinct
 * concerns — who it is, where it runs, what it may hand work to, and what can be done to it — that
 * a single scrolling column buried the later ones. Each concern is a section here, and the sidebar
 * is the map.
 */
export function AgentDialog({
  agentId,
  open,
  onClose,
}: {
  /** Which coworker to show. Null renders nothing but keeps the dialog mounted for its exit. */
  agentId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      {/* p-0/overflow-hidden hands the popup's rounding to the sidebar; wider than the default
          dialog because it holds a two-pane layout, which is the stated reason to deviate. */}
      {/* Tall enough that General's rows and its Delete sit on screen together; the popup's own
          max-h-[85svh] still caps it on a short display, where the main pane scrolls. */}
      <DialogContent className="overflow-hidden p-0 md:max-h-[680px] md:max-w-[700px] lg:max-w-[800px]">
        {/* Keyed by coworker so the section and edit state never carry over from another one. */}
        {agentId ? (
          <AgentManagementPanel agentId={agentId} key={agentId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const SECTIONS = [
  { id: "general", name: "General", icon: IconUser },
  { id: "access", name: "Access", icon: IconPuzzle },
  { id: "connection", name: "Connection", icon: IconPlugConnected },
  { id: "handoff", name: "Handoff", icon: IconArrowsExchange },
  { id: "routines", name: "Routines", icon: IconClock },
  { id: "manage", name: "Manage", icon: IconAdjustments },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AgentManagementPanel({
  agentId,
  page = false,
}: {
  agentId: string;
  page?: boolean;
}) {
  const [section, setSection] = useState<SectionId>("general");
  const agent = useQuery(agentQueryOptions(agentId));

  if (agent.isPending) {
    return (
      <div className="flex h-[640px] max-h-[80svh] flex-col gap-4 p-6">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (agent.error || !agent.data) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        Could not load this coworker.
      </p>
    );
  }
  const profile = agent.data;
  const active = SECTIONS.find((candidate) => candidate.id === section);

  return (
    <>
      {page ? null : (
        <DialogTitle className="sr-only">{profile.name}</DialogTitle>
      )}
      {/* min-h-full overrides the provider's own min-h-svh, which is sized for a page. */}
      <SidebarProvider
        className={
          page
            ? "h-[calc(100svh-210px)] min-h-[520px] min-w-0 items-start"
            : "min-h-full items-start"
        }
      >
        <Sidebar className="hidden md:flex" collapsible="none">
          {/* Who this dialog is about, said once here rather than repeated per section. */}
          <SidebarHeader className="flex-row items-center gap-3 p-4">
            <AbstractAvatar
              name={profile.name}
              seed={profile.avatarSeed}
              size={36}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {profile.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {profile.title}
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent className="mt-2">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-px">
                  {SECTIONS.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={item.id === section}
                        onClick={() => setSection(item.id)}
                      >
                        <item.icon />
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main
          className={
            page
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "flex h-[640px] max-h-[80svh] flex-1 flex-col overflow-hidden"
          }
        >
          {/*
           * The sidebar hides below md, and without this strip that left the sections unreachable
           * on a phone: the dialog opened on General and nothing could leave it. A scrollable row
           * of the same sections, shown only where the sidebar is not. The identity the sidebar
           * header carries rides along, with room kept for the popup's close button.
           */}
          <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3 pr-12 md:hidden">
            <div className="flex items-center gap-2">
              <AbstractAvatar
                name={profile.name}
                seed={profile.avatarSeed}
                size={28}
              />
              <span className="truncate text-sm font-medium">
                {profile.name}
              </span>
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {SECTIONS.map((item) => (
                <Button
                  className="shrink-0"
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  size="sm"
                  variant={item.id === section ? "secondary" : "ghost"}
                >
                  <item.icon />
                  {item.name}
                </Button>
              ))}
            </div>
          </div>
          <header className="flex h-14 shrink-0 items-center gap-2 px-6">
            <h2 className="text-sm font-medium">{active?.name}</h2>
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
            {section === "general" ? (
              <GeneralSection agentId={agentId} profile={profile} />
            ) : section === "access" ? (
              <AccessSection agentId={agentId} profile={profile} />
            ) : section === "connection" ? (
              <ConnectionSection agentId={agentId} profile={profile} />
            ) : section === "handoff" ? (
              <HandoffPanel agentId={agentId} />
            ) : section === "routines" ? (
              <RoutinesList agentId={agentId} embedded />
            ) : (
              <ManageSection agentId={agentId} profile={profile} />
            )}
          </div>
        </main>
      </SidebarProvider>
    </>
  );
}

function GeneralSection({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const updateAgent = useMutation(updateAgentMutationOptions(queryClient));

  /*
   * One field at a time, over the whole update endpoint: the API takes the full profile, so the
   * unchanged fields ride along as they are on screen. The empty key means "keep the current one".
   */
  const save = (patch: Partial<AgentFormValues>) =>
    updateAgent.mutateAsync({
      agentId,
      input: {
        ...agentInputFrom({
          name: profile.name,
          title: profile.title,
          roleDescription: profile.roleDescription,
          description: profile.description || profile.roleDescription,
          instructions: profile.instructions || profile.roleDescription,
          visibility: profile.visibility,
          endpoint: profile.endpoint ?? "",
          authValue: "",
          ...patch,
        }),
        avatarSeed: profile.avatarSeed,
      },
    });

  const saveAvatar = () =>
    updateAgent.mutateAsync({
      agentId,
      input: {
        ...agentInputFrom({
          name: profile.name,
          title: profile.title,
          roleDescription: profile.roleDescription,
          description: profile.description || profile.roleDescription,
          instructions: profile.instructions || profile.roleDescription,
          visibility: profile.visibility,
          endpoint: profile.endpoint ?? "",
          authValue: "",
        }),
        avatarSeed: `avatar-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      },
    });

  const saveModel = (model: AgentModelConfig | null) =>
    updateAgent.mutateAsync({
      agentId,
      input: {
        ...agentInputFrom({
          name: profile.name,
          title: profile.title,
          roleDescription: profile.roleDescription,
          description: profile.description || profile.roleDescription,
          instructions: profile.instructions || profile.roleDescription,
          visibility: profile.visibility,
          endpoint: profile.endpoint ?? "",
          authValue: "",
        }),
        avatarSeed: profile.avatarSeed,
        model,
      },
    });

  return (
    <>
      {/* Each stands on its own — muted, not bg-card, which is invisible against a popup — and
          each edits in place: the field somebody wants to change is the only one that opens. */}
      <div className="flex flex-col gap-2">
        <AvatarItem
          canManage={profile.canManage}
          name={profile.name}
          onSave={saveAvatar}
          seed={profile.avatarSeed}
        />
        <ModelItem
          canManage={profile.canManage}
          model={profile.model}
          onSave={saveModel}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Name"
          onSave={(name) => save({ name })}
          schema={agentFormSchema.shape.name}
          value={profile.name}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Title"
          onSave={(title) => save({ title })}
          schema={agentFormSchema.shape.title}
          value={profile.title}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Description"
          multiline
          onSave={(description) => save({ description })}
          schema={agentFormSchema.shape.description}
          value={profile.description || profile.roleDescription}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Instructions"
          multiline
          onSave={(instructions) =>
            save({ instructions, roleDescription: instructions })
          }
          schema={agentFormSchema.shape.instructions}
          value={profile.instructions || profile.roleDescription}
        />
        <VisibilityItem
          canManage={profile.canManage}
          onSave={(visibility) => save({ visibility })}
          value={profile.visibility}
        />
        {profile.systemOwned ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>System owned</ItemTitle>
              <ItemDescription>
                Ships with this deployment rather than belonging to a person.
              </ItemDescription>
            </ItemContent>
          </Item>
        ) : null}
      </div>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Start channel</ItemTitle>
          <ItemDescription>
            Open a new channel with this coworker.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            onClick={() =>
              void navigate({
                search: { agent: agentId },
                to: "/channel/new",
              })
            }
            size="sm"
          >
            Start
          </Button>
        </ItemActions>
      </Item>
    </>
  );
}

function AvatarItem({
  name,
  seed,
  canManage,
  onSave,
}: {
  name: string;
  seed: string;
  canManage: boolean;
  onSave: () => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>Photo</ItemTitle>
        <ItemDescription>
          Generated avatar shown in the roster and channels.
        </ItemDescription>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </ItemContent>
      <ItemActions>
        <AbstractAvatar name={name} seed={seed} size={40} />
        {canManage ? (
          <Button
            disabled={saving}
            onClick={async () => {
              setError(null);
              setSaving(true);
              try {
                await onSave();
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Could not save.",
                );
              } finally {
                setSaving(false);
              }
            }}
            size="sm"
            variant="outline"
          >
            <IconRefresh />
            {saving ? "Changing…" : "Change"}
          </Button>
        ) : null}
      </ItemActions>
    </Item>
  );
}

const MODEL_PROVIDER_OPTIONS = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google_genai", label: "Google" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "groq", label: "Groq" },
  { value: "mistralai", label: "Mistral" },
  { value: "xai", label: "xAI" },
  { value: "together", label: "Together" },
] as const;

function modelProviderLabel(provider: string): string {
  return (
    MODEL_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ??
    connectorName(provider)
  );
}

function ModelItem({
  model,
  canManage,
  onSave,
}: {
  model: AgentModelConfig | null;
  canManage: boolean;
  onSave: (model: AgentModelConfig | null) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState(model?.provider ?? "default");
  const [name, setName] = useState(model?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = model
    ? `${modelProviderLabel(model.provider)} · ${model.name}`
    : "Deployment default";

  const resetDraft = () => {
    setProvider(model?.provider ?? "default");
    setName(model?.name ?? "");
    setError(null);
  };

  const submit = async () => {
    const next =
      provider === "default" ? null : { provider, name: name.trim() };
    if (next && !next.name) {
      setError("Enter a model name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Model</ItemTitle>
          <ItemDescription>
            Runtime model used by the managed LangGraph Bot.
          </ItemDescription>
        </ItemContent>
        <ItemActions className="min-w-0">
          <span className="truncate text-right text-sm text-muted-foreground">
            {current}
          </span>
          {canManage ? (
            <Button
              aria-label="Edit model"
              onClick={() => {
                resetDraft();
                setEditing(true);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <IconPencil />
            </Button>
          ) : null}
        </ItemActions>
      </Item>
    );
  }

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>Model</ItemTitle>
        <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
          <Select
            items={{
              default: "Default",
              ...Object.fromEntries(
                MODEL_PROVIDER_OPTIONS.map((option) => [
                  option.value,
                  option.label,
                ]),
              ),
            }}
            onValueChange={(next) => next && setProvider(next)}
            value={provider}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              {MODEL_PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            disabled={provider === "default"}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={
              provider === "openrouter" ? "openai/gpt-4o-mini" : "Model name"
            }
            value={provider === "default" ? "" : name}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex gap-2">
          <Button disabled={saving} onClick={() => void submit()} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              resetDraft();
              setEditing(false);
            }}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </ItemContent>
    </Item>
  );
}

/**
 * One fact about the coworker, edited in place.
 *
 * Only the field somebody wants to change opens: Edit swaps this item — and this item alone — for
 * its input, validated against the same limits the server enforces, and Save writes just it back.
 */
function EditableTextItem({
  label,
  value,
  canManage,
  multiline = false,
  schema,
  onSave,
}: {
  label: string;
  value: string;
  canManage: boolean;
  /** A textarea rather than an input, for the field that is a paragraph. */
  multiline?: boolean;
  /** The field's slice of the shared form contract, so errors match the server's limits. */
  schema: ZodType<string>;
  onSave: (draft: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEditing(false);
    setError(null);
  };
  const submit = async () => {
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That value does not fit.");
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>{label}</ItemTitle>
        </ItemContent>
        <ItemActions className="min-w-0">
          <span
            className={`text-right text-sm text-muted-foreground ${
              multiline ? "line-clamp-2 whitespace-pre-wrap" : "truncate"
            }`}
          >
            {value}
          </span>
          {canManage ? (
            <Button
              aria-label={`Edit ${label.toLowerCase()}`}
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <IconPencil />
            </Button>
          ) : null}
        </ItemActions>
      </Item>
    );
  }

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        {multiline ? (
          <Textarea
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            value={draft}
          />
        ) : (
          <Input
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            value={draft}
          />
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex gap-2">
          <Button disabled={saving} onClick={() => void submit()} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button disabled={saving} onClick={close} size="sm" variant="outline">
            Cancel
          </Button>
        </div>
      </ItemContent>
    </Item>
  );
}

/**
 * Visibility is two named choices, so it edits as a select that writes on pick — no open state and
 * no Save, because there is no draft worth holding: the pick is the whole of the change.
 */
function VisibilityItem({
  value,
  canManage,
  onSave,
}: {
  value: AgentProfile["visibility"];
  canManage: boolean;
  onSave: (visibility: AgentProfile["visibility"]) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>Visibility</ItemTitle>
        <ItemDescription>
          {value === "private"
            ? "Only you can see it and start channels with it."
            : "Everyone in the deployment can find and use it."}
        </ItemDescription>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </ItemContent>
      <ItemActions>
        {canManage ? (
          <Select
            disabled={saving}
            // The label map, so the closed trigger says "Private" rather than the raw value.
            items={{ private: "Private", public: "Public" }}
            onValueChange={async (next) => {
              if (next === value) return;
              setError(null);
              setSaving(true);
              try {
                await onSave(next as AgentProfile["visibility"]);
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Could not save.",
                );
              } finally {
                setSaving(false);
              }
            }}
            value={value}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {value === "private" ? "Private" : "Public"}
          </span>
        )}
      </ItemActions>
    </Item>
  );
}

/** "google-drive" as "Google Drive": the connector key, said the way a person would. */
function connectorName(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * What this coworker may reach when it works.
 *
 * The Plugins screens still decide what is installed deployment-wide; this tab decides which of
 * those installed tools and skills this one Bot may hold. Calls are still checked on the server.
 */
function AccessSection({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const queryClient = useQueryClient();
  const page = useQuery(pluginsPageQueryOptions());
  const runtime = useQuery(agentPluginsQueryOptions(agentId));
  const setGrant = useMutation(setPluginGrantMutationOptions(queryClient));
  const addCurated = useMutation(addCuratedServerMutationOptions(queryClient));
  const [error, setError] = useState<string | null>(null);

  if (page.isPending || runtime.isPending) return null;
  if (page.error || runtime.error || !page.data || !runtime.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        What this coworker may reach could not be loaded.
      </p>
    );
  }

  const servers = page.data.servers.filter(
    (server) => server.tools.length > 0 || server.withdrawn.length > 0,
  );
  const hasRoutines = page.data.servers.some(
    (server) => server.id === "routines",
  );
  const routinesCatalogue = page.data.catalogue.find(
    (entry) => entry.key === "routines",
  );
  const grantedRuntimeRefs = new Set(
    runtime.data.tools.map((tool) => tool.ref),
  );

  if (servers.length === 0 && page.data.skills.length === 0) {
    return (
      <Empty className="h-[180px] border border-dashed">
        <EmptyHeader>
          <EmptyTitle className="text-muted-foreground">
            Nothing available yet
          </EmptyTitle>
          <EmptyDescription>
            Add plugins or skills first, then grant the tools this coworker
            should be allowed to use.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Choose the installed tools and skills this coworker can use. A tool
        still needs your connected account when the vendor asks for OAuth.
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {!hasRoutines && routinesCatalogue ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>{routinesCatalogue.title}</ItemTitle>
              <ItemDescription>
                Add the built-in scheduling tools so this coworker can create,
                list, update and delete routines.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                disabled={!profile.canManage || addCurated.isPending}
                onClick={() => {
                  setError(null);
                  addCurated.mutate(
                    { key: "routines" },
                    {
                      onError: (failure) =>
                        setError(
                          failure instanceof Error
                            ? failure.message
                            : "Routines could not be added.",
                        ),
                    },
                  );
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {addCurated.isPending ? "Adding…" : "Add Routines"}
              </Button>
            </ItemActions>
          </Item>
        ) : null}
        {servers.map((server) => (
          <PluginServerAccess
            agentId={agentId}
            canManage={profile.canManage}
            grantedRuntimeRefs={grantedRuntimeRefs}
            key={server.id}
            onError={setError}
            server={server}
            setGrant={setGrant}
          />
        ))}
        {page.data.skills.map((skill) => (
          <Item key={skill.slug} variant="muted">
            <ItemContent>
              <ItemTitle>{skill.title}</ItemTitle>
              <ItemDescription>{skill.summary}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={`Let ${profile.name} use ${skill.title}`}
                checked={skill.grantedTo.includes(agentId)}
                disabled={
                  !profile.canManage ||
                  (setGrant.isPending &&
                    setGrant.variables?.kind === "skill" &&
                    setGrant.variables.ref === skill.slug)
                }
                onCheckedChange={(next) => {
                  setError(null);
                  setGrant.mutate(
                    {
                      agentId,
                      granted: next,
                      kind: "skill",
                      ref: skill.slug,
                    },
                    {
                      onError: (failure) =>
                        setError(
                          failure instanceof Error
                            ? failure.message
                            : "That skill could not be changed.",
                        ),
                    },
                  );
                }}
              />
            </ItemActions>
          </Item>
        ))}
      </div>
    </>
  );
}

function PluginServerAccess({
  agentId,
  server,
  canManage,
  grantedRuntimeRefs,
  setGrant,
  onError,
}: {
  agentId: string;
  server: PluginServer;
  canManage: boolean;
  grantedRuntimeRefs: Set<string>;
  setGrant: ReturnType<
    typeof useMutation<
      unknown,
      Error,
      {
        kind: "mcp" | "skill";
        ref: string;
        agentId: string;
        granted: boolean;
      }
    >
  >;
  onError: (message: string | null) => void;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{server.title}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {server.summary}
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {
            server.tools.filter((tool) => tool.grantedTo.includes(agentId))
              .length
          }
          /{server.tools.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {server.tools.map((tool) => {
          const toolName = readToolName(tool.name).label;
          const granted = tool.grantedTo.includes(agentId);
          const offered = grantedRuntimeRefs.has(tool.ref);
          return (
            <Item key={tool.ref} variant="muted">
              <ItemContent>
                <ItemTitle>{toolName}</ItemTitle>
                <ItemDescription>
                  {tool.description || `${connectorName(server.id)} tool.`}
                  {granted && !offered
                    ? " Granted, but not currently offered by the runtime."
                    : ""}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <span className="text-xs text-muted-foreground">
                  {tool.effect === "read" ? "Read" : "Write"}
                </span>
                <Switch
                  aria-label={`Let this coworker call ${toolName}`}
                  checked={granted}
                  disabled={
                    !canManage ||
                    (setGrant.isPending &&
                      setGrant.variables?.kind === "mcp" &&
                      setGrant.variables.ref === tool.ref)
                  }
                  onCheckedChange={(next) => {
                    onError(null);
                    setGrant.mutate(
                      {
                        agentId,
                        granted: next,
                        kind: "mcp",
                        ref: tool.ref,
                      },
                      {
                        onError: (failure) =>
                          onError(
                            failure instanceof Error
                              ? failure.message
                              : "That tool could not be changed.",
                          ),
                      },
                    );
                  }}
                />
              </ItemActions>
            </Item>
          );
        })}
      </div>
    </section>
  );
}

function ConnectionSection({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const queryClient = useQueryClient();
  const updateAgent = useMutation(updateAgentMutationOptions(queryClient));
  const saveConnection = (patch: Partial<AgentFormValues>) =>
    updateAgent.mutateAsync({
      agentId,
      input: {
        ...agentInputFrom({
          name: profile.name,
          title: profile.title,
          roleDescription: profile.roleDescription,
          description: profile.description || profile.roleDescription,
          instructions: profile.instructions || profile.roleDescription,
          visibility: profile.visibility,
          endpoint: profile.endpoint ?? "",
          authValue: "",
          ...patch,
        }),
        avatarSeed: profile.avatarSeed,
      },
    });

  /*
   * A built-in coworker is done the moment it exists: it runs on the deployment's own Bot, whose
   * process already holds the deployment's tool credential, so its tool calls authenticate with no
   * setup. Showing it the endpoint and the callback-token panel told the person the opposite —
   * an internal address they never typed, and a credential they were never supposed to need.
   */
  if (!profile.endpoint || profile.builtIn) {
    return (
      <>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>Runtime</ItemTitle>
            <ItemDescription>
              Runs on this deployment's own Bot. Its tool calls are covered by
              the deployment credential.
            </ItemDescription>
          </ItemContent>
        </Item>
        <ConnectedAccounts />
      </>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <EditableTextItem
          canManage={profile.canManage}
          label="Endpoint"
          onSave={(endpoint) => saveConnection({ endpoint })}
          schema={agentFormSchema.shape.endpoint}
          value={profile.endpoint}
        />
        <AuthKeyItem
          canManage={profile.canManage}
          hasAuth={profile.hasAuth}
          onSave={(authValue) => saveConnection({ authValue })}
        />
      </div>
      {profile.canManage ? (
        <CallbackTokenPanel
          agentId={agentId}
          hasToken={profile.hasCallbackToken}
        />
      ) : null}
      <ConnectedAccounts />
    </>
  );
}

function AuthKeyItem({
  canManage,
  hasAuth,
  onSave,
}: {
  canManage: boolean;
  hasAuth: boolean;
  onSave: (authValue: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Authorization key</ItemTitle>
          <ItemDescription>
            {hasAuth
              ? "A key is configured. Paste a new one to replace it."
              : "No key configured for this endpoint."}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <span className="text-sm text-muted-foreground">
            {hasAuth ? "Configured" : "None"}
          </span>
          {canManage ? (
            <Button
              aria-label="Edit authorization key"
              onClick={() => {
                setDraft("");
                setError(null);
                setEditing(true);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <IconPencil />
            </Button>
          ) : null}
        </ItemActions>
      </Item>
    );
  }

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>Authorization key</ItemTitle>
        <Input
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void (async () => {
                if (!draft.trim()) return;
                setSaving(true);
                setError(null);
                try {
                  await onSave(draft);
                  setEditing(false);
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Could not save.",
                  );
                } finally {
                  setSaving(false);
                }
              })();
            }
          }}
          placeholder="Bearer ..."
          type="password"
          value={draft}
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex gap-2">
          <Button
            disabled={saving || !draft.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSave(draft);
                setEditing(false);
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Could not save.",
                );
              } finally {
                setSaving(false);
              }
            }}
            size="sm"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            disabled={saving}
            onClick={() => setEditing(false)}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </ItemContent>
    </Item>
  );
}

function ConnectedAccounts() {
  const page = useQuery(pluginsPageQueryOptions());
  const connections = useQuery(connectionsQueryOptions());
  const connect = useMutation({
    ...connectAccountMutationOptions("admin"),
    onSuccess: (authorizationUrl) => {
      window.location.assign(authorizationUrl);
    },
  });
  const [error, setError] = useState<string | null>(null);

  if (page.isPending || connections.isPending) return null;
  if (page.error || connections.error || !page.data || !connections.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Connected accounts could not be loaded.
      </p>
    );
  }

  const authByKey = new Map(
    page.data.catalogue.map((entry) => [entry.key, entry.auth] as const),
  );
  const oauthServers = page.data.servers.filter(
    (server) => authByKey.get(server.id) === "user-oauth",
  );
  const connected = new Set(
    connections.data.connections.map((connection) => connection.serverId),
  );

  if (oauthServers.length === 0) return null;

  return (
    <section className="grid gap-2">
      <div>
        <h3 className="text-sm font-medium">Your connected accounts</h3>
        <p className="text-xs text-muted-foreground">
          Used when this coworker calls granted tools as you.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {oauthServers.map((server) => {
          const isConnected = connected.has(server.id);
          const canConnect = server.hasCredential || server.dynamicClient;
          return (
            <Item key={server.id} variant="muted">
              <ItemContent>
                <ItemTitle>{server.title}</ItemTitle>
                <ItemDescription>
                  {isConnected
                    ? "Connected for your account."
                    : canConnect
                      ? "Connect your own account with the vendor."
                      : "An administrator must finish OAuth setup first."}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {isConnected ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-emerald-500"
                    />
                    <span className="text-xs text-muted-foreground">
                      Connected
                    </span>
                  </>
                ) : (
                  <Button
                    disabled={!canConnect || connect.isPending}
                    onClick={() => {
                      setError(null);
                      connect.mutate(server.id, {
                        onError: (failure) =>
                          setError(
                            failure instanceof Error
                              ? failure.message
                              : "That account could not be connected.",
                          ),
                      });
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Connect
                    <IconArrowUpRight />
                  </Button>
                )}
              </ItemActions>
            </Item>
          );
        })}
      </div>
    </section>
  );
}

function ManageSection({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const setHidden = useMutation(setAgentHiddenMutationOptions(queryClient));
  const duplicateAgent = useMutation(
    duplicateAgentMutationOptions(queryClient),
  );
  const deleteAgent = useMutation(deleteAgentMutationOptions(queryClient));
  const actionError = setHidden.error ?? duplicateAgent.error;

  return (
    <>
      {/* The same gap the General items keep, so the two screens read as one list style. */}
      <div className="flex flex-col gap-2">
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>{profile.hidden ? "Hidden" : "Hide"}</ItemTitle>
            <ItemDescription>
              {profile.hidden
                ? "Hidden from your agents list. This changes nothing for anyone else."
                : "Take it off your agents list. This changes nothing for anyone else."}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              disabled={setHidden.isPending}
              onClick={async () => {
                await setHidden.mutateAsync({
                  agentId,
                  hidden: !profile.hidden,
                });
                if (!profile.hidden)
                  await navigate({ search: {}, to: "/agents" });
              }}
              size="sm"
              variant="outline"
            >
              {setHidden.isPending
                ? profile.hidden
                  ? "Unhiding…"
                  : "Hiding…"
                : profile.hidden
                  ? "Unhide"
                  : "Hide"}
            </Button>
          </ItemActions>
        </Item>

        <Item variant="muted">
          <ItemContent>
            <ItemTitle>Duplicate</ItemTitle>
            <ItemDescription>
              A copy of your own, with no key and no channels.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              disabled={duplicateAgent.isPending}
              onClick={async () => {
                const copy = await duplicateAgent.mutateAsync(agentId);
                await navigate({ search: { agent: copy.id }, to: "/agents" });
              }}
              size="sm"
              variant="outline"
            >
              {duplicateAgent.isPending ? "Duplicating…" : "Duplicate"}
            </Button>
          </ItemActions>
        </Item>

        {profile.canManage ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>Delete</ItemTitle>
              <ItemDescription>This cannot be undone.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                onClick={() => setConfirmingDelete(true)}
                size="sm"
                variant="destructive"
              >
                Delete
              </Button>
            </ItemActions>
          </Item>
        ) : null}
      </div>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError.message}
        </p>
      ) : null}

      {/* Stacked over the agent dialog: destroying something deserves its own moment, and the
          question keeps the name in it so the wrong tab cannot delete the wrong coworker. */}
      <Dialog
        onOpenChange={(next) => !next && setConfirmingDelete(false)}
        open={confirmingDelete}
      >
        <DialogContent
          className="max-w-sm"
          overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-sm"
        >
          <DialogHeader>
            <DialogTitle>Delete {profile.name}?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteAgent.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {deleteAgent.error.message}
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              onClick={() => setConfirmingDelete(false)}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteAgent.isPending}
              onClick={async () => {
                await deleteAgent.mutateAsync(agentId);
                await navigate({ search: {}, to: "/agents" });
              }}
              size="sm"
              variant="destructive"
            >
              {deleteAgent.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
