/**
 * Ink does not clip overflow, so text has to fit its box before it is rendered:
 * collapse the whitespace that would add lines, then cut to the column budget.
 */
export declare function fitToWidth(text: string, width: number): string;
export declare function isErrorStatus(status: string): boolean;
export declare function shortenPath(target: string): string;
export declare function formatError(e: unknown): string;
