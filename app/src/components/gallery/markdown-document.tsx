import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { z } from "zod";
import { callComputer } from "@/lib/copilot/computer-tools";
import { useActiveBotId } from "@/lib/copilot/active-bot";
import type { GalleryComponent } from "@/lib/copilot/gallery-registry";
import { markdownComponents } from "@/lib/markdown";
import { GalleryFrame } from "./frame";

/**
 * Renders a file the Bot saved as formatted markdown, in the transcript, the way `computer_write_file`
 * itself never does — see its render in `computer-tools.tsx`: "The path and the size, never the
 * contents", because a write may be saving something told in confidence. This is the opposite case,
 * asked for by name: the person wants to *see* a document the Bot just wrote, the way a canvas or an
 * artifact pane does elsewhere. It reads the file back through the same governed, audited route
 * `computer_read_file` uses (`/api/computers/:botId/files/read`), so the same per-path policy that
 * would refuse the read still applies — showing a document is not a second, looser way to reach a
 * Bot's workspace.
 */

export const MarkdownDocumentProps = z.object({
  path: z
    .string()
    .describe(
      "The workspace file to show, exactly as it was saved (e.g. the path just returned by computer_write_file).",
    ),
  title: z
    .string()
    .optional()
    .describe("A heading for the document, in a few words. Defaults to the file name."),
});

type MarkdownDocumentArgs = z.infer<typeof MarkdownDocumentProps>;

type State =
  | { status: "reading" }
  | { status: "refused"; reason: string }
  | { status: "read"; text: string };

export function MarkdownDocumentCard({
  path,
  title,
}: Partial<MarkdownDocumentArgs>) {
  const botId = useActiveBotId();
  const [state, setState] = useState<State>({ status: "reading" });

  useEffect(() => {
    // Nothing to read until the path has finished streaming in.
    if (!path) return;
    let current = true;

    void callComputer(botId, "/files/read", {
      method: "POST",
      body: { path },
    }).then((result) => {
      if (!current) return;
      setState(
        result.ok && typeof result.text === "string"
          ? { status: "read", text: result.text }
          : {
              status: "refused",
              reason:
                (result.reason as string | undefined) ??
                "That file could not be read.",
            },
      );
    });

    return () => {
      current = false;
    };
  }, [botId, path]);

  const heading = title ?? path;

  if (!path) {
    return (
      <GalleryFrame title="Document">
        <p className="text-sm text-muted-foreground">Choosing a file…</p>
      </GalleryFrame>
    );
  }

  if (state.status === "reading") {
    return (
      <GalleryFrame caption={path} title={heading}>
        <p className="text-sm text-muted-foreground">Reading…</p>
      </GalleryFrame>
    );
  }

  if (state.status === "refused") {
    return (
      <GalleryFrame title={heading}>
        <p className="text-sm text-destructive">Not shown</p>
        <p className="mt-1 text-sm text-foreground/80">{state.reason}</p>
      </GalleryFrame>
    );
  }

  return (
    <GalleryFrame caption={`Read live from the Bot's workspace · ${path}`} title={heading}>
      <div className="max-h-[480px] overflow-y-auto">
        <Streamdown components={markdownComponents}>{state.text}</Streamdown>
      </div>
    </GalleryFrame>
  );
}

export const GALLERY: GalleryComponent[] = [
  {
    /*
     * NO `preview`, DELIBERATELY, for the same reason `showActivityReport` has none: this reads a
     * real Bot's real workspace the moment it mounts, and Admin draws it as unpreviewable rather
     * than run a real file read behind a page that only means to show what the component looks like.
     */
    name: "showDocument",
    title: "Document preview",
    kind: "card",
    description:
      "Show a markdown file from your workspace to the person, rendered rather than pasted as text — use right after saving one with computer_write_file, or whenever someone asks to see a file you already have. You do not see its contents; it is read straight from your workspace onto their screen.",
    parameters: MarkdownDocumentProps,
    Component: MarkdownDocumentCard as GalleryComponent["Component"],
    confirmation:
      "The document is open on screen for the person, read straight from your workspace. You were not shown its contents.",
    // Nothing to grant beyond the component itself: the read runs through the computer gateway's
    // own governance, not through a `DataFunction` a component's grant would name.
    reads: () => [],
  },
];
