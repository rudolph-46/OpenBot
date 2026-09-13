/**
 * The catalogue of MCP servers this deployment will talk to, and the rule that decides admissibility.
 *
 * First-party only, and the list is frozen in code. A remote MCP server is a piece of somebody
 * else's software that our Bots hand credentials to and take instructions from, so "which servers"
 * is a decision to make once, in review, rather than one to leave to whoever is typing a URL into an
 * admin page at the time. Only servers the vendor themselves maintains are here. A community server
 * that wraps the same API is not equivalent: it is an extra party in the trust path with none of the
 * accountability, and the answer for a vendor without an official server is to wait for one.
 *
 * Every host and path here comes from the vendor's published documentation. They are pinned rather
 * than discovered, because a URL this deployment will hand a credential to is a reviewed source
 * contract.
 *
 * Admissibility is fail-closed and checked against the pinned host, never against what a caller
 * supplied. A URL that does not exactly match a pinned host, or match one anchored per-instance
 * pattern, is refused. This is the control that stops "add an MCP server" from being a request
 * forgery primitive pointed at the deployment's own network.
 */

/**
 * How a server is authenticated, and whose credential does it.
 *
 * The OAuth addresses are pinned here beside the MCP host, for the same reason and with the same
 * rule: they come from the vendor's published documentation and are never taken from a caller.
 * These are where this deployment sends a person's authorization code and receives the refresh
 * token that stands in for their access, so they are a reviewed source contract too.
 */
// The one place browsing and this check agree on: the addresses that hold the deployment's own
// cloud credentials. `target.ts` imports nothing itself, so asking it here adds no dependency.
import { isNeverAllowedHostname } from "../computer/target";
// Type-only, so naming the transport here creates no import cycle with the registry that resolves it.
import type { TransportKind } from "./transport";

export type CatalogueAuth =
  /** Answers without any credential at all. */
  | { kind: "none" }
  /** One token, held by the deployment, used for everybody. */
  | { kind: "deployment-bearer" }
  /**
   * First-party and in-process. There is no credential, because there is nothing to authenticate
   * to: the call runs against this deployment's own tables, as the person whose turn it is.
   */
  | { kind: "builtin" }
  /**
   * The asker's own grant. The deployment registers an OAuth client; each person consents once and
   * the call runs on their token, so the vendor decides what comes back.
   */
  | {
      kind: "user-oauth";
      authorizationUrl: string;
      tokenUrl: string;
      /** Where a disconnect is sent, so revocation happens at the vendor and not just here. */
      revokeUrl: string;
      /**
       * What to ask a person to consent to. Narrow on purpose: a scope granted by everybody who
       * connects and used by nothing is a permission nobody remembers agreeing to. Empty for a
       * vendor whose consent screen itself is the scoping (Notion), where scope strings would
       * assert a control that does not exist.
       */
      scopes: readonly string[];
      /**
       * How the deployment gets its OAuth client. Absent means an administrator registers one at
       * the vendor and pastes it in. `dynamic` means the deployment registers ITSELF (RFC 7591)
       * on first connect — no admin step, no client secret; PKCE carries the proof instead.
       */
      clientRegistration?: "dynamic";
      /** The RFC 7591 endpoint. Pinned https, required when `clientRegistration` is `dynamic`. */
      registrationUrl?: string;
      /**
       * Vendor-specific consent-URL parameters. Google's offline/consent pair lives HERE rather
       * than in `authorizationUrlFor`, so one vendor's requirements are never sent to another —
       * an unknown parameter is a thing a strict vendor may refuse the whole request over.
       */
      authorizationParams?: Readonly<Record<string, string>>;
    };

export type CatalogueEntry = {
  /** Stable slug. Prefixes every tool name, so tools from two servers can never collide. */
  key: string;
  title: string;
  vendor: string;
  summary: string;
  /**
   * The one host this server lives on. Null for a vendor that gives every customer their own
   * hostname, where {@link CatalogueEntry.hostPattern} decides instead.
   */
  host: string | null;
  /**
   * Anchored pattern for a per-instance vendor. Only consulted when `host` is null, and written
   * anchored at both ends so it cannot match a host that merely ends in the vendor's domain.
   */
  hostPattern?: string;
  /** The path the MCP endpoint is served at. Frozen here, never taken from a caller. */
  path: string;
  /**
   * Whose credential this server is reached with.
   *
   * This used to be `needsCredential: boolean`, which said that a credential was required and not
   * whose it was. That is the one thing about a connector worth being unambiguous about: a reader
   * who has to guess guesses the deployment's, and a deployment-wide credential pointed at a
   * per-person system means everybody's question is answered from what one account can see. So the
   * shape names it, and every entry states it.
   *
   * `deployment-bearer` is a token an administrator holds on behalf of everybody. `user-oauth` is
   * the person's own grant, where the deployment holds only the OAuth client and each person
   * consents for themselves. `builtin` is neither: there is nothing to authenticate to, because the
   * call runs in this process against this deployment's own tables as the person whose turn it is.
   */
  auth: CatalogueAuth;
  /**
   * The tools this vendor's server exposes that change something.
   *
   * Kept so the policy can be written about effect rather than about tool names a rule author would
   * have to look up. Known-incomplete for some vendors, which is why {@link classifyTool} treats an
   * unknown tool as a write rather than as a read: a tool the server never advertised, so nothing
   * here could have named it, is safe to over-scrutinize as a write. The opposite direction is the
   * one that matters for this list: a tool the server DOES advertise but that is missing from here
   * classifies as a read, so an incomplete list is the failure mode, not a safe default — this list
   * has to lean over-inclusive.
   */
  writeTools: readonly string[];
  /**
   * Which protocol reaches this vendor. Absent means MCP, which is what every entry was.
   *
   * A field rather than an inference, because the answer is not derivable from the host: Google
   * serves Drive over both an MCP endpoint and an ordinary REST API, and which one this deployment
   * uses is a decision about availability and risk rather than a property of the vendor. Naming it
   * here keeps that decision beside the host it applies to, and makes reversing it a one-line diff.
   */
  transport?: TransportKind;
  docsUrl: string;
};

/**
 * A short list, deliberately.
 *
 * Atlassian, Box, Slack, Salesforce and ServiceNow were here and were removed: each was a reviewed
 * source contract for a vendor nobody had connected, and a screen offering five untried connectors
 * asserts more than this deployment can stand behind. They are in the history if they are wanted
 * back, and re-adding one is a review of that vendor rather than a revert.
 *
 * `deployment-bearer` therefore has no entry using it. The shape stays because the call path still
 * needs it: a server an administrator added by URL has no catalogue entry at all, and that is the
 * branch it falls into.
 *
 * Routines is the first entry here that is not a remote vendor at all — no host to dial, nothing
 * outside this process to trust. It is in the catalogue anyway, on purpose rather than by oversight:
 * the catalogue is where a deployment decides which Bots may do what, and a Bot that can schedule its
 * own future runs is a capability worth that same deliberate grant, even though there is no vendor on
 * the other end of it.
 */
export const CATALOGUE: readonly CatalogueEntry[] = Object.freeze([
  {
    key: "google-drive",
    title: "Google Drive",
    vendor: "Google",
    summary: "Files in the Drive of whoever is asking.",
    /*
     * Google publishes one MCP server per Workspace product, each on its own host: Gmail, Docs,
     * Sheets, Slides, Calendar, Chat and People have their own. Drive is here because it is the one
     * a question about a document needs. Each of the others is a further entry, not a flag on this
     * one, so adding Gmail stays a reviewed decision about Gmail.
     */
    /*
     * The GA REST API, not `drivemcp.googleapis.com`.
     *
     * The MCP server was the original choice and is the better one on paper: vendor-maintained, no
     * Drive-specific code here at all. It is gated behind the Google Workspace Developer Preview
     * Program, and an unenrolled project is refused with `The caller does not have permission` —
     * which describes the project, not the credential, so every check available locally reports a
     * correct setup. Enrolment is a Workspace-account application with a stated turnaround of days.
     *
     * This host has been generally available since 2015. The MCP entry is one line away: set
     * `transport` back to `mcp` and restore the host and path above. Tool names match Google's MCP
     * server exactly, so grants survive the swap in either direction.
     */
    host: "https://www.googleapis.com",
    path: "/drive/v3",
    transport: "google-drive-rest",
    /*
     * The first vendor here that cannot be reached with a token an administrator pastes. Google
     * issues no such token: access is an authorization-code grant belonging to a person. That is
     * not a limitation to work around, it is the property this connector exists for — two people
     * asking the same question should get the answers their own accounts can see.
     */
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      // Read-only, because nothing in this slice writes to anybody's Drive.
      scopes: Object.freeze(["https://www.googleapis.com/auth/drive.readonly"]),
      /*
       * `offline` and `consent` are both load bearing FOR GOOGLE. Without `access_type=offline`
       * Google returns no refresh token; without `prompt=consent` a reconnect returns none either.
       * They are Google parameters, so they live on Google's entry.
       */
      authorizationParams: Object.freeze({
        access_type: "offline",
        prompt: "consent",
      }),
    },
    /*
     * Named writes even though the scope above makes Google refuse them.
     *
     * Belt and braces on purpose. The scope is what stops them; this list is what keeps a boundary
     * written about writes covering them, so widening the scope later cannot quietly turn a write
     * into something the policy engine has never heard of.
     */
    writeTools: Object.freeze(["create_file", "copy_file"]),
    docsUrl:
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    key: "gmail",
    title: "Gmail",
    vendor: "Google",
    summary: "Mail in Gmail, reached as whoever is asking.",
    host: "https://gmailmcp.googleapis.com",
    path: "/mcp/v1",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: Object.freeze(["https://www.googleapis.com/auth/gmail.readonly"]),
      authorizationParams: Object.freeze({
        access_type: "offline",
        prompt: "consent",
      }),
    },
    writeTools: Object.freeze([
      "create_draft",
      "delete_draft",
      "send_draft",
      "send_email",
      "trash_message",
      "untrash_message",
      "modify_message",
      "batch_modify_messages",
    ]),
    docsUrl:
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    key: "google-calendar",
    title: "Google Calendar",
    vendor: "Google",
    summary: "Calendar events of whoever is asking.",
    host: "https://calendarmcp.googleapis.com",
    path: "/mcp/v1",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: Object.freeze([
        "https://www.googleapis.com/auth/calendar.readonly",
      ]),
      authorizationParams: Object.freeze({
        access_type: "offline",
        prompt: "consent",
      }),
    },
    writeTools: Object.freeze([
      "create_event",
      "update_event",
      "delete_event",
      "move_event",
      "import_event",
      "quick_add_event",
    ]),
    docsUrl:
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    key: "google-sheets",
    title: "Google Sheets",
    vendor: "Google",
    summary: "Spreadsheets in Google Sheets, reached as whoever is asking.",
    host: "https://sheetsmcp.googleapis.com",
    path: "/mcp/v1",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: Object.freeze([
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ]),
      authorizationParams: Object.freeze({
        access_type: "offline",
        prompt: "consent",
      }),
    },
    writeTools: Object.freeze([
      "create_spreadsheet",
      "update_spreadsheet",
      "batch_update_spreadsheet",
      "append_values",
      "update_values",
      "clear_values",
    ]),
    docsUrl:
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    key: "google-docs",
    title: "Google Docs",
    vendor: "Google",
    summary: "Documents in Google Docs, reached as whoever is asking.",
    host: "https://docsmcp.googleapis.com",
    path: "/mcp/v1",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      scopes: Object.freeze([
        "https://www.googleapis.com/auth/documents.readonly",
      ]),
      authorizationParams: Object.freeze({
        access_type: "offline",
        prompt: "consent",
      }),
    },
    writeTools: Object.freeze([
      "create_document",
      "update_document",
      "batch_update_document",
    ]),
    docsUrl:
      "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    key: "notion",
    title: "Notion",
    vendor: "Notion",
    summary: "Pages and databases of whoever is asking.",
    /*
     * The hosted MCP server Notion runs, on the default MCP transport — the first entry to use
     * it. Drive's REST adapter is a workaround for a preview-gated vendor; Notion's server is
     * generally available, so this entry is the shape the catalogue was designed for.
     */
    host: "https://mcp.notion.com",
    path: "/mcp",
    auth: {
      kind: "user-oauth",
      // From https://mcp.notion.com/.well-known/oauth-authorization-server, verified live.
      authorizationUrl: "https://mcp.notion.com/authorize",
      tokenUrl: "https://mcp.notion.com/token",
      // Notion's published revocation_endpoint IS its token endpoint — not a copy-paste mistake.
      revokeUrl: "https://mcp.notion.com/token",
      /*
       * Notion has no scope strings and no read-only scope: access is per-page, chosen on the
       * consent screen. `writeTools` below plus the action policy are the ENTIRE write barrier —
       * there is no vendor-side scope backing them up.
       */
      scopes: Object.freeze([]),
      clientRegistration: "dynamic",
      registrationUrl: "https://mcp.notion.com/register",
    },
    /*
     * The writing tools as the hosted server advertises them today. The hosted server advertises
     * its tools, so a name here that does not match an advertised tool is not the risk — an
     * advertised tool that is missing from this list is: {@link classifyTool} reads an unlisted
     * but advertised name as a read, never as a write. That makes under-inclusion the failure
     * mode, so this list has to lean over-inclusive rather than minimal, and reconciling it
     * against the live tool list on the first Refresh tools is required, not cosmetic.
     */
    writeTools: Object.freeze([
      "notion-convert-page-to-skill",
      "notion-create-attachment",
      "notion-create-comment",
      "notion-create-database",
      "notion-create-file-upload",
      "notion-create-folder",
      "notion-create-pages",
      "notion-create-view",
      "notion-duplicate-page",
      "notion-move-pages",
      "notion-update-data-source",
      "notion-update-folder",
      "notion-update-page",
      "notion-update-view",
    ]),
    docsUrl: "https://developers.notion.com/guides/mcp/build-mcp-client",
  },
  {
    key: "atlassian",
    title: "Atlassian",
    vendor: "Atlassian",
    summary: "Jira, Confluence, Bitbucket and Compass through Atlassian Rovo.",
    host: "https://mcp.atlassian.com",
    path: "/v2/mcp",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://mcp.atlassian.com/v1/authorize",
      tokenUrl: "https://mcp.atlassian.com/v1/token",
      revokeUrl: "https://mcp.atlassian.com/v1/token",
      scopes: Object.freeze([]),
      clientRegistration: "dynamic",
      registrationUrl: "https://mcp.atlassian.com/v1/register",
    },
    writeTools: Object.freeze([
      "create_jira_issue",
      "update_jira_issue",
      "transition_jira_issue",
      "add_jira_comment",
      "create_confluence_page",
      "update_confluence_page",
      "create_bitbucket_pull_request",
      "update_bitbucket_pull_request",
    ]),
    docsUrl: "https://atlassian.github.io/atlassian-mcp-server/",
  },
  {
    key: "github",
    title: "GitHub",
    vendor: "GitHub",
    summary:
      "Repositories, issues, pull requests, Actions and security findings.",
    host: "https://api.githubcopilot.com",
    path: "/mcp/readonly",
    auth: Object.freeze({ kind: "deployment-bearer" }),
    writeTools: Object.freeze([
      "create_issue",
      "update_issue",
      "add_issue_comment",
      "create_pull_request",
      "update_pull_request",
      "merge_pull_request",
      "request_copilot_review",
      "create_repository",
      "create_or_update_file",
      "delete_file",
      "rerun_workflow",
      "cancel_workflow_run",
    ]),
    docsUrl: "https://github.com/github/github-mcp-server",
  },
  {
    key: "slack",
    title: "Slack",
    vendor: "Slack",
    summary: "Slack messages, channels, users, files, canvases and lists.",
    host: "https://mcp.slack.com",
    path: "/mcp",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://slack.com/oauth/v2_user/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.user.access",
      revokeUrl: "https://slack.com/api/auth.revoke",
      scopes: Object.freeze([
        "search:read.public",
        "search:read.private",
        "search:read.mpim",
        "search:read.im",
        "search:read.files",
        "files:read",
        "emoji:read",
        "search:read.users",
        "chat:write",
        "channels:history",
        "groups:history",
        "mpim:history",
        "im:history",
        "channels:write",
        "groups:write",
        "im:write",
        "mpim:write",
        "reactions:write",
        "canvases:read",
        "canvases:write",
        "users:read",
        "users:read.email",
        "channels:read",
        "groups:read",
        "im:read",
        "mpim:read",
        "lists:read",
        "lists:write",
        "files:write",
      ]),
    },
    writeTools: Object.freeze([
      "slack_send_message",
      "slack_draft_message",
      "slack_create_conversation",
      "slack_add_reaction",
      "slack_create_canvas",
      "slack_update_canvas",
      "slack_get_file_upload_url",
      "slack_complete_file_upload",
      "slack_create_list",
      "slack_update_list",
      "slack_create_list_record",
      "slack_update_list_record",
    ]),
    docsUrl: "https://docs.slack.dev/ai/slack-mcp-server/",
  },
  {
    key: "airtable",
    title: "Airtable",
    vendor: "Airtable",
    summary: "Airtable bases, tables, fields and records.",
    host: "https://mcp.airtable.com",
    path: "/mcp",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://airtable.com/oauth2/v1/authorize",
      tokenUrl: "https://airtable.com/oauth2/v1/token",
      revokeUrl: "https://airtable.com/oauth2/v1/token",
      scopes: Object.freeze([
        "data.records:read",
        "data.records:write",
        "data.recordComments:read",
        "data.recordComments:write",
        "schema.bases:read",
        "schema.bases:write",
        "user.email:read",
        "webhook.manages",
      ]),
      clientRegistration: "dynamic",
      registrationUrl: "https://airtable.com/oauth2/v1/register",
    },
    writeTools: Object.freeze([
      "create_base",
      "create_table",
      "update_table",
      "create_field",
      "update_field",
      "create_record",
      "update_record",
      "delete_record",
      "create_records",
      "update_records",
      "delete_records",
      "create_webhook",
      "delete_webhook",
    ]),
    docsUrl:
      "https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server",
  },
  {
    key: "calendly",
    title: "Calendly",
    vendor: "Calendly",
    summary: "Calendly scheduling availability, events and bookings.",
    host: "https://mcp.calendly.com",
    path: "/mcp",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://calendly.com/oauth/authorize",
      tokenUrl: "https://calendly.com/oauth/token",
      revokeUrl: "https://calendly.com/oauth/token",
      scopes: Object.freeze(["mcp:scheduling:read", "mcp:scheduling:write"]),
      clientRegistration: "dynamic",
      registrationUrl: "https://calendly.com/oauth/register",
    },
    writeTools: Object.freeze([
      "create_event_type",
      "update_event_type",
      "delete_event_type",
      "create_scheduling_link",
      "cancel_event",
      "reschedule_event",
    ]),
    docsUrl: "https://developer.calendly.com/docs/mcp/calendly-mcp-server",
  },
  {
    key: "apify",
    title: "Apify",
    vendor: "Apify",
    summary:
      "Discover and run Apify Actors, browse the web, and read Actor results.",
    /*
     * Apify's hosted MCP server uses Streamable HTTP at the root URL. It supports an OAuth browser
     * flow for clients that can complete one, and a bearer token fallback for clients that cannot.
     * We prefer OAuth here so each person can connect their own Apify account instead of sharing one
     * deployment token across every Bot run.
     */
    host: "https://mcp.apify.com",
    path: "/",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://mcp.apify.com/authorize",
      tokenUrl: "https://mcp.apify.com/token",
      revokeUrl: "https://mcp.apify.com/token",
      scopes: Object.freeze([]),
      clientRegistration: "dynamic",
      registrationUrl: "https://mcp.apify.com/register",
    },
    /*
     * Actor execution is a write for our policy purposes: it creates runs, may spend credits, and can
     * cause external fetches. Storage and documentation lookups remain reads when the server
     * advertises them. Actor-specific tool names can be configured at the MCP URL, so the generic
     * runner plus the default RAG Web Browser Actor are listed explicitly; any unadvertised name is
     * still a write by classifyTool.
     */
    writeTools: Object.freeze([
      "call-actor",
      "apify/rag-web-browser",
      "create-actor-task",
      "update-actor-task",
      "publish-actor-task",
      "unpublish-actor-task",
    ]),
    docsUrl: "https://docs.apify.com/integrations/mcp",
  },
  {
    key: "neon",
    title: "Neon",
    vendor: "Neon",
    summary:
      "Postgres projects, branches, schemas, SQL queries and database migrations.",
    host: "https://mcp.neon.tech",
    path: "/mcp",
    auth: {
      kind: "user-oauth",
      authorizationUrl: "https://mcp.neon.tech/api/authorize",
      tokenUrl: "https://mcp.neon.tech/api/token",
      revokeUrl: "https://mcp.neon.tech/api/revoke",
      scopes: Object.freeze(["read", "write"]),
      clientRegistration: "dynamic",
      registrationUrl: "https://mcp.neon.tech/api/register",
    },
    /*
     * Neon can run arbitrary SQL. `run_sql` may be read-only or mutating depending on the statement,
     * so this deployment treats it as a write and lets policy/approval carry the risk. Schema,
     * branch, project, auth, data API and tuning operations are writes as well.
     */
    writeTools: Object.freeze([
      "create_project",
      "delete_project",
      "create_branch",
      "delete_branch",
      "reset_from_parent",
      "run_sql",
      "run_sql_transaction",
      "get_connection_string",
      "provision_neon_auth",
      "configure_neon_auth",
      "provision_neon_data_api",
      "prepare_database_migration",
      "complete_database_migration",
      "prepare_query_tuning",
      "complete_query_tuning",
    ]),
    docsUrl: "https://neon.com/docs/ai/neon-mcp-server",
  },
  {
    key: "routines",
    title: "Routines",
    vendor: "OpenBot",
    summary:
      "Standing instructions a Bot runs on a schedule, as whoever scheduled them.",
    /*
     * First-party and in-process: no host to dial, no credential to hold. In the catalogue anyway,
     * because the catalogue is where a deployment decides WHICH Bots may do WHAT — and scheduling
     * future work is a capability an administrator should grant as deliberately as a vendor.
     */
    host: "builtin://routines",
    path: "/",
    transport: "builtin-routines",
    auth: Object.freeze({ kind: "builtin" }),
    writeTools: Object.freeze([
      "create_routine",
      "update_routine",
      "delete_routine",
    ]),
    docsUrl: "https://github.com/CopilotKit/OpenBot/blob/main/docs/routines.md",
  },
]);

const BY_KEY = new Map(CATALOGUE.map((entry) => [entry.key, entry]));

/** Compiled once from the frozen source strings above. Never from anything a caller supplied. */
const PATTERNS = new Map(
  CATALOGUE.filter((entry) => entry.hostPattern !== undefined).map((entry) => [
    entry.key,
    new RegExp(entry.hostPattern as string),
  ]),
);

/**
 * Which kind of credential this entry's server record may be pointed at, or null when it takes none
 * from the caller.
 *
 * Beside the entry rather than at the call site, because it is a property of the vendor's auth and
 * not of the request. `deployment-bearer` is the only kind that means "one token this deployment
 * holds for this server", which is what `mcp` names in the vault. A `user-oauth` server is answered
 * with the asker's own grant and its OAuth client is registered through its own call, which mints
 * the credential itself, so an id offered when the server is added is never the right one whatever
 * kind it names. A server needing no credential takes none.
 */
export function serverCredentialKind(entry: CatalogueEntry): "mcp" | null {
  return entry.auth.kind === "deployment-bearer" ? "mcp" : null;
}

export function catalogueEntry(key: string): CatalogueEntry | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Is this host one this entry is allowed to be pointed at?
 *
 * Compares the RAW host string, case-sensitively, and returns false for anything it does not
 * positively recognise. Every branch that cannot prove admissibility returns false rather than
 * falling through, because the failure mode of the opposite arrangement is a deployment reaching an
 * address nobody chose.
 */
export function hostAdmissible(entry: CatalogueEntry, host: string): boolean {
  if (entry.host !== null) return entry.host === host;
  const pattern = PATTERNS.get(entry.key);
  if (!pattern) return false;
  return pattern.test(host);
}

/**
 * The URL this server is reached at, or null if the request is not admissible.
 *
 * `instanceHost` is only consulted for a per-instance vendor, and only after the pattern accepts it.
 * The path is always the catalogue's, never the caller's, so an admissible host cannot reach some
 * other endpoint on the same machine.
 */
export function resolveServerUrl(
  key: string,
  instanceHost?: string,
): { url: string; entry: CatalogueEntry } | null {
  const entry = catalogueEntry(key);
  if (!entry) return null;

  const host = entry.host ?? instanceHost ?? null;
  if (host === null) return null;
  if (!hostAdmissible(entry, host)) return null;

  // The path is joined rather than concatenated blindly so a root path does not produce a double
  // slash, which some servers treat as a different route.
  const path = entry.path === "/" ? "" : entry.path;
  return { url: `${host}${path}`, entry };
}

/**
 * What this tool does, in the only two categories a policy author cares about.
 *
 * Unknown counts as a write. A tool named in {@link CatalogueEntry.writeTools} is a write. A tool
 * the server never advertised at all is a write, because the only thing that produced the name was
 * a model. A server with no catalogue entry behind it is a write throughout, because nothing
 * reviewed says any tool of theirs only reads.
 *
 * Only a tool the server itself listed AND that is absent from the write list is treated as a read.
 * That is the one case where both sources agree, and it is the only one where guessing permissively
 * is recoverable.
 */
export function classifyTool(
  entry: CatalogueEntry | null,
  toolName: string,
  advertised: boolean,
): "read" | "write" {
  // A server an administrator added by URL has no reviewed tool catalogue behind it, so nothing here
  // can say a tool of theirs only reads. Everything it offers is a write.
  if (!entry) return "write";
  if (!advertised) return "write";
  return entry.writeTools.includes(toolName) ? "write" : "read";
}

/**
 * Words that make a parameter name a credential, wherever they appear in it.
 *
 * A containment test rather than a list of exact names, because the exact-name version of this rule
 * refused `?token=` and accepted `?auth_token=`, `?api_token=`, `?session_token=` and every other
 * spelling one word away. An operator has no way to know which of those the check happens to hold,
 * so a rule that only refuses the names somebody thought of reads as a guard while behaving like a
 * gap.
 *
 * Not shared with `sensitiveKeys` in `audit.ts`: that module reaches the database and this function
 * deliberately imports nothing that does. The two also want different contents, since audit redacts
 * `content`, `prompt` and `result`, which are payload field names and mean nothing here.
 */
const CREDENTIAL_WORDS = [
  "token",
  "secret",
  "password",
  "passwd",
  "credential",
  "signature",
  "bearer",
];

/**
 * Names that are a credential on their own but are too short to contain safely.
 *
 * `sig` is the reason this list is separate from the one above: "design" contains it. These are
 * compared whole, so an ordinary word carrying the same three letters is left alone.
 */
const CREDENTIAL_NAMES = new Set([
  "auth",
  "authorization",
  "pass",
  "pwd",
  "sig",
]);

/**
 * Does this parameter name say it holds a credential?
 *
 * Names are compared with their separators dropped, so `api_key`, `apiKey` and `x-api-key` are one
 * question rather than three. A name ending in "key" is a credential and a name merely containing it
 * is not, which is what keeps `keyword` and `monkey` apart; "author" is likewise not "auth".
 *
 * It over-refuses in one direction on purpose. A parameter this rule misreads costs an operator a
 * rename, and one it misses is written to an append-only audit row that cannot be deleted.
 */
function readsAsCredential(name: string): boolean {
  const normalized = name.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (CREDENTIAL_NAMES.has(normalized) || normalized.endsWith("key")) {
    return true;
  }
  return CREDENTIAL_WORDS.some((word) => normalized.includes(word));
}

/**
 * Is this a URL an administrator may point the deployment at?
 *
 * A curated entry is reviewed in code; this is the other path, and it needs its own floor because
 * "add an MCP server" is otherwise a request-forgery primitive aimed at whatever the server can
 * reach: cloud metadata endpoints, databases on the same network, admin panels bound to localhost.
 * The rules are deliberately blunt.
 *
 * HTTPS only, because the credential is a bearer token and plaintext is not negotiable.
 * No address literals, localhost or internal suffixes, because those point at the deployment rather
 * than a vendor service.
 *
 * This is static URL validation: it checks the literal host string and scheme before storage. DNS
 * resolution and per-request network policy are separate deployment controls.
 */
export function customUrlRefusal(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That is not a URL.";
  }

  if (url.protocol !== "https:") {
    return "An MCP server must be reached over https.";
  }

  // Userinfo is not part of the host, so none of the host rules below would look at it, and what is
  // typed here is stored verbatim: addCustomServer writes the string into mcp_servers.url and into
  // the configuration.changed audit payload, whose redaction keys on the field name rather than the
  // value. A secret written this way would sit in the trail in clear text. The refusal deliberately
  // does not echo the URL back.
  if (url.username || url.password) {
    return "Put the credential in the token field rather than in the address.";
  }

  /*
   * The query is the other half of the same hole, and the fragment is the half after that.
   *
   * No host rule below reads either one, and both are stored and audited with the rest of the
   * string, so a token written here is as durable and as readable as one written into the userinfo.
   * The fragment never reaches the server at all, which is why it is not a request-forgery concern
   * and is still a disclosure one: what this rule is about is where the string ends up, not where
   * the request goes.
   *
   * The test is on the parameter name rather than on the presence of a query, because vendors
   * legitimately route and version with parameters. A floor that refused every one of them would be
   * one an operator works around rather than with, and an ordinary `#section` is left alone for the
   * same reason.
   */
  const hash = url.hash.replace(/^#/, "");
  const marker = hash.indexOf("?");
  const fragment =
    marker === -1 ? [hash] : [hash.slice(0, marker), hash.slice(marker + 1)];
  const named = [
    ...url.searchParams.keys(),
    ...fragment.flatMap((part) => [...new URLSearchParams(part).keys()]),
  ];
  if (named.some(readsAsCredential)) {
    return "Put the credential in the token field rather than in the address.";
  }

  // A trailing dot is the root-anchored spelling of the same name and resolves to the same place, so
  // they are stripped here rather than added to each comparison below. Without it "localhost."
  // misses the equality test, "vault.internal." misses the suffix tests, and "database." picks up
  // the dot that the single-label test keys on, so the fully qualified form of every name this
  // function refuses walks straight through it.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");

  // Bracketed IPv6 arrives with the brackets already stripped by URL, so the colon test catches it.
  if (host.includes(":") || /^[0-9.]+$/.test(host)) {
    return "Give a hostname rather than an IP address.";
  }
  /*
   * The cloud metadata endpoint, by name rather than by luck.
   *
   * `metadata.goog` is Google's own short alias for it, published beside `metadata.google.internal`,
   * and it carries a dot and none of the suffixes below, so it read as an ordinary vendor name. The
   * long spelling was refused only incidentally, by the `.internal` test.
   *
   * Asked of the list browsing already uses rather than a second copy here. That list holds the
   * aliases somebody has already had to think about, including the ones Alibaba and ECS answer on,
   * and a new alias added there should not have to be remembered here as well.
   */
  if (isNeverAllowedHostname(host)) {
    return "That address holds this deployment's own cloud credentials.";
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    return "That address is local to the deployment.";
  }
  if (
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".localdomain") ||
    // How a Kubernetes service is addressed from inside the cluster. It carries dots and none of
    // the suffixes above, so without this it reads as an ordinary vendor name.
    host.endsWith(".svc") ||
    !host.includes(".")
  ) {
    return "That address is not reachable from outside this network.";
  }

  return null;
}
