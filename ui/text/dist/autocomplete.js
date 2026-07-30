import { useCallback, useEffect, useMemo, useState } from "react";
import { useInput } from "ink";
import { AUTOCOMPLETE_MAX_VISIBLE } from "./constants.js";
const COMMAND_TRIGGER = /^(\s*)\/([a-zA-Z0-9_-]*)$/;
const MENTION_TRIGGER = /(?:^|\s)@([^\s@]*)$/;
// MultilineInput never exposes the caret position, so a trigger can only be
// matched against the tail of the active line, not the true cursor index.
export function detectTrigger(input) {
    const lineStart = input.lastIndexOf("\n") + 1;
    const activeLine = input.slice(lineStart);
    // The agent expands a slash command only when the trimmed prompt starts with
    // one (execute_commands.rs). Offering the menu anywhere else — mid-sentence
    // or on a later line — would promise something that cannot run.
    if (lineStart === 0) {
        const commandMatch = COMMAND_TRIGGER.exec(activeLine);
        if (commandMatch) {
            return {
                kind: "command",
                query: commandMatch[2] ?? "",
                start: (commandMatch[1] ?? "").length,
            };
        }
    }
    const mentionMatch = MENTION_TRIGGER.exec(activeLine);
    if (mentionMatch) {
        const query = mentionMatch[1] ?? "";
        // match[0] is the leading "^" or whitespace char (if any) plus "@" plus
        // the query, so its length minus the query minus 1 lands on the "@".
        const atOffset = mentionMatch[0].length - query.length - 1;
        return {
            kind: "mention",
            query,
            start: lineStart + mentionMatch.index + atOffset,
        };
    }
    return null;
}
function isAgentMention(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const v = value;
    return (typeof v.name === "string" &&
        typeof v.description === "string" &&
        typeof v.mention === "string");
}
const AGENT_MENTIONS_METHOD = "_goose/unstable/agent-mentions/list";
// The installed @aaif/goose-sdk release predates the typed
// agentMentionsList_unstable wrapper, so this calls the same generic
// extMethod escape hatch that the generated wrapper uses internally.
export async function fetchAgentMentions(client, params) {
    const raw = await client.extMethod(AGENT_MENTIONS_METHOD, params);
    const agents = raw.agents;
    if (!Array.isArray(agents))
        return [];
    return agents
        .filter(isAgentMention)
        .sort((a, b) => a.name.localeCompare(b.name));
}
// Local commands execute identically to pushed ones (handleSubmit sends the
// literal `/name args` text either way), so local wins the merge to match
// that same precedence.
export function mergeSlashCommands(local, pushed) {
    const byName = new Map();
    for (const cmd of pushed)
        byName.set(cmd.name, cmd);
    for (const cmd of local) {
        byName.set(cmd.name, { name: cmd.name, description: cmd.description });
    }
    // The agent returns builtins, then recipes, then skills — an order that means
    // nothing to the reader. Sort like the CLI completer does.
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function commandToEntry(cmd) {
    return {
        name: cmd.name,
        description: cmd.description,
        insertText: `/${cmd.name} `,
    };
}
function mentionToEntry(agent) {
    const mention = agent.mention.trim() || `@${agent.name}`;
    return {
        name: agent.name,
        description: agent.description,
        insertText: mention.endsWith(" ") ? mention : `${mention} `,
    };
}
export function computeVisibleRows(matchCount, availableHeight) {
    if (matchCount <= 0)
        return 0;
    const cap = Math.min(AUTOCOMPLETE_MAX_VISIBLE, availableHeight - 1);
    return Math.max(0, Math.min(cap, matchCount));
}
export function useAutocomplete({ input, onAccept, commands, mentions, mentionsStatus, }) {
    const trigger = useMemo(() => detectTrigger(input), [input]);
    const triggerActive = trigger !== null;
    const [dismissed, setDismissed] = useState(false);
    useEffect(() => {
        if (!triggerActive)
            setDismissed(false);
    }, [triggerActive]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    useEffect(() => {
        setHighlightedIndex(0);
    }, [trigger?.kind, trigger?.query]);
    const loading = trigger?.kind === "mention" && mentionsStatus === "loading";
    const errored = trigger?.kind === "mention" && mentionsStatus === "error";
    const items = useMemo(() => {
        if (!trigger)
            return [];
        const query = trigger.query.toLowerCase();
        if (trigger.kind === "command") {
            return commands
                .filter((cmd) => cmd.name.toLowerCase().startsWith(query))
                .map(commandToEntry);
        }
        if (loading || errored)
            return [];
        return mentions
            .filter((agent) => agent.name.toLowerCase().startsWith(query))
            .map(mentionToEntry);
    }, [trigger, commands, mentions, loading, errored]);
    const open = triggerActive && !dismissed;
    const acceptIndex = useCallback((index) => {
        if (!trigger)
            return;
        const entry = items[index];
        if (!entry)
            return;
        onAccept(input.slice(0, trigger.start) + entry.insertText);
    }, [trigger, items, input, onAccept]);
    useInput((_input, key) => {
        if (key.upArrow) {
            setHighlightedIndex((i) => Math.max(i - 1, 0));
            return;
        }
        if (key.downArrow) {
            setHighlightedIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
            return;
        }
        if (key.tab) {
            if (items.length > 0)
                acceptIndex(highlightedIndex);
            return;
        }
        if (key.escape) {
            setDismissed(true);
            return;
        }
        if (key.return) {
            if (items.length > 0)
                acceptIndex(highlightedIndex);
            return;
        }
    }, { isActive: open });
    return {
        open,
        swallowReturn: open && items.length > 0,
        items,
        displayRowCount: open ? Math.max(items.length, 1) : 0,
        highlightedIndex,
        loading,
        errored,
        emptyLabel: trigger?.kind === "mention" ? "no matching agents" : "no matching commands",
    };
}
