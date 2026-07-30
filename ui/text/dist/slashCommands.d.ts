export interface SlashCommandContext {
    cwd: string;
}
export type SlashCommandResult = {
    handled: true;
    message?: string;
} | {
    handled: true;
    overlay: "diff";
    content: string;
    truncated: boolean;
} | {
    handled: true;
    overlay: "sessions";
} | {
    handled: false;
};
export interface SlashCommand {
    name: string;
    description: string;
    run: (ctx: SlashCommandContext) => SlashCommandResult;
}
export declare function tryRunSlashCommand(input: string, ctx: SlashCommandContext): SlashCommandResult;
export declare function listSlashCommands(): SlashCommand[];
export interface CommandHighlightRange {
    start: number;
    end: number;
}
export declare function computeCommandHighlight({ value, knownCommands, }: {
    value: string;
    knownCommands: Set<string>;
}): CommandHighlightRange | undefined;
