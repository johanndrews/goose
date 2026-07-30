import { spawnSync } from "node:child_process";
function isGitRepo(cwd) {
    const result = spawnSync("git", [
        "-c",
        "safe.bareRepository=explicit",
        "-c",
        "core.fsmonitor=false",
        "rev-parse",
        "--is-inside-work-tree",
    ], {
        cwd,
        stdio: ["ignore", "ignore", "ignore"],
    });
    return result.status === 0;
}
const MAX_DIFF_BYTES = 2_000_000;
function readDiff(cwd) {
    const result = spawnSync("git", [
        "-c",
        "safe.bareRepository=explicit",
        "-c",
        "core.fsmonitor=false",
        "--no-pager",
        "diff",
        "--no-color",
    ], {
        cwd,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0 && result.status !== null)
        return null;
    const stdout = result.stdout ?? "";
    if (stdout.length > MAX_DIFF_BYTES) {
        return { text: stdout.slice(0, MAX_DIFF_BYTES), truncated: true };
    }
    return { text: stdout, truncated: false };
}
const diffCommand = {
    name: "diff",
    description: "show unstaged changes",
    run: (ctx) => {
        if (!isGitRepo(ctx.cwd)) {
            return {
                handled: true,
                message: `not a git repository: ${ctx.cwd}`,
            };
        }
        const diff = readDiff(ctx.cwd);
        if (diff === null) {
            return { handled: true, message: "failed to run `git diff`" };
        }
        if (diff.text.trim().length === 0) {
            return { handled: true, message: "no unstaged changes" };
        }
        return {
            handled: true,
            overlay: "diff",
            content: diff.text,
            truncated: diff.truncated,
        };
    },
};
const resumeCommand = {
    name: "resume",
    description: "switch to another session from this directory",
    run: () => ({ handled: true, overlay: "sessions" }),
};
const COMMANDS = {
    diff: diffCommand,
    resume: resumeCommand,
};
export function tryRunSlashCommand(input, ctx) {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/"))
        return { handled: false };
    const name = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
    const cmd = COMMANDS[name];
    if (!cmd)
        return { handled: false };
    return cmd.run(ctx);
}
export function listSlashCommands() {
    return Object.values(COMMANDS);
}
// Mirrors tryRunSlashCommand's own recognition rule (trim, then the first
// token must start with "/"): only a command leading the buffer counts,
// since that's the only one the agent will ever expand. Leading whitespace
// is allowed but excluded from the range so just "/name" gets highlighted.
const LEADING_COMMAND_PATTERN = /^(\s*)\/(\S+)/;
export function computeCommandHighlight({ value, knownCommands, }) {
    const match = LEADING_COMMAND_PATTERN.exec(value);
    if (!match)
        return undefined;
    const [, leadingWhitespace, name] = match;
    if (!knownCommands.has(name.toLowerCase()))
        return undefined;
    const start = leadingWhitespace.length;
    return { start, end: start + 1 + name.length }; // +1 for the leading "/"
}
