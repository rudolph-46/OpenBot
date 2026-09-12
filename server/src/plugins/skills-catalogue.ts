/**
 * A short, curated list of ready-made skills a person can add with one click from the Discover tab
 * on `/skills`, instead of writing instructions from scratch.
 *
 * A skill is an instruction, not a capability (see `routes.ts`'s comment on `POST /skills`), so
 * there is nothing here to review the way the MCP catalogue in `catalogue.ts` is reviewed: no host,
 * no credential, no vendor granted anything by adding one. Each entry is condensed and rewritten
 * from a small selection of skills in https://github.com/alirezarezvani/claude-skills (MIT
 * licensed), adapted for a Bot that answers in a channel rather than one that runs slash commands
 * and reads project files, and trimmed to instructions a model can follow without any attached
 * script or reference file — this deployment's skills are a text field, not a bundle.
 *
 * Frozen in code for the same reason the MCP catalogue is: which ready-made skills a fresh
 * deployment offers is a decision to make once, in review, rather than one to leave to whichever
 * import script ran last.
 */

export type SkillCatalogueEntry = {
  /** Becomes the skill's slug once added — see the `/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/` rule
   * `POST /skills` enforces. */
  key: string;
  title: string;
  summary: string;
  instructions: string;
  /** Where the idea came from, shown so nobody mistakes this for house-written guidance. */
  sourceUrl: string;
};

export const SKILLS_CATALOGUE: readonly SkillCatalogueEntry[] = Object.freeze([
  {
    key: "meeting-prep",
    title: "Meeting Prep & Follow-up",
    summary: "Decide if a meeting is worth calling, then turn its notes into owned actions.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/productivity/meetings",
    instructions: `Use this when someone is deciding whether to call a meeting, wants a timeboxed
agenda for one, or has raw notes to turn into follow-up actions.

**Before proposing a meeting**, ask what decision it exists to make. No decision to make is a
sign it should be an async message instead — say so plainly rather than drafting an agenda for a
status update. If a real decision is named, price the meeting roughly (attendee count x length x
their time) and say the number out loud; it changes how people feel about a 6-person hour.

**When building an agenda**, give every topic a stated desired outcome — "decide X", "get input
on Y" — never a bare subject line. Order decision items before discussion items. Always end with
a short slot to read back every action item, its owner and its due date.

**When turning notes into actions**, extract every commitment ("X will do Y", checkboxes,
"ACTION:" lines) into a list grouped by owner, each with a due date. Flag any action with no named
owner or no date instead of guessing one — an unowned action is not done, it is dropped quietly.
Never send anything on anyone's behalf; hand back the list for a human to act on.`,
  },
  {
    key: "inbox-triage",
    title: "Inbox Triage",
    summary: "Sort a batch of email into what needs a reply, what can wait, and what to ignore.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/productivity/email",
    instructions: `Use this when someone hands over a batch of emails (or asks to "check my inbox")
and wants it turned into a short, actionable summary rather than a re-reading of every message.

For each email, classify it into one of: **needs a reply today**, **needs a reply this week**,
**FYI, no reply needed**, or **can probably be ignored/unsubscribed**. State the reason for each
classification in one line — who it is from, what they are asking for, and any deadline mentioned.

Where a reply seems warranted, draft one — but never send it. Hand the draft back for the person
to review, edit and send themselves; a drafted reply that goes out without their eyes on it is the
one mistake this skill exists to prevent.

Group the final report by classification, most urgent first, and end with a one-line count summary
(e.g. "3 need a reply today, 2 this week, 6 FYI, 4 can be ignored").`,
  },
  {
    key: "deep-research",
    title: "Deep Research",
    summary: "Investigate a high-stakes question with multiple independent sources, not one pass.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/research/deep-research",
    instructions: `Use this for a question where a shallow or wrong answer is expensive — a
strategic decision, comparing several options, or validating a claim someone will act on. Do not
use it for a quick fact lookup; answer those directly instead.

Before researching, write down 1-3 falsifiable hypotheses or sub-questions the investigation needs
to answer — this keeps the search focused instead of open-ended browsing.

Require every non-obvious claim to be backed by at least two independent sources before treating it
as established; a single source is a lead to verify, not a fact to report. Note where sources
disagree instead of picking the more convenient one.

Before finalizing, take an adversarial pass: actively look for the strongest evidence against the
conclusion you are about to give, not just for it.

Deliver the answer with its sources cited inline, a short note on what remains uncertain, and — for
a genuinely time-sensitive topic — what would be worth re-checking later and when.`,
  },
  {
    key: "linkedin-post",
    title: "LinkedIn Post Writer",
    summary: "Draft, or critique, a LinkedIn post that sounds like a person, not a brand account.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/marketing/linkedin",
    instructions: `Use this to draft a LinkedIn post from a rough idea, or to critique a draft
someone already wrote.

The specific thing that happened — a number, a mistake, a decision and why it was made — is the
part only the person asking can supply, and it is what makes a post worth reading. Ask for it if
the brief is generic ("write about leadership") rather than inventing a plausible-sounding anecdote.

Pick the format the material actually supports: a short story needs a strong first line (the
"hook") that stands alone before the "see more" cutoff; a how-to wants numbered, scannable steps; an
opinion needs a clear, stated position rather than "thoughts on X".

When critiquing a draft, check specifically for: a hook that would survive being the only line
visible, no vague corporate language doing the work a specific detail should do, and one clear
point per post rather than three ideas competing.

Never fabricate metrics, quotes, or outcomes that were not given to you.`,
  },
  {
    key: "financial-analysis",
    title: "Financial Analysis",
    summary: "Ratio analysis, budget variance, and rolling forecasts from numbers you provide.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/finance/skills/financial-analyst",
    instructions: `Use this when someone shares financial figures (statements, a budget, actuals
vs. plan) and wants ratios, a variance explanation, or a forward-looking projection.

Start by naming what decision the analysis is for — pricing, hiring, fundraising, a board update —
because that decides which ratios and framing actually matter; a generic ratio dump is not useful
on its own.

For variance analysis, always separate volume effects from rate/price effects, and flag the single
largest driver of any material variance by name rather than listing every line item equally.

For a forecast or projection, state every assumption explicitly (growth rate, churn, cost
inflation) as a labeled line the reader can challenge, rather than folding it invisibly into a
single number. Show a base case and, when useful, one downside case — never a single point estimate
presented as certain.

Flag any number in the source data that looks internally inconsistent (e.g. totals that don't sum)
before analyzing it further, rather than silently working around it.`,
  },
  {
    key: "process-mapper",
    title: "Process Mapper",
    summary: "Document a business process end-to-end and find where it actually loses time.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/business-operations/skills/process-mapper",
    instructions: `Use this when someone describes an internal process (onboarding, procurement,
an approval chain, an incident handoff) and wants it documented, or wants to know where it is slow.

Walk the process step by step and write it as a numbered sequence of stages, each with: who does
it, what triggers it, and what it hands off to the next stage. Note explicitly where a stage is
waiting on another person or system versus where real work is happening — most elapsed time in a
business process is waiting, not working, and that distinction is the point of the exercise.

Once the stages are mapped, name the one or two stages most likely to be the bottleneck, and say
why (longest wait, most manual, most rework) rather than treating every stage as equally
suspect.

Where cycle-time numbers are given, report both the typical (median) case and a worse (90th
percentile) case — a single average hides exactly the outliers worth fixing.

Keep this to the process as described; do not invent steps that were not mentioned.`,
  },
  {
    key: "pricing-strategy",
    title: "Pricing Strategy",
    summary: "Recommend a pricing model and a defensible price range, never a single number.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/commercial/skills/pricing-strategist",
    instructions: `Use this when someone is designing or revisiting pricing for a product —
choosing a model (subscription, usage-based, value-based, freemium) or packaging tiers.

Always recommend a **model and a range**, with the trade-off of each option stated, rather than a
single confident number — pricing decided from a chat is a starting hypothesis to test, not a
final answer, and presenting it as certain does a disservice.

Base the model recommendation on how the customer gets value: usage-based fits when value scales
with consumption, seat-based fits when value scales with the number of people using it, value-based
fits when a clear, quantifiable outcome exists to price against.

When designing tiers (Good/Better/Best), make sure each tier has a genuine reason to upgrade — the
gap between tiers should map to a real difference in usage or need, not an arbitrary feature
toggle. Flag an anti-pattern if asked to review existing tiers: a "Best" tier nobody would ever
choose, or a "Good" tier deliberately crippled to force an upgrade.

State explicitly that any number given is a starting range for testing, not a final price.`,
  },
  {
    key: "agile-product-owner",
    title: "Agile Product Owner",
    summary: "Write user stories, acceptance criteria, and break an epic into a sprint-sized plan.",
    sourceUrl:
      "https://github.com/alirezarezvani/claude-skills/tree/main/product-team/agile-product-owner",
    instructions: `Use this when someone wants a user story written, acceptance criteria drafted,
an epic broken into smaller pieces, or backlog items prioritized.

Write every user story in the form "As a [role], I want [capability], so that [benefit]" — and
reject a story with no stated benefit by asking for one, since a story without a "why" cannot be
prioritized sensibly against others.

For acceptance criteria, use Given/When/Then format, and cover the unhappy path (an error, an
edge case, a permission boundary) as well as the happy path — criteria that only describe success
leave the actual ambiguity (what happens when it fails) undecided.

Apply the INVEST checklist when reviewing a story: Independent, Negotiable, Valuable, Estimable,
Small, Testable. If a story fails "Small" or "Estimable", say so and suggest how to split it rather
than leaving an oversized story as-is.

When breaking down an epic, split along user-visible slices of value (a thinner but complete path
through the feature) rather than along technical layers (all the backend work, then all the
frontend work) — each resulting story should be independently shippable and demonstrable.`,
  },
]);
