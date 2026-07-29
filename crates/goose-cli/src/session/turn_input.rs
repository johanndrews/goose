//! Keeps a prompt on screen while the agent is working.
//!
//! Between turns rustyline owns the terminal. During a turn nobody did, so
//! keystrokes landed in the terminal's buffer, scattered through the agent's
//! output. This reads them instead: the typed line is redrawn below whatever
//! the agent prints, and Enter queues it for when the turn ends.
//!
//! The reader polls with a timeout so it can be told to stop mid-wait — which
//! is what makes room for the modal prompts a turn can raise (tool approval,
//! elicitation): they need the terminal to themselves, so the reader steps
//! aside and hands raw mode back for as long as they run.

use crossterm::event::{
    self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyCode, KeyEvent, KeyEventKind,
    KeyModifiers,
};
use crossterm::terminal;
use std::io::{IsTerminal, Write};
use std::sync::{Condvar, Mutex, MutexGuard, OnceLock};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const POLL_INTERVAL: Duration = Duration::from_millis(40);
const PROMPT: &str = "> ";

/// What the user typed while the turn was running.
pub(super) struct Pending {
    /// Lines submitted with Enter, oldest first.
    pub queued: Vec<String>,
    /// A line that was still being typed when the turn ended.
    pub partial: String,
}

#[derive(Default)]
struct State {
    line: String,
    queued: Vec<String>,
    /// Set once the user types, so the thinking spinner can be dropped.
    typed: bool,
    running: bool,
    stopping: bool,
    /// Modal prompts hold this above zero while they own the terminal.
    paused: usize,
    /// The reader holds raw mode.
    in_raw: bool,
    /// The prompt is currently on screen.
    prompt_shown: bool,
    /// The prompt had to open a line of its own because the agent's last write
    /// did not end in a newline.
    prompt_below: bool,
    /// That unfinished output line, kept so it can be put back when the prompt
    /// above it is erased.
    tail: String,
    /// Ctrl+<this> inserts a line break, as at the editor prompt.
    newline_key: char,
}

struct Shared {
    state: Mutex<State>,
    /// Signals the reader that pause/stop changed.
    wake: Condvar,
    /// Signals waiters that the reader released raw mode.
    released: Condvar,
}

fn shared() -> &'static Shared {
    static SHARED: OnceLock<Shared> = OnceLock::new();
    SHARED.get_or_init(|| Shared {
        state: Mutex::new(State::default()),
        wake: Condvar::new(),
        released: Condvar::new(),
    })
}

/// Starts reading input for the duration of a turn. Does nothing when the
/// terminal is not interactive, in which case output keeps its old path.
///
/// `carried_over` is text the user had typed but not sent when the previous
/// turn ended, so a half-written thought survives across turns.
#[must_use = "dropping the reader ends the turn's input phase immediately"]
pub(super) fn start(cancel: CancellationToken, carried_over: String) -> Reader {
    if !std::io::stdin().is_terminal() || !std::io::stdout().is_terminal() {
        return Reader;
    }

    let carried_something_over = !carried_over.is_empty();
    {
        let mut state = shared().state.lock().unwrap();
        if state.running {
            return Reader;
        }
        *state = State {
            running: true,
            typed: carried_something_over,
            line: carried_over,
            newline_key: super::input::get_newline_key(),
            ..State::default()
        };
    }

    // The spinner and the prompt share the last terminal line, so a carried
    // over prompt means the spinner has to go right away.
    if carried_something_over {
        super::output::hide_thinking();
    }

    std::thread::spawn(move || read_loop(cancel));
    Reader
}

/// Puts the terminal back if a turn ends by unwinding instead of returning.
pub(super) struct Reader;

impl Drop for Reader {
    fn drop(&mut self) {
        finish();
    }
}

/// Ends the turn's input phase and returns what the user typed. Idempotent, so
/// the guard above can call it again on the way out.
pub(super) fn finish() -> Pending {
    let shared = shared();
    let mut state = shared.state.lock().unwrap();
    if !state.running {
        return Pending {
            queued: Vec::new(),
            partial: String::new(),
        };
    }

    state.stopping = true;
    shared.wake.notify_all();
    while state.running {
        state = shared.released.wait(state).unwrap();
    }

    Pending {
        queued: std::mem::take(&mut state.queued),
        partial: std::mem::take(&mut state.line),
    }
}

/// Hands the terminal to a modal prompt until the guard is dropped.
pub(super) fn pause_for_prompt() -> PausedForPrompt {
    let shared = shared();
    let mut state = shared.state.lock().unwrap();
    state.paused += 1;
    shared.wake.notify_all();
    while state.running && state.in_raw {
        state = shared.released.wait(state).unwrap();
    }
    PausedForPrompt
}

pub(super) struct PausedForPrompt;

impl Drop for PausedForPrompt {
    fn drop(&mut self) {
        let shared = shared();
        let mut state = shared.state.lock().unwrap();
        state.paused = state.paused.saturating_sub(1);
        shared.wake.notify_all();
    }
}

/// Claims the terminal for one write, taking the prompt off screen first and
/// putting it back afterwards. Returns `None` when the reader does not hold
/// the terminal, in which case callers print the way they always have.
pub(crate) fn hold_output() -> Option<OutputHold> {
    let shared = shared();
    let mut state = shared.state.lock().unwrap();
    if !state.in_raw {
        return None;
    }
    hide_prompt(&mut state);
    Some(OutputHold { state })
}

pub(crate) struct OutputHold {
    state: MutexGuard<'static, State>,
}

impl OutputHold {
    pub(crate) fn write_line(&mut self, text: &str) {
        write_output(&mut self.state, text);
        write_output(&mut self.state, "\n");
    }

    pub(crate) fn write_raw(&mut self, text: &str) {
        write_output(&mut self.state, text);
    }
}

impl Drop for OutputHold {
    fn drop(&mut self) {
        show_prompt(&mut self.state);
    }
}

fn read_loop(cancel: CancellationToken) {
    let shared = shared();

    loop {
        {
            let mut state = shared.state.lock().unwrap();
            if state.stopping {
                release_terminal(&mut state);
                state.running = false;
                shared.released.notify_all();
                return;
            }
            if state.paused > 0 {
                if state.in_raw {
                    release_terminal(&mut state);
                    shared.released.notify_all();
                }
                let _unused = shared
                    .wake
                    .wait_while(state, |s| s.paused > 0 && !s.stopping)
                    .unwrap();
                continue;
            }
            if !state.in_raw && terminal::enable_raw_mode().is_ok() {
                let mut out = std::io::stdout().lock();
                let _ = crossterm::execute!(out, EnableBracketedPaste);
                drop(out);
                state.in_raw = true;
                // A modal prompt just wrote to the terminal, so whatever was
                // on the line before it is gone.
                state.tail.clear();
                show_prompt(&mut state);
            }
        }

        match event::poll(POLL_INTERVAL) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(_) => {
                let mut state = shared.state.lock().unwrap();
                release_terminal(&mut state);
                state.running = false;
                shared.released.notify_all();
                return;
            }
        }

        let event = match event::read() {
            Ok(event) => event,
            Err(_) => continue,
        };

        let mut state = shared.state.lock().unwrap();
        if !state.in_raw {
            continue;
        }
        let was_typing = state.typed;
        let mut interrupt = Interrupt::No;
        match event {
            Event::Key(key) if key.kind != KeyEventKind::Release => {
                interrupt = apply_key(&mut state, key);
            }
            Event::Paste(text) => {
                state.line.push_str(&text);
                state.typed = true;
                refresh_prompt(&mut state);
            }
            Event::Resize(_, _) => refresh_prompt(&mut state),
            _ => {}
        }
        let took_over_the_line = state.typed && !was_typing;
        drop(state);

        if took_over_the_line {
            super::output::hide_thinking();
        }
        if interrupt == Interrupt::Yes {
            cancel.cancel();
        }
    }
}

#[derive(PartialEq)]
enum Interrupt {
    Yes,
    No,
}

fn apply_key(state: &mut State, key: KeyEvent) -> Interrupt {
    let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
    match key.code {
        KeyCode::Char('c') if ctrl => {
            // Matches the editor: the first Ctrl+C drops what was typed, and
            // only an empty line interrupts the agent.
            if state.line.is_empty() {
                return Interrupt::Yes;
            }
            state.line.clear();
            refresh_prompt(state);
        }
        KeyCode::Char('u') if ctrl => {
            state.line.clear();
            refresh_prompt(state);
        }
        KeyCode::Char('w') if ctrl => {
            let trimmed = state.line.trim_end();
            let cut = trimmed.rfind(' ').map_or(0, |i| i + 1);
            state.line.truncate(cut);
            refresh_prompt(state);
        }
        // The same key that inserts a line break at the editor prompt.
        KeyCode::Char(c) if ctrl && c == state.newline_key => {
            state.line.push('\n');
            state.typed = true;
            refresh_prompt(state);
        }
        KeyCode::Char(c) if !ctrl && !key.modifiers.contains(KeyModifiers::ALT) => {
            state.line.push(c);
            state.typed = true;
            refresh_prompt(state);
        }
        KeyCode::Backspace => {
            state.line.pop();
            refresh_prompt(state);
        }
        KeyCode::Enter => {
            let line = std::mem::take(&mut state.line);
            if line.trim().is_empty() {
                refresh_prompt(state);
                return Interrupt::No;
            }
            hide_prompt(state);
            let receipt = format!(
                "  {}",
                console::style(format!("⤷ queued: {}", single_line(&line))).dim()
            );
            write_output(state, &receipt);
            write_output(state, "\n");
            state.queued.push(line);
            show_prompt(state);
        }
        _ => {}
    }
    Interrupt::No
}

/// Writes agent output, tracking how far along the current line it leaves the
/// cursor. Raw mode does not turn a newline into a carriage return, so line
/// breaks have to spell it out.
fn write_output(state: &mut State, text: &str) {
    if state.in_raw {
        write_now(&text.replace('\n', "\r\n"));
    }
    match text.rsplit_once('\n') {
        Some((_, after_last_break)) => {
            state.tail.clear();
            state.tail.push_str(after_last_break);
        }
        None => state.tail.push_str(text),
    }
}

fn show_prompt(state: &mut State) {
    if !state.in_raw || state.line.is_empty() || state.prompt_shown {
        return;
    }

    let width = terminal_width();
    if !state.tail.is_empty() {
        // The prompt needs a line of its own, and erasing it later means
        // stepping back up onto a line this cannot rebuild if it wrapped.
        if console::measure_text_width(&state.tail) + 1 >= width {
            return;
        }
        write_now("\r\n");
        state.prompt_below = true;
    }
    state.prompt_shown = true;
    draw_prompt_line(state);
}

fn hide_prompt(state: &mut State) {
    if !state.prompt_shown {
        return;
    }
    if state.prompt_below {
        // Erase the prompt, step back up, and put the unfinished line back so
        // the cursor sits where the output left it.
        write_now(&format!("\r\x1b[2K\x1b[A\r{}", state.tail));
    } else {
        write_now("\r\x1b[2K");
    }
    state.prompt_shown = false;
    state.prompt_below = false;
}

fn refresh_prompt(state: &mut State) {
    if state.line.is_empty() {
        hide_prompt(state);
    } else if state.prompt_shown {
        draw_prompt_line(state);
    } else {
        show_prompt(state);
    }
}

fn draw_prompt_line(state: &State) {
    let budget = terminal_width().saturating_sub(PROMPT.len() + 1);
    write_now(&format!(
        "\r\x1b[2K{}{}",
        PROMPT,
        last_chars(&single_line(&state.line), budget)
    ));
}

fn terminal_width() -> usize {
    terminal::size().map_or(80, |(w, _)| w as usize)
}

fn write_now(text: &str) {
    let mut out = std::io::stdout().lock();
    let _ = out.write_all(text.as_bytes());
    let _ = out.flush();
}

fn release_terminal(state: &mut State) {
    if !state.in_raw {
        return;
    }
    hide_prompt(state);
    let mut out = std::io::stdout().lock();
    let _ = crossterm::execute!(out, DisableBracketedPaste);
    drop(out);
    let _ = terminal::disable_raw_mode();
    state.in_raw = false;
}

/// The prompt owns exactly one terminal line, so pasted newlines are shown as
/// spaces. The queued text keeps them.
fn single_line(text: &str) -> String {
    text.replace(['\n', '\r'], " ")
}

/// Keeps the end of the line visible — that is where the cursor is.
fn last_chars(text: &str, budget: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= budget {
        return text.to_string();
    }
    chars[chars.len() - budget..].iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn press(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    fn ctrl(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::CONTROL)
    }

    fn typed(text: &str) -> State {
        State {
            line: text.to_string(),
            newline_key: 'j',
            ..State::default()
        }
    }

    #[test]
    fn ctrl_j_inserts_a_line_break_instead_of_sending() {
        let mut state = typed("first");

        apply_key(&mut state, ctrl('j'));
        apply_key(&mut state, press(KeyCode::Char('x')));

        assert_eq!(state.line, "first\nx");
        assert!(state.queued.is_empty());
    }

    #[test]
    fn enter_queues_the_line_and_clears_the_prompt() {
        let mut state = typed("run the tests");

        apply_key(&mut state, press(KeyCode::Enter));

        assert_eq!(state.queued, vec!["run the tests".to_string()]);
        assert!(state.line.is_empty());
    }

    #[test]
    fn enter_on_an_empty_line_queues_nothing() {
        let mut state = typed("   ");

        apply_key(&mut state, press(KeyCode::Enter));

        assert!(state.queued.is_empty());
    }

    #[test]
    fn ctrl_c_clears_the_line_before_it_interrupts() {
        let mut state = typed("half a thought");

        assert!(apply_key(&mut state, ctrl('c')) == Interrupt::No);
        assert!(state.line.is_empty());
        assert!(apply_key(&mut state, ctrl('c')) == Interrupt::Yes);
    }

    #[test]
    fn ctrl_w_removes_the_last_word() {
        let mut state = typed("cargo test ");

        apply_key(&mut state, ctrl('w'));

        assert_eq!(state.line, "cargo ");
    }

    #[test]
    fn typing_records_that_the_prompt_is_in_use() {
        let mut state = State::default();

        apply_key(&mut state, press(KeyCode::Char('h')));
        apply_key(&mut state, press(KeyCode::Char('i')));

        assert_eq!(state.line, "hi");
        assert!(state.typed);
    }

    #[test]
    fn backspace_on_an_empty_line_is_harmless() {
        let mut state = State::default();

        apply_key(&mut state, press(KeyCode::Backspace));

        assert!(state.line.is_empty());
    }

    #[test]
    fn output_tracks_the_unfinished_line() {
        let mut state = State::default();

        write_output(&mut state, "done\nstill ");
        assert_eq!(state.tail, "still ");

        write_output(&mut state, "going");
        assert_eq!(state.tail, "still going");

        write_output(&mut state, " and done\n");
        assert!(state.tail.is_empty());
    }

    #[test]
    fn the_prompt_stays_off_a_line_it_could_not_restore() {
        let mut state = State {
            in_raw: true,
            line: "typing".to_string(),
            tail: "x".repeat(terminal_width()),
            ..State::default()
        };

        show_prompt(&mut state);

        assert!(!state.prompt_shown);
    }

    #[test]
    fn last_chars_keeps_the_end_of_a_long_line() {
        assert_eq!(last_chars("abcdef", 3), "def");
        assert_eq!(last_chars("ab", 5), "ab");
    }

    #[test]
    fn pasted_newlines_are_shown_on_one_line() {
        assert_eq!(single_line("a\nb\r\nc"), "a b  c");
    }
}
