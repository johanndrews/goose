import type { GooseClient } from "@aaif/goose-sdk";
export interface ResumableSession {
    id: string;
    title: string;
    updatedAt: Date | null;
    messageCount: number;
    snippet: string;
}
/**
 * Sessions started in `cwd`, newest first — the agent sorts by last activity,
 * which is the order a resume picker wants.
 */
export declare function listResumableSessions(client: GooseClient, cwd: string): Promise<ResumableSession[]>;
export declare function formatSessionAge(updatedAt: Date | null, now: Date): string;
