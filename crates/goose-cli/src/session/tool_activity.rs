//! Tracks main-agent and subagent tool activity for the compact display.
//!
//! Every main-agent tool call becomes one numbered [`Block`]. A block for a
//! `delegate`/`subagent` call additionally accumulates the subagent's own
//! nested tool calls (fed by MCP notifications, since those never reach the
//! conversation history) and is closed once the matching response's `_meta`
//! reports the subagent finished.
//!
//! This module owns state and pure formatting only — no terminal I/O. The
//! session module drives it and prints what it returns.

use goose::conversation::message::ToolNameParts;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::time::Duration;

use chrono::{DateTime, Local};

pub(super) type JsonObject = serde_json::Map<String, Value>;

const MAX_STORED_OUTPUT_LINES: usize = 2000;
const MAX_SUBAGENT_CALLS: usize = 2000;

pub struct RecordedRequest {
    pub number: usize,
    pub time: DateTime<Local>,
    pub line: String,
}

pub enum ResponseOutcome {
    /// Nothing to print (e.g. a `load` call that didn't finalize anything).
    None,
    /// The compact `⎿ ...` summary line for an ordinary tool call.
    Output(String),
    /// The response is an error; the caller falls back to the full legacy
    /// rendering so the error stays visible.
    Error,
    /// The `✓`/`✗` line that closes a subagent block.
    Finalized(String),
}

pub struct SubagentCall {
    pub time: DateTime<Local>,
    pub tool_name: String,
    pub args_summary: String,
}

pub enum Description<'a> {
    Tool {
        tool_name: &'a str,
        params: Option<&'a JsonObject>,
        output: Option<&'a str>,
        output_is_error: bool,
    },
    Subagent {
        source: Option<&'a str>,
        calls: &'a [SubagentCall],
    },
}

struct Output {
    text: String,
    is_error: bool,
}

enum BlockKind {
    Tool {
        tool_name: String,
        params: Option<JsonObject>,
        output: Option<Output>,
    },
    Subagent {
        source: Option<String>,
        is_async: bool,
        calls: Vec<SubagentCall>,
        finished: Option<(DateTime<Local>, Duration)>,
    },
}

struct Block {
    number: usize,
    time: DateTime<Local>,
    kind: BlockKind,
}

/// Numbered log of tool activity for one session. Reset on `/new` and
/// `/resume` so block numbers restart.
#[derive(Default)]
pub struct ToolActivity {
    blocks: Vec<Block>,
    request_index: HashMap<String, usize>,
    subagent_index: HashMap<String, usize>,
    pending_subagents: VecDeque<usize>,
}

impl ToolActivity {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        *self = Self::new();
    }

    pub fn last_block_number(&self) -> Option<usize> {
        self.blocks.last().map(|block| block.number)
    }

    pub fn describe(&self, number: usize) -> Option<Description<'_>> {
        let block = self.blocks.get(number.checked_sub(1)?)?;
        Some(match &block.kind {
            BlockKind::Tool {
                tool_name,
                params,
                output,
            } => Description::Tool {
                tool_name,
                params: params.as_ref(),
                output: output.as_ref().map(|o| o.text.as_str()),
                output_is_error: output.as_ref().is_some_and(|o| o.is_error),
            },
            BlockKind::Subagent { source, calls, .. } => Description::Subagent {
                source: source.as_deref(),
                calls,
            },
        })
    }

    /// Records a main-agent tool call request. Returns `None` for tools that
    /// render nothing on the request side (`load`).
    pub fn record_request(
        &mut self,
        id: &str,
        tool_name: &str,
        arguments: Option<&JsonObject>,
    ) -> Option<RecordedRequest> {
        if tool_name == "load" {
            return None;
        }

        let now = Local::now();
        let number = self.blocks.len() + 1;
        let label = tool_short_name(tool_name);

        if is_delegate_tool(tool_name) {
            let source = arguments
                .and_then(|a| a.get("source"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let is_async = arguments
                .and_then(|a| a.get("async"))
                .and_then(Value::as_bool)
                .unwrap_or(false);

            let idx = self.blocks.len();
            self.blocks.push(Block {
                number,
                time: now,
                kind: BlockKind::Subagent {
                    source: source.clone(),
                    is_async,
                    calls: Vec::new(),
                    finished: None,
                },
            });
            self.request_index.insert(id.to_string(), idx);
            self.pending_subagents.push_back(idx);

            let key_param = source.map(|s| format!("→ {s}"));
            let line = format_request_line(number, now, label, key_param.as_deref());
            return Some(RecordedRequest {
                number,
                time: now,
                line,
            });
        }

        let idx = self.blocks.len();
        self.blocks.push(Block {
            number,
            time: now,
            kind: BlockKind::Tool {
                tool_name: label.to_string(),
                params: arguments.cloned(),
                output: None,
            },
        });
        self.request_index.insert(id.to_string(), idx);

        let key_param = key_param_for(tool_name, arguments);
        let line = format_request_line(number, now, label, key_param.as_deref());
        Some(RecordedRequest {
            number,
            time: now,
            line,
        })
    }

    /// Records one subagent tool call observed via an MCP notification and
    /// returns the text the thinking spinner should show.
    pub fn record_subagent_call(
        &mut self,
        subagent_id: &str,
        tool_name: &str,
        arguments: Option<&JsonObject>,
    ) -> String {
        let idx = self.resolve_subagent_block(subagent_id);
        let short_tool = tool_short_name(tool_name).to_string();
        let short_args = key_param_for(tool_name, arguments).unwrap_or_default();
        let now = Local::now();

        let block = &mut self.blocks[idx];
        let number = block.number;
        let BlockKind::Subagent { source, calls, .. } = &mut block.kind else {
            unreachable!("resolve_subagent_block always returns a Subagent block");
        };
        calls.push(SubagentCall {
            time: now,
            tool_name: short_tool.clone(),
            args_summary: short_args,
        });
        if calls.len() > MAX_SUBAGENT_CALLS {
            calls.remove(0);
        }
        let count = calls.len();
        let label = source
            .clone()
            .unwrap_or_else(|| format!("subagent:{}", short_subagent_id(subagent_id)));

        spinner_text(number, &label, count, &short_tool)
    }

    /// Records a main-agent tool call response. `output_text` is the
    /// already priority-filtered text; `meta` is the response's `_meta`
    /// object, if any.
    pub fn record_response(
        &mut self,
        id: &str,
        output_text: &str,
        is_error: bool,
        meta: Option<&JsonObject>,
    ) -> ResponseOutcome {
        if let Some(meta) = meta {
            if let Some(subagent_id) = meta.get("subagent_session_id").and_then(Value::as_str) {
                return self.finalize_subagent(id, subagent_id, meta, is_error);
            }
        }

        self.record_tool_output(id, output_text, is_error)
    }

    fn resolve_subagent_block(&mut self, subagent_id: &str) -> usize {
        if let Some(&idx) = self.subagent_index.get(subagent_id) {
            return idx;
        }
        if let Some(idx) = self.pending_subagents.pop_front() {
            self.subagent_index.insert(subagent_id.to_string(), idx);
            return idx;
        }

        let number = self.blocks.len() + 1;
        let idx = self.blocks.len();
        self.blocks.push(Block {
            number,
            time: Local::now(),
            kind: BlockKind::Subagent {
                source: None,
                is_async: false,
                calls: Vec::new(),
                finished: None,
            },
        });
        self.subagent_index.insert(subagent_id.to_string(), idx);
        idx
    }

    fn finalize_subagent(
        &mut self,
        request_id: &str,
        subagent_id: &str,
        meta: &JsonObject,
        is_error: bool,
    ) -> ResponseOutcome {
        let idx = match self.subagent_index.get(subagent_id) {
            Some(&idx) => idx,
            None => {
                let Some(&idx) = self.request_index.get(request_id) else {
                    return ResponseOutcome::None;
                };
                if !matches!(self.blocks[idx].kind, BlockKind::Subagent { .. }) {
                    return ResponseOutcome::None;
                }
                self.subagent_index.insert(subagent_id.to_string(), idx);
                self.pending_subagents.retain(|&pending| pending != idx);
                idx
            }
        };

        let task_status = meta.get("task_status").and_then(Value::as_str);
        let (is_async, already_finished) = match &self.blocks[idx].kind {
            BlockKind::Subagent {
                is_async, finished, ..
            } => (*is_async, finished.is_some()),
            BlockKind::Tool { .. } => return ResponseOutcome::None,
        };
        if already_finished || !is_finalizing(task_status, is_async) {
            return ResponseOutcome::None;
        }

        let now = Local::now();
        let block = &mut self.blocks[idx];
        let number = block.number;
        let start = block.time;
        let duration = (now - start).to_std().unwrap_or_default();
        let BlockKind::Subagent {
            source,
            calls,
            finished,
            ..
        } = &mut block.kind
        else {
            unreachable!("checked above");
        };
        *finished = Some((now, duration));
        let label = source
            .clone()
            .unwrap_or_else(|| format!("subagent:{}", short_subagent_id(subagent_id)));

        ResponseOutcome::Finalized(finalize_line(FinalizedSubagent {
            number,
            label: &label,
            call_count: calls.len(),
            start,
            end: now,
            duration,
            is_error,
        }))
    }

    fn record_tool_output(&mut self, id: &str, text: &str, is_error: bool) -> ResponseOutcome {
        let Some(&idx) = self.request_index.get(id) else {
            return ResponseOutcome::None;
        };
        let number = self.blocks[idx].number;
        let BlockKind::Tool { output, .. } = &mut self.blocks[idx].kind else {
            // A subagent block whose response carried no `_meta` at all, e.g.
            // a transport-level error on the delegate call itself. It never
            // finalizes, but an error still needs to stay visible.
            return if is_error {
                ResponseOutcome::Error
            } else {
                ResponseOutcome::None
            };
        };
        *output = Some(Output {
            text: store_output(text),
            is_error,
        });

        if is_error {
            return ResponseOutcome::Error;
        }
        match compact_output_summary(text, number) {
            Some(line) => ResponseOutcome::Output(line),
            None => ResponseOutcome::None,
        }
    }
}

fn is_delegate_tool(tool_name: &str) -> bool {
    matches!(tool_name, "delegate" | "subagent")
}

fn short_subagent_id(id: &str) -> &str {
    id.rsplit('_').next().unwrap_or(id)
}

fn tool_short_name(tool_name: &str) -> &str {
    ToolNameParts::from(tool_name).tool_name
}

fn is_finalizing(task_status: Option<&str>, is_async: bool) -> bool {
    match task_status {
        Some("running") => false,
        Some(_) => true,
        None => !is_async,
    }
}

fn store_output(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() <= MAX_STORED_OUTPUT_LINES {
        return text.to_string();
    }
    let mut capped = lines[..MAX_STORED_OUTPUT_LINES].join("\n");
    capped.push_str(&format!(
        "\n... ({} more lines, capped)",
        lines.len() - MAX_STORED_OUTPUT_LINES
    ));
    capped
}

fn compact_output_summary(text: &str, number: usize) -> Option<String> {
    if text.is_empty() {
        return None;
    }
    let mut lines = text.lines();
    let first = lines.next().unwrap_or("");
    if lines.next().is_none() {
        Some(format!("⎿ {first}"))
    } else {
        Some(format!(
            "⎿ {} lines · /tools {number}",
            text.lines().count()
        ))
    }
}

/// Truncates to `width` characters, appending a single ellipsis when the
/// content had to be cut. `None` leaves the line untouched (no known
/// terminal width, e.g. a pipe).
pub(super) fn truncate_to_width(line: &str, width: Option<usize>) -> String {
    match width {
        Some(width) if line.chars().count() > width && width > 1 => {
            let mut truncated: String = line.chars().take(width - 1).collect();
            truncated.push('…');
            truncated
        }
        _ => line.to_string(),
    }
}

fn format_request_line(
    number: usize,
    time: DateTime<Local>,
    label: &str,
    key_param: Option<&str>,
) -> String {
    let time_str = time.format("%H:%M:%S");
    match key_param {
        Some(param) if !param.is_empty() => format!("▸ #{number} {time_str} {label} · {param}"),
        _ => format!("▸ #{number} {time_str} {label}"),
    }
}

fn spinner_text(number: usize, label: &str, count: usize, last_tool: &str) -> String {
    let plural = if count == 1 { "" } else { "s" };
    format!("#{number} {label} · {count} tool call{plural} · last: {last_tool}")
}

struct FinalizedSubagent<'a> {
    number: usize,
    label: &'a str,
    call_count: usize,
    start: DateTime<Local>,
    end: DateTime<Local>,
    duration: Duration,
    is_error: bool,
}

fn finalize_line(info: FinalizedSubagent) -> String {
    let mark = if info.is_error { "✗" } else { "✓" };
    let plural = if info.call_count == 1 { "" } else { "s" };
    format!(
        "{mark} #{} {} · {} tool call{plural} · {} → {} ({})",
        info.number,
        info.label,
        info.call_count,
        info.start.format("%H:%M:%S"),
        info.end.format("%H:%M:%S"),
        super::format_elapsed_time(info.duration)
    )
}

/// Picks the key param off the tool's *short* name (extension prefix
/// stripped), since subagent notifications route through the extension
/// dispatcher and arrive as e.g. `developer__shell`, while the main agent's
/// platform tools are already bare (`shell`, `write`, ...) — stripping is a
/// no-op for those, so one set of checks covers both.
fn key_param_for(tool_name: &str, arguments: Option<&JsonObject>) -> Option<String> {
    match tool_short_name(tool_name) {
        "shell" => shell_command_first_line(arguments),
        "write" | "edit" => path_value(arguments),
        "todo_write" => Some(todo_key_param(arguments)),
        "execute_typescript" | "execute_code" => {
            execute_code_key_param(arguments).or_else(|| default_key_param(arguments))
        }
        _ => default_key_param(arguments),
    }
}

fn shell_command_first_line(arguments: Option<&JsonObject>) -> Option<String> {
    let command = arguments?.get("command")?.as_str()?;
    command
        .lines()
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn path_value(arguments: Option<&JsonObject>) -> Option<String> {
    arguments?.get("path")?.as_str().map(str::to_string)
}

fn todo_key_param(arguments: Option<&JsonObject>) -> String {
    let content = arguments
        .and_then(|a| a.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("");
    match summarize_todos(content) {
        Some(summary) => format!("{} open · {} done", summary.open, summary.done),
        None => content.lines().next().unwrap_or("update").to_string(),
    }
}

fn execute_code_key_param(arguments: Option<&JsonObject>) -> Option<String> {
    let count = arguments?.get("tool_graph")?.as_array()?.len();
    if count == 0 {
        return None;
    }
    let plural = if count == 1 { "" } else { "s" };
    Some(format!("{count} tool call{plural}"))
}

fn default_key_param(arguments: Option<&JsonObject>) -> Option<String> {
    arguments?
        .values()
        .find_map(|v| v.as_str().map(str::to_string))
}

pub(super) struct TodoSummary {
    pub open: usize,
    pub done: usize,
    pub next_open: Vec<String>,
}

fn checkbox_item(trimmed: &str) -> Option<(bool, &str)> {
    let rest = trimmed.strip_prefix("- [")?;
    let mut chars = rest.chars();
    let mark = chars.next()?;
    if chars.next()? != ']' {
        return None;
    }
    let done = match mark {
        ' ' => false,
        'x' | 'X' => true,
        _ => return None,
    };
    Some((done, chars.as_str().trim_start()))
}

pub(super) fn summarize_todos(content: &str) -> Option<TodoSummary> {
    let mut summary = TodoSummary {
        open: 0,
        done: 0,
        next_open: Vec::new(),
    };

    for line in content.lines() {
        let Some((done, text)) = checkbox_item(line.trim_start()) else {
            continue;
        };
        if done {
            summary.done += 1;
        } else {
            summary.open += 1;
            if summary.next_open.len() < 3 {
                summary.next_open.push(text.to_string());
            }
        }
    }

    if summary.open == 0 && summary.done == 0 {
        None
    } else {
        Some(summary)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn args(value: Value) -> JsonObject {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn record_request_assigns_sequential_numbers() {
        let mut activity = ToolActivity::new();
        let a = activity.record_request("1", "shell", None).unwrap();
        let b = activity.record_request("2", "write", None).unwrap();
        assert_eq!(a.number, 1);
        assert_eq!(b.number, 2);
    }

    #[test]
    fn record_request_load_renders_nothing() {
        let mut activity = ToolActivity::new();
        assert!(activity.record_request("1", "load", None).is_none());
        assert_eq!(activity.last_block_number(), None);
    }

    #[test]
    fn shell_key_param_is_first_line_of_command() {
        let arguments = args(json!({"command": "jq '.x=1' file\nmv a b"}));
        let mut activity = ToolActivity::new();
        let req = activity
            .record_request("1", "shell", Some(&arguments))
            .unwrap();
        assert!(req.line.contains("jq '.x=1' file"));
        assert!(!req.line.contains("mv a b"));
    }

    #[test]
    fn write_key_param_is_path() {
        let arguments = args(json!({"path": "docs/features/CE-1.md", "content": "..."}));
        let mut activity = ToolActivity::new();
        let req = activity
            .record_request("1", "write", Some(&arguments))
            .unwrap();
        assert!(req.line.ends_with("docs/features/CE-1.md"));
    }

    #[test]
    fn delegate_key_param_is_arrow_source() {
        let arguments = args(json!({"source": "test-writer", "instructions": "..."}));
        let mut activity = ToolActivity::new();
        let req = activity
            .record_request("1", "delegate", Some(&arguments))
            .unwrap();
        assert!(req.line.ends_with("→ test-writer"));
        assert!(req.line.contains("delegate"));
    }

    #[test]
    fn default_key_param_is_first_string_value() {
        let arguments = args(json!({"zeta": 1, "alpha": "hello", "beta": "world"}));
        // serde_json::Map without preserve_order sorts keys: alpha < beta < zeta.
        assert_eq!(
            default_key_param(Some(&arguments)).as_deref(),
            Some("hello")
        );
    }

    #[test]
    fn todo_key_param_summarizes_checkbox_content() {
        let arguments = args(json!({"content": "- [ ] one\n- [x] two\n- [ ] three"}));
        assert_eq!(todo_key_param(Some(&arguments)), "2 open · 1 done");
    }

    #[test]
    fn todo_key_param_falls_back_to_first_line_without_checkboxes() {
        let arguments = args(json!({"content": "no checkboxes here\nmore text"}));
        assert_eq!(todo_key_param(Some(&arguments)), "no checkboxes here");
    }

    #[test]
    fn execute_code_key_param_counts_tool_graph() {
        let arguments = args(json!({"tool_graph": [{"tool": "a"}, {"tool": "b"}]}));
        assert_eq!(
            execute_code_key_param(Some(&arguments)).as_deref(),
            Some("2 tool calls")
        );
    }

    #[test]
    fn truncate_to_width_appends_ellipsis_when_cut() {
        assert_eq!(truncate_to_width("hello world", Some(5)), "hell…");
        assert_eq!(truncate_to_width("hi", Some(5)), "hi");
        assert_eq!(truncate_to_width("hello world", None), "hello world");
    }

    #[test]
    fn compact_output_summary_single_line() {
        assert_eq!(
            compact_output_summary("{\"fd\":\"CE-1\"}", 5).as_deref(),
            Some("⎿ {\"fd\":\"CE-1\"}")
        );
    }

    #[test]
    fn compact_output_summary_multiline_collapses_to_tools_pointer() {
        assert_eq!(
            compact_output_summary("a\nb\nc", 7).as_deref(),
            Some("⎿ 3 lines · /tools 7")
        );
    }

    #[test]
    fn compact_output_summary_empty_text_is_none() {
        assert!(compact_output_summary("", 1).is_none());
    }

    #[test]
    fn record_response_with_unknown_id_is_none() {
        let mut activity = ToolActivity::new();
        assert!(matches!(
            activity.record_response("missing", "text", false, None),
            ResponseOutcome::None
        ));
    }

    #[test]
    fn record_response_builds_compact_output_line() {
        let mut activity = ToolActivity::new();
        activity.record_request("1", "shell", None).unwrap();
        let outcome = activity.record_response("1", "single line", false, None);
        assert!(matches!(outcome, ResponseOutcome::Output(line) if line == "⎿ single line"));
    }

    #[test]
    fn record_response_error_signals_legacy_rendering() {
        let mut activity = ToolActivity::new();
        activity.record_request("1", "shell", None).unwrap();
        let outcome = activity.record_response("1", "boom", true, None);
        assert!(matches!(outcome, ResponseOutcome::Error));
    }

    #[test]
    fn transport_error_on_a_delegate_call_still_signals_an_error() {
        let mut activity = ToolActivity::new();
        activity.record_request("d1", "delegate", None).unwrap();
        // No `_meta` at all: a transport-level failure on the delegate call
        // itself, not a normal subagent completion/failure.
        let outcome = activity.record_response("d1", "connection reset", true, None);
        assert!(matches!(outcome, ResponseOutcome::Error));
    }

    #[test]
    fn subagent_notification_attaches_to_oldest_pending_delegate() {
        let mut activity = ToolActivity::new();
        let arguments = args(json!({"source": "test-writer"}));
        activity
            .record_request("delegate-1", "delegate", Some(&arguments))
            .unwrap();

        let text = activity.record_subagent_call("20260924_41", "developer__shell", None);
        assert!(text.contains("test-writer"));
        assert!(text.contains("1 tool call"));
        assert!(text.contains("last: shell"));
    }

    #[test]
    fn unknown_subagent_id_without_pending_delegate_is_labeled() {
        let mut activity = ToolActivity::new();
        let text = activity.record_subagent_call("20260924_99", "shell", None);
        assert!(text.contains("subagent:99"));
    }

    #[test]
    fn interleaved_subagent_ids_track_independent_blocks() {
        let mut activity = ToolActivity::new();
        let a = args(json!({"source": "alpha"}));
        let b = args(json!({"source": "beta"}));
        activity.record_request("d1", "delegate", Some(&a)).unwrap();
        activity.record_request("d2", "delegate", Some(&b)).unwrap();

        let alpha_text = activity.record_subagent_call("20260924_1", "read", None);
        let beta_text = activity.record_subagent_call("20260924_2", "write", None);
        let alpha_text_2 = activity.record_subagent_call("20260924_1", "shell", None);

        assert!(alpha_text.contains("alpha"));
        assert!(beta_text.contains("beta"));
        assert!(alpha_text_2.contains("2 tool calls"));
        assert!(alpha_text_2.contains("last: shell"));
    }

    #[test]
    fn finalize_via_meta_closes_sync_delegate_block() {
        let mut activity = ToolActivity::new();
        let arguments = args(json!({"source": "test-writer"}));
        activity
            .record_request("d1", "delegate", Some(&arguments))
            .unwrap();
        activity.record_subagent_call("20260924_1", "shell", None);

        let meta = args(json!({"subagent_session_id": "20260924_1"}));
        let outcome = activity.record_response("d1", "", false, Some(&meta));
        match outcome {
            ResponseOutcome::Finalized(line) => {
                assert!(line.starts_with('✓'));
                assert!(line.contains("test-writer"));
                assert!(line.contains("1 tool call"));
            }
            _ => panic!("expected Finalized outcome"),
        }
    }

    #[test]
    fn finalize_does_not_fire_twice() {
        let mut activity = ToolActivity::new();
        activity.record_request("d1", "delegate", None).unwrap();
        let meta = args(json!({"subagent_session_id": "20260924_1"}));
        let first = activity.record_response("d1", "", false, Some(&meta));
        assert!(matches!(first, ResponseOutcome::Finalized(_)));

        let meta2 = args(json!({"subagent_session_id": "20260924_1"}));
        let second = activity.record_response("d1", "", false, Some(&meta2));
        assert!(matches!(second, ResponseOutcome::None));
    }

    #[test]
    fn async_delegate_launch_response_does_not_finalize() {
        let mut activity = ToolActivity::new();
        let arguments = args(json!({"source": "bg-task", "async": true}));
        activity
            .record_request("d1", "delegate", Some(&arguments))
            .unwrap();

        // The immediate "task launched" response carries the subagent id but
        // no task_status: it must not close the block.
        let meta = args(json!({"subagent_session_id": "20260924_1"}));
        let outcome = activity.record_response("d1", "Task launched", false, Some(&meta));
        assert!(matches!(outcome, ResponseOutcome::None));
        assert!(activity.describe(1).is_some());
    }

    #[test]
    fn async_delegate_running_peek_does_not_finalize() {
        let mut activity = ToolActivity::new();
        let arguments = args(json!({"source": "bg-task", "async": true}));
        activity
            .record_request("d1", "delegate", Some(&arguments))
            .unwrap();
        // The launch response establishes the subagent_id -> block mapping.
        let launch_meta = args(json!({"subagent_session_id": "20260924_1"}));
        activity.record_response("d1", "launched", false, Some(&launch_meta));

        let peek_meta = args(json!({
            "subagent_session_id": "20260924_1",
            "task_status": "running",
        }));
        let outcome = activity.record_response("load-1", "still running", false, Some(&peek_meta));
        assert!(matches!(outcome, ResponseOutcome::None));
        assert!(activity.describe(1).is_some());
    }

    #[test]
    fn async_delegate_finalizes_via_later_load_call() {
        let mut activity = ToolActivity::new();
        let arguments = args(json!({"source": "bg-task", "async": true}));
        activity
            .record_request("d1", "delegate", Some(&arguments))
            .unwrap();
        // Launch response: not terminal.
        let launch_meta = args(json!({"subagent_session_id": "20260924_1"}));
        activity.record_response("d1", "launched", false, Some(&launch_meta));

        // A later `load` call (different tool_call_id) reports completion.
        let done_meta = args(json!({
            "subagent_session_id": "20260924_1",
            "task_status": "completed",
        }));
        let outcome = activity.record_response("load-1", "done", false, Some(&done_meta));
        assert!(matches!(outcome, ResponseOutcome::Finalized(_)));
    }

    #[test]
    fn describe_returns_tool_block_with_stored_params_and_output() {
        let mut activity = ToolActivity::new();
        let arguments = args(json!({"path": "a.txt"}));
        activity
            .record_request("1", "write", Some(&arguments))
            .unwrap();
        activity.record_response("1", "42 lines written", false, None);

        match activity.describe(1) {
            Some(Description::Tool {
                tool_name,
                params,
                output,
                output_is_error,
            }) => {
                assert_eq!(tool_name, "write");
                assert_eq!(
                    params.unwrap().get("path").and_then(Value::as_str),
                    Some("a.txt")
                );
                assert_eq!(output, Some("42 lines written"));
                assert!(!output_is_error);
            }
            _ => panic!("expected a Tool description"),
        }
    }

    #[test]
    fn describe_reports_error_output() {
        let mut activity = ToolActivity::new();
        activity.record_request("1", "shell", None).unwrap();
        activity.record_response("1", "boom", true, None);

        match activity.describe(1) {
            Some(Description::Tool {
                output_is_error, ..
            }) => assert!(output_is_error),
            _ => panic!("expected a Tool description"),
        }
    }

    #[test]
    fn describe_unknown_block_is_none() {
        let activity = ToolActivity::new();
        assert!(activity.describe(1).is_none());
        assert!(activity.describe(0).is_none());
    }

    #[test]
    fn reset_clears_blocks_and_restarts_numbering() {
        let mut activity = ToolActivity::new();
        activity.record_request("1", "shell", None).unwrap();
        activity.reset();
        assert_eq!(activity.last_block_number(), None);
        let req = activity.record_request("2", "shell", None).unwrap();
        assert_eq!(req.number, 1);
    }

    #[test]
    fn is_finalizing_rules() {
        assert!(!is_finalizing(Some("running"), true));
        assert!(is_finalizing(Some("completed"), true));
        assert!(is_finalizing(Some("failed"), true));
        assert!(is_finalizing(None, false));
        assert!(!is_finalizing(None, true));
    }

    #[test]
    fn summarize_todos_counts_open_and_done() {
        let content = "- [ ] task one\n- [x] task two\n- [ ] task three";
        let summary = summarize_todos(content).expect("expected checkboxes");
        assert_eq!(summary.open, 2);
        assert_eq!(summary.done, 1);
    }

    #[test]
    fn summarize_todos_none_for_prose_without_checkboxes() {
        let content = "Just a plain status update.\nNo checkboxes here.";
        assert!(summarize_todos(content).is_none());
    }

    #[test]
    fn summarize_todos_handles_indented_items() {
        let content = "- [ ] parent\n  - [ ] child\n  - [X] done child";
        let summary = summarize_todos(content).expect("expected checkboxes");
        assert_eq!(summary.open, 2);
        assert_eq!(summary.done, 1);
    }

    #[test]
    fn summarize_todos_returns_first_three_open_items() {
        let content = "- [ ] one\n- [ ] two\n- [ ] three\n- [ ] four";
        let summary = summarize_todos(content).expect("expected checkboxes");
        assert_eq!(summary.open, 4);
        assert_eq!(summary.next_open, vec!["one", "two", "three"]);
    }
}
