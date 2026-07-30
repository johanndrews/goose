import type { AvailableCommand } from "@agentclientprotocol/sdk";
import type { GooseClient } from "@aaif/goose-sdk";
import type { SlashCommand } from "./slashCommands.js";
export interface AutocompleteEntry {
    name: string;
    description: string;
    insertText: string;
}
export interface AgentMention {
    name: string;
    description: string;
    mention: string;
}
export type Trigger = {
    kind: "command";
    query: string;
    start: number;
} | {
    kind: "mention";
    query: string;
    start: number;
};
export declare function detectTrigger(input: string): Trigger | null;
export declare function fetchAgentMentions(client: GooseClient, params: {
    cwd: string;
    sessionId: string;
}): Promise<AgentMention[]>;
export declare function mergeSlashCommands(local: SlashCommand[], pushed: AvailableCommand[]): AvailableCommand[];
export declare function computeVisibleRows(matchCount: number, availableHeight: number): number;
export type MentionsStatus = "loading" | "ready" | "error";
export interface UseAutocompleteOptions {
    input: string;
    onAccept: (value: string) => void;
    commands: AvailableCommand[];
    mentions: AgentMention[];
    mentionsStatus: MentionsStatus;
}
export interface AutocompleteState {
    open: boolean;
    swallowReturn: boolean;
    items: AutocompleteEntry[];
    displayRowCount: number;
    highlightedIndex: number;
    loading: boolean;
    errored: boolean;
    emptyLabel: string;
}
export declare function useAutocomplete({ input, onAccept, commands, mentions, mentionsStatus, }: UseAutocompleteOptions): AutocompleteState;
