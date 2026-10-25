//! The agent terminal drawer's TUI. React owns the agent (an assistant-ui
//! runtime on its own Theorem thread) and pushes the transcript in as JSON.
//! This crate draws it with Ratatui on Ratzilla's DOM backend, edits the
//! prompt line, and hands what the person asked for back as actions.
//!
//! Keys, paste and wheel arrive through `TerminalHandle` from a container
//! React keeps, not through Ratzilla's own key listener: the DOM backend
//! rebuilds its grid element when the size changes, which would drop a
//! listener attached to the old one.
//!
//! The crate runs its own frame loop instead of `draw_web`. Ratzilla 0.3.1's
//! DOM backend reports the window's size to Ratatui, not its grid's, so a
//! terminal smaller than the window draws past the grid. Here the viewport is
//! fixed to the grid the backend actually built.
//!
//! One crate serves both drawers: the bottom one mounts a single session, the
//! right one mounts with tabs, each tab its own agent thread.

use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use ratatui::{
    Frame, Terminal, TerminalOptions, Viewport,
    backend::Backend,
    layout::{Constraint, Layout, Position, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, BorderType, Borders, Paragraph, Tabs, Wrap},
};
use ratzilla::{
    DomBackend,
    backend::cell_sized::CellSized,
    event::{KeyCode, KeyEvent},
    web_sys::{self, Event, KeyboardEvent},
};
use serde::Deserialize;
use serde_json::json;
use tui_input::{Input, InputRequest};
use tui_markdown::{Options, StyleSheet};
use wasm_bindgen::prelude::*;

// pi's terminal slate; the drawer keeps it in every palette and mode.
const BG: Color = Color::Rgb(0x20, 0x27, 0x33);
const TOOL: Color = Color::Rgb(0x27, 0x32, 0x27);
const RAISED: Color = Color::Rgb(0x27, 0x30, 0x42);
const LINE: Color = Color::Rgb(0x3a, 0x44, 0x58);
const INK: Color = Color::Rgb(0xc8, 0xd0, 0xd8);
const BRIGHT: Color = Color::Rgb(0xe4, 0xea, 0xee);
const MUTED: Color = Color::Rgb(0x6c, 0x74, 0x7c);
const SAGE: Color = Color::Rgb(0x8a, 0xa8, 0xa0);
const GOLD: Color = Color::Rgb(0xd6, 0xbc, 0x8a);
const ERROR: Color = Color::Rgb(0xe0, 0x8a, 0x8f);

const SPINNER: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PROMPT: &str = "❯ ";
/// Transcript text sits under the prompt's text, not under its glyph.
const INDENT: &str = "  ";
const NOTICE_MS: f64 = 4000.0;
/// Columns at the right of the header bar left clear for the page's close button.
const CLOSE_COLUMNS: u16 = 4;
/// The hollow cursor's blink half-period; it holds solid this long after a key.
const BLINK_MS: f64 = 530.0;

/// Markdown in the terminal's colours instead of tui-markdown's ANSI defaults.
#[derive(Clone, Copy)]
struct Slate;

impl StyleSheet for Slate {
    fn heading(&self, level: u8) -> Style {
        match level {
            1 | 2 => Style::new().fg(GOLD).bold(),
            _ => Style::new().fg(GOLD),
        }
    }
    fn code(&self) -> Style {
        Style::new().fg(SAGE).bg(RAISED)
    }
    fn link(&self) -> Style {
        Style::new().fg(SAGE).underlined()
    }
    fn blockquote(&self) -> Style {
        Style::new().fg(MUTED).italic()
    }
    fn heading_meta(&self) -> Style {
        Style::new().fg(MUTED)
    }
    fn html(&self) -> Style {
        Style::new().fg(MUTED)
    }
    fn table_header(&self) -> Style {
        Style::new().fg(BRIGHT).bold()
    }
    fn table_border(&self) -> Style {
        Style::new().fg(LINE)
    }
    fn list_marker(&self) -> Style {
        Style::new().fg(MUTED)
    }
}

/// What React pushes in: the terminal thread's messages and run state.
#[derive(Deserialize, Default)]
#[serde(default)]
struct Snapshot {
    running: bool,
    project: String,
    error: Option<String>,
    /// The run's pending approval, answered with y or n.
    approval: Option<Approval>,
    messages: Vec<Message>,
}

#[derive(Deserialize)]
struct Approval {
    tool: String,
    summary: String,
}

#[derive(Deserialize)]
struct Message {
    role: String,
    parts: Vec<Part>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Part {
    Text {
        text: String,
    },
    Reasoning {
        text: String,
    },
    Tool {
        name: String,
        #[serde(default)]
        summary: String,
        /// running, complete, error or approval.
        #[serde(default)]
        status: String,
    },
    #[serde(other)]
    Other,
}

/// What the person asked for, handed back to React as JSON. Each names the
/// tab it came from; a single-session terminal has one tab.
enum Action {
    Submit(String),
    Cancel,
    Close,
    New,
    Approve(bool),
    NewTab,
    CloseTab,
    SelectTab,
}

impl Action {
    fn to_json(&self, tab: &str) -> String {
        match self {
            Action::Submit(text) => json!({ "type": "submit", "tab": tab, "text": text }),
            Action::Cancel => json!({ "type": "cancel", "tab": tab }),
            Action::Close => json!({ "type": "close", "tab": tab }),
            Action::New => json!({ "type": "new", "tab": tab }),
            Action::Approve(allow) => json!({ "type": "approve", "tab": tab, "allow": allow }),
            Action::NewTab => json!({ "type": "newTab", "tab": tab }),
            Action::CloseTab => json!({ "type": "closeTab", "tab": tab }),
            Action::SelectTab => json!({ "type": "selectTab", "tab": tab }),
        }
        .to_string()
    }
}

/// The tab list React keeps: ids in order, titles, and the one showing.
#[derive(Deserialize)]
struct TabList {
    tabs: Vec<TabEntry>,
    active: String,
}

#[derive(Deserialize)]
struct TabEntry {
    id: String,
    title: String,
}

/// What a click on the tab bar lands on.
#[derive(Clone, Copy)]
enum Hit {
    Select(usize),
    Close(usize),
    New,
}

fn own(text: Text<'_>) -> Vec<Line<'static>> {
    text.lines
        .into_iter()
        .map(|line| {
            Line::from(
                line.spans
                    .into_iter()
                    .map(|span| Span::styled(span.content.into_owned(), span.style))
                    .collect::<Vec<_>>(),
            )
            .style(line.style)
        })
        .collect()
}

fn indented(mut line: Line<'static>) -> Line<'static> {
    line.spans.insert(0, Span::raw(INDENT));
    line
}

fn now() -> f64 {
    js_sys::Date::now()
}

/// One tab: an agent thread's transcript and its own prompt line.
struct Session {
    id: String,
    title: String,
    /// Whether the terminal shows tabs, for the help list.
    tabbed: bool,
    snapshot: Snapshot,
    input: Input,
    /// Submitted prompts, oldest first, walked with Up and Down.
    history: Vec<String>,
    history_at: Option<usize>,
    /// Lines scrolled up from the bottom; zero follows new output.
    scroll_back: usize,
    /// Body height at the last draw, for paging.
    page: usize,
    help: bool,
    notice: Option<(String, f64)>,
    /// Transcript lines, rebuilt when the snapshot or the width changes.
    lines: Vec<Line<'static>>,
    built_for: Option<u16>,
}

impl Session {
    fn new(id: String, title: String, tabbed: bool) -> Self {
        Self {
            id,
            title,
            tabbed,
            snapshot: Snapshot::default(),
            input: Input::default(),
            history: Vec::new(),
            history_at: None,
            scroll_back: 0,
            page: 10,
            help: false,
            notice: None,
            lines: Vec::new(),
            built_for: None,
        }
    }

    fn set_state(&mut self, json: &str) -> Result<(), serde_json::Error> {
        self.snapshot = serde_json::from_str(json)?;
        self.built_for = None;
        Ok(())
    }

    fn notify(&mut self, text: impl Into<String>) {
        self.notice = Some((text.into(), now() + NOTICE_MS));
    }

    fn build(&mut self, width: u16) {
        let mut lines: Vec<Line<'static>> = Vec::new();
        let options = Options::new(Slate).table_width(width.saturating_sub(INDENT.len() as u16));

        for message in &self.snapshot.messages {
            if message.role == "user" {
                let text: String = message
                    .parts
                    .iter()
                    .filter_map(|part| match part {
                        Part::Text { text } => Some(text.as_str()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                for (index, row) in text.lines().enumerate() {
                    let lead = if index == 0 {
                        Span::styled(PROMPT, Style::new().fg(GOLD).bold())
                    } else {
                        Span::raw(INDENT)
                    };
                    lines.push(Line::from(vec![
                        lead,
                        Span::styled(row.to_owned(), Style::new().fg(BRIGHT)),
                    ]));
                }
                lines.push(Line::default());
                continue;
            }
            for part in &message.parts {
                match part {
                    Part::Text { text } => {
                        let rendered = tui_markdown::from_str_with_options(text, &options);
                        lines.extend(own(rendered).into_iter().map(indented));
                    }
                    Part::Reasoning { text } => {
                        let style = Style::new().fg(MUTED).add_modifier(Modifier::ITALIC);
                        lines.extend(
                            text.lines()
                                .map(|row| indented(Line::styled(row.to_owned(), style))),
                        );
                    }
                    Part::Tool {
                        name,
                        summary,
                        status,
                    } => lines.push(tool_row(name, summary, status, width)),
                    Part::Other => {}
                }
            }
            lines.push(Line::default());
        }

        if let Some(error) = &self.snapshot.error {
            lines.push(indented(Line::styled(
                format!("✗ {error}"),
                Style::new().fg(ERROR),
            )));
            lines.push(Line::default());
        }

        if self.help {
            let mut commands = vec![
                ("enter", "run it"),
                ("/new", "start a fresh thread here"),
                ("/help", "show or hide this list"),
                ("ctrl+c", "stop the run, or clear the prompt"),
                ("esc", "close the drawer"),
                ("↑ ↓", "walk earlier prompts"),
                ("pgup pgdn", "scroll the transcript"),
                ("alt+⌫", "delete a word"),
                ("y / n", "allow or deny a pending approval"),
            ];
            if self.tabbed {
                commands.extend([
                    ("ctrl+t", "open a tab"),
                    ("ctrl+w", "close this tab"),
                    ("ctrl+1-9", "go to a tab"),
                    ("ctrl+[ ]", "previous or next tab"),
                ]);
            }
            for (command, what) in commands {
                lines.push(indented(Line::from(vec![
                    Span::styled(format!("{command:<11}"), Style::new().fg(GOLD)),
                    Span::styled(what, Style::new().fg(MUTED)),
                ])));
            }
            lines.push(Line::default());
        }

        self.lines = lines;
        self.built_for = Some(width);
    }

    /// The single-session bar: what this is and where.
    fn header(&self) -> Line<'static> {
        let mut spans = vec![Span::styled(" ◆ agent", Style::new().fg(SAGE).bold())];
        if !self.snapshot.project.is_empty() {
            spans.push(Span::styled(
                format!(" · {}", self.snapshot.project),
                Style::new().fg(MUTED),
            ));
        }
        Line::from(spans)
    }

    fn draw_body(&mut self, frame: &mut Frame, area: Rect) {
        let inner = area.inner(ratatui::layout::Margin::new(1, 0));
        if self.built_for != Some(inner.width) {
            self.build(inner.width);
        }
        let paragraph = Paragraph::new(self.lines.clone()).wrap(Wrap { trim: false });
        let total = paragraph.line_count(inner.width);
        let height = inner.height as usize;
        self.page = height.saturating_sub(2).max(1);
        let max_back = total.saturating_sub(height);
        self.scroll_back = self.scroll_back.min(max_back);
        let top = (max_back - self.scroll_back).min(u16::MAX as usize) as u16;
        frame.render_widget(paragraph.scroll((top, 0)), inner);
    }

    fn draw_status(&mut self, frame: &mut Frame, area: Rect) {
        if self.notice.as_ref().is_some_and(|(_, until)| *until < now()) {
            self.notice = None;
        }
        let left = if let Some(approval) = &self.snapshot.approval {
            Line::from(vec![
                Span::styled(" ? ", Style::new().fg(GOLD).add_modifier(Modifier::BOLD)),
                Span::styled(format!("{} ", approval.tool), Style::new().fg(BRIGHT)),
                Span::styled(approval.summary.clone(), Style::new().fg(MUTED)),
            ])
        } else if self.snapshot.running {
            let frame_index = (now() / 80.0) as usize % SPINNER.len();
            Line::from(vec![
                Span::styled(format!(" {} ", SPINNER[frame_index]), Style::new().fg(GOLD)),
                Span::styled("working", Style::new().fg(MUTED)),
            ])
        } else if let Some((text, _)) = &self.notice {
            Line::styled(format!(" {text}"), Style::new().fg(GOLD))
        } else {
            Line::default()
        };
        frame.render_widget(left, area);
        let right = if self.snapshot.approval.is_some() {
            "y allow · n deny ".to_owned()
        } else if self.scroll_back > 0 {
            format!("↓ {} more · pgdn ", self.scroll_back)
        } else if self.snapshot.running {
            "ctrl+c stop ".to_owned()
        } else {
            String::new()
        };
        frame.render_widget(
            Line::styled(right, Style::new().fg(MUTED)).right_aligned(),
            area,
        );
    }

    /// Draws the prompt line and returns the cell its cursor sits on.
    fn draw_prompt(&self, frame: &mut Frame, area: Rect, focused: bool) -> Position {
        let block = Block::new()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .border_style(Style::new().fg(if focused { SAGE } else { LINE }));
        let inner = block.inner(area);
        frame.render_widget(block, area);

        let lead = PROMPT.chars().count() as u16 + 1;
        let width = inner.width.saturating_sub(lead) as usize;
        let scroll = self.input.visual_scroll(width);
        let text = Span::styled(
            self.input.value().chars().skip(scroll).collect::<String>(),
            Style::new().fg(BRIGHT),
        );
        frame.render_widget(
            Line::from(vec![
                Span::raw(" "),
                Span::styled(PROMPT, Style::new().fg(GOLD).bold()),
                text,
            ]),
            inner,
        );
        let column = (self.input.visual_cursor().saturating_sub(scroll)) as u16;
        Position::new(inner.x + lead + column, inner.y)
    }

    fn submit(&mut self) -> Option<Action> {
        let text = self.input.value().trim().to_owned();
        if text.is_empty() {
            return None;
        }
        if self.history.last() != Some(&text) {
            self.history.push(text.clone());
        }
        self.history_at = None;
        self.input.reset();
        self.scroll_back = 0;
        match text.as_str() {
            "/new" => Some(Action::New),
            "/help" => {
                self.help = !self.help;
                self.built_for = None;
                None
            }
            command if command.starts_with('/') && !command.contains(' ') => {
                self.notify(format!("{command} is not a command; /help lists them"));
                None
            }
            _ if self.snapshot.running => {
                self.input = Input::new(text);
                self.notify("wait for the run to finish, or ctrl+c to stop it");
                None
            }
            _ => Some(Action::Submit(text)),
        }
    }

    fn recall(&mut self, older: bool) {
        if self.history.is_empty() {
            return;
        }
        let next = match (self.history_at, older) {
            (None, true) => Some(self.history.len() - 1),
            (None, false) => return,
            (Some(0), true) => Some(0),
            (Some(at), true) => Some(at - 1),
            (Some(at), false) if at + 1 < self.history.len() => Some(at + 1),
            (Some(_), false) => None,
        };
        self.history_at = next;
        self.input = Input::new(next.map(|at| self.history[at].clone()).unwrap_or_default());
    }

    /// Returns whether the key was the terminal's, so React can keep it from the page.
    fn key(&mut self, event: KeyEvent) -> (bool, Option<Action>) {
        let KeyEvent { code, ctrl, alt, .. } = event;
        let edit = |input: &mut Input, request| {
            input.handle(request);
        };
        let action = match code {
            KeyCode::Enter => self.submit(),
            KeyCode::Esc => Some(Action::Close),
            KeyCode::Char('c') if ctrl => {
                if self.snapshot.running {
                    Some(Action::Cancel)
                } else {
                    self.input.reset();
                    None
                }
            }
            KeyCode::Char('a') if ctrl => {
                edit(&mut self.input, InputRequest::GoToStart);
                None
            }
            KeyCode::Char('e') if ctrl => {
                edit(&mut self.input, InputRequest::GoToEnd);
                None
            }
            KeyCode::Char('u') if ctrl => {
                edit(&mut self.input, InputRequest::DeleteFromStart);
                None
            }
            KeyCode::Char('k') if ctrl => {
                edit(&mut self.input, InputRequest::DeleteTillEnd);
                None
            }
            KeyCode::Char('l') if ctrl => {
                self.scroll_back = 0;
                None
            }
            KeyCode::Char(_) if ctrl => return (false, None),
            KeyCode::Char(c @ ('y' | 'n'))
                if self.snapshot.approval.is_some() && self.input.value().is_empty() =>
            {
                Some(Action::Approve(c == 'y'))
            }
            KeyCode::Char(c) => {
                edit(&mut self.input, InputRequest::InsertChar(c));
                self.history_at = None;
                None
            }
            KeyCode::Backspace if alt || ctrl => {
                edit(&mut self.input, InputRequest::DeletePrevWord);
                None
            }
            KeyCode::Backspace => {
                edit(&mut self.input, InputRequest::DeletePrevChar);
                None
            }
            KeyCode::Delete => {
                edit(&mut self.input, InputRequest::DeleteNextChar);
                None
            }
            KeyCode::Left if alt => {
                edit(&mut self.input, InputRequest::GoToPrevWord);
                None
            }
            KeyCode::Right if alt => {
                edit(&mut self.input, InputRequest::GoToNextWord);
                None
            }
            KeyCode::Left => {
                edit(&mut self.input, InputRequest::GoToPrevChar);
                None
            }
            KeyCode::Right => {
                edit(&mut self.input, InputRequest::GoToNextChar);
                None
            }
            KeyCode::Home => {
                edit(&mut self.input, InputRequest::GoToStart);
                None
            }
            KeyCode::End => {
                edit(&mut self.input, InputRequest::GoToEnd);
                None
            }
            KeyCode::Up => {
                self.recall(true);
                None
            }
            KeyCode::Down => {
                self.recall(false);
                None
            }
            KeyCode::PageUp => {
                self.scroll_back += self.page;
                None
            }
            KeyCode::PageDown => {
                self.scroll_back = self.scroll_back.saturating_sub(self.page);
                None
            }
            // Focus stays in the terminal, as in a real one.
            KeyCode::Tab => None,
            _ => return (false, None),
        };
        (true, action)
    }

    fn paste(&mut self, text: &str) {
        for c in text.chars() {
            let c = if c == '\n' || c == '\r' || c == '\t' { ' ' } else { c };
            self.input.handle(InputRequest::InsertChar(c));
        }
        self.history_at = None;
    }
}

fn tool_row(name: &str, summary: &str, status: &str, width: u16) -> Line<'static> {
    let (glyph, color) = match status {
        "complete" => ("✓", SAGE),
        "error" => ("✗", ERROR),
        "approval" => ("?", GOLD),
        _ => ("◌", GOLD),
    };
    let lead = format!("{INDENT}{glyph} ");
    let used = lead.chars().count() + name.chars().count() + 2;
    let room = (width as usize).saturating_sub(used);
    let mut summary: String = summary.replace('\n', " ");
    if summary.chars().count() > room {
        summary = summary.chars().take(room.saturating_sub(1)).collect::<String>() + "…";
    }
    let fill = (width as usize).saturating_sub(used + summary.chars().count());
    Line::from(vec![
        Span::styled(lead, Style::new().fg(color)),
        Span::styled(name.to_owned(), Style::new().fg(BRIGHT).bold()),
        Span::raw("  "),
        Span::styled(summary, Style::new().fg(MUTED)),
        Span::raw(" ".repeat(fill)),
    ])
    .style(Style::new().bg(TOOL))
}

/// The terminal's tabs, one session each, and what spans them: focus, the
/// tab bar's click targets and the prompt cursor. A single-session terminal
/// has one tab and draws its header in place of the bar.
struct App {
    tabbed: bool,
    sessions: Vec<Session>,
    active: usize,
    focused: bool,
    /// The last key or focus, so the cursor holds solid while typing.
    typed_at: f64,
    /// The prompt cursor's cell at the last draw.
    cursor: Option<Position>,
    /// The backend's cell size in CSS pixels, for clicks and the cursor.
    cell: (f32, f32),
    /// Tab bar targets at the last draw: start and end columns on `tab_row`.
    hits: Vec<(u16, u16, Hit)>,
    tab_row: u16,
    /// The prompt's area at the last draw, the one place that takes typing.
    prompt: Rect,
}

impl App {
    fn new(tabbed: bool) -> Self {
        Self {
            tabbed,
            sessions: Vec::new(),
            active: 0,
            focused: false,
            typed_at: 0.0,
            cursor: None,
            cell: (0.0, 0.0),
            hits: Vec::new(),
            tab_row: 0,
            prompt: Rect::default(),
        }
    }

    /// Takes React's tab list, keeping each surviving tab's prompt and scroll.
    fn set_tabs(&mut self, json: &str) -> Result<(), serde_json::Error> {
        let list: TabList = serde_json::from_str(json)?;
        let tabbed = self.tabbed;
        let mut old = std::mem::take(&mut self.sessions);
        self.sessions = list
            .tabs
            .into_iter()
            .map(|entry| match old.iter().position(|s| s.id == entry.id) {
                Some(at) => {
                    let mut session = old.swap_remove(at);
                    session.title = entry.title;
                    session
                }
                None => Session::new(entry.id, entry.title, tabbed),
            })
            .collect();
        self.active = self
            .sessions
            .iter()
            .position(|s| s.id == list.active)
            .unwrap_or(0);
        Ok(())
    }

    fn set_state(&mut self, tab: &str, json: &str) -> Result<(), serde_json::Error> {
        match self.sessions.iter_mut().find(|s| s.id == tab) {
            Some(session) => session.set_state(json),
            None => Ok(()),
        }
    }

    fn tab(&self, index: usize, action: Action) -> Option<(Action, String)> {
        self.sessions.get(index).map(|s| (action, s.id.clone()))
    }

    fn draw(&mut self, frame: &mut Frame) {
        let area = frame.area();
        frame.render_widget(Block::new().style(Style::new().bg(BG).fg(INK)), area);
        let [header, body, status, prompt] = Layout::vertical([
            Constraint::Length(2),
            Constraint::Fill(1),
            Constraint::Length(1),
            Constraint::Length(3),
        ])
        .areas(area);

        let block = Block::new()
            .borders(Borders::BOTTOM)
            .border_style(Style::new().fg(LINE));
        let bar = block.inner(header);
        frame.render_widget(block, header);
        // The bar's last columns stay clear for the page's close button.
        if self.tabbed {
            self.draw_tabs(frame, Rect { width: bar.width.saturating_sub(CLOSE_COLUMNS), ..bar });
        } else if let Some(session) = self.sessions.get(self.active) {
            frame.render_widget(session.header(), bar);
        }

        self.cursor = None;
        self.prompt = prompt;
        let Some(session) = self.sessions.get_mut(self.active) else {
            return;
        };
        session.draw_body(frame, body);
        session.draw_status(frame, status);
        self.cursor = Some(session.draw_prompt(frame, prompt, self.focused));
    }

    /// The tab bar: Ratatui's Tabs, with a spinner on running tabs, a close
    /// mark on the active one and a trailing tab that opens another.
    fn draw_tabs(&mut self, frame: &mut Frame, area: Rect) {
        let spin = SPINNER[(now() / 80.0) as usize % SPINNER.len()];
        let mut titles: Vec<Line<'static>> = self
            .sessions
            .iter()
            .enumerate()
            .map(|(index, session)| {
                let mut spans = Vec::new();
                if session.snapshot.approval.is_some() {
                    spans.push(Span::styled("? ", Style::new().fg(GOLD)));
                } else if session.snapshot.running {
                    spans.push(Span::styled(format!("{spin} "), Style::new().fg(GOLD)));
                }
                let mut title: String = session.title.chars().take(18).collect();
                if session.title.chars().count() > 18 {
                    title.pop();
                    title.push('…');
                }
                spans.push(Span::raw(title));
                if index == self.active {
                    spans.push(Span::styled(" ×", Style::new().fg(MUTED)));
                }
                Line::from(spans)
            })
            .collect();
        titles.push(Line::raw("+"));

        // The same walk Tabs makes: padding, title, padding, then a divider
        // between titles.
        self.hits.clear();
        self.tab_row = area.y;
        let last = titles.len() - 1;
        let mut x = area.x;
        for (index, title) in titles.iter().enumerate() {
            let start = x;
            x += title.width() as u16 + 2;
            if index == last {
                self.hits.push((start, x, Hit::New));
            } else if index == self.active {
                self.hits.push((start, x - 2, Hit::Select(index)));
                self.hits.push((x - 2, x, Hit::Close(index)));
            } else {
                self.hits.push((start, x, Hit::Select(index)));
            }
            x += 1;
        }

        frame.render_widget(
            Tabs::new(titles)
                .select(self.active)
                .style(Style::new().fg(MUTED))
                .highlight_style(Style::new().fg(BRIGHT).add_modifier(Modifier::BOLD))
                .divider(Span::styled("│", Style::new().fg(LINE)))
                .padding(" ", " "),
            area,
        );
    }

    /// Tab keys first, then the active session's.
    fn key(&mut self, event: KeyEvent) -> (bool, Option<(Action, String)>) {
        self.typed_at = now();
        let count = self.sessions.len();
        if count == 0 {
            return (false, None);
        }
        if self.tabbed && event.ctrl {
            let action = match event.code {
                KeyCode::Char('t') => self.tab(self.active, Action::NewTab),
                KeyCode::Char('w') => self.tab(self.active, Action::CloseTab),
                KeyCode::Char(c @ '1'..='9') => self.tab(c as usize - '1' as usize, Action::SelectTab),
                KeyCode::Char('[') => self.tab((self.active + count - 1) % count, Action::SelectTab),
                KeyCode::Char(']') => self.tab((self.active + 1) % count, Action::SelectTab),
                _ => None,
            };
            if action.is_some() {
                return (true, action);
            }
        }
        let session = &mut self.sessions[self.active];
        let (handled, action) = session.key(event);
        (handled, action.map(|action| (action, session.id.clone())))
    }

    /// A press at CSS pixels from the terminal's top left.
    /// The cell under a point in CSS pixels from the terminal's top left.
    fn cell_at(&self, x: f64, y: f64) -> Option<Position> {
        let (width, height) = self.cell;
        if width <= 0.0 || height <= 0.0 || x < 0.0 || y < 0.0 {
            return None;
        }
        Some(Position::new(
            (x / f64::from(width)) as u16,
            (y / f64::from(height)) as u16,
        ))
    }

    /// The tab bar target under a point, if any.
    fn hit_at(&self, x: f64, y: f64) -> Option<Hit> {
        let cell = self.cell_at(x, y)?;
        if !self.tabbed || cell.y != self.tab_row {
            return None;
        }
        self.hits
            .iter()
            .find(|(start, end, _)| (*start..*end).contains(&cell.x))
            .map(|(_, _, hit)| *hit)
    }

    /// The CSS cursor for a point: a pointer over the tab bar's targets, a
    /// text cursor over the prompt, and the arrow everywhere else.
    fn cursor_at(&self, x: f64, y: f64) -> &'static str {
        if self.hit_at(x, y).is_some() {
            "pointer"
        } else if self.cell_at(x, y).is_some_and(|cell| self.prompt.contains(cell)) {
            "text"
        } else {
            "default"
        }
    }

    fn click(&self, x: f64, y: f64) -> Option<(Action, String)> {
        match self.hit_at(x, y)? {
            Hit::Select(index) => self.tab(index, Action::SelectTab),
            Hit::Close(index) => self.tab(index, Action::CloseTab),
            Hit::New => self.tab(self.active, Action::NewTab),
        }
    }
}

/// The mounted terminal. React calls these from its own event handlers.
#[wasm_bindgen]
pub struct TerminalHandle {
    app: Rc<RefCell<App>>,
    on_action: js_sys::Function,
}

#[wasm_bindgen]
impl TerminalHandle {
    fn emit(&self, action: Option<(Action, String)>) {
        if let Some((action, tab)) = action {
            let _ = self
                .on_action
                .call1(&JsValue::NULL, &JsValue::from_str(&action.to_json(&tab)));
        }
    }

    /// Replaces the tabs with React's list (JSON `{tabs: [{id, title}], active}`).
    pub fn set_tabs(&self, json: &str) -> Result<(), JsValue> {
        self.app
            .borrow_mut()
            .set_tabs(json)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    /// Replaces a tab's transcript with React's latest snapshot (JSON).
    pub fn set_state(&self, tab: &str, json: &str) -> Result<(), JsValue> {
        self.app
            .borrow_mut()
            .set_state(tab, json)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    /// Handles a keydown; true when the terminal used it.
    pub fn key(&self, event: KeyboardEvent) -> bool {
        // The borrow ends before React hears the action, which may set state.
        let (handled, action) = self.app.borrow_mut().key(event.into());
        self.emit(action);
        handled
    }

    /// Handles a press at CSS pixels from the terminal's top left.
    pub fn click(&self, x: f64, y: f64) {
        let action = self.app.borrow().click(x, y);
        self.emit(action);
    }

    /// The CSS cursor for a point in CSS pixels from the terminal's top left.
    pub fn cursor(&self, x: f64, y: f64) -> String {
        self.app.borrow().cursor_at(x, y).to_owned()
    }

    pub fn paste(&self, text: &str) {
        let mut app = self.app.borrow_mut();
        app.typed_at = now();
        let active = app.active;
        if let Some(session) = app.sessions.get_mut(active) {
            session.paste(text);
        }
    }

    /// Scrolls the transcript; positive is towards newer output.
    pub fn scroll(&self, lines: i32) {
        let mut app = self.app.borrow_mut();
        let active = app.active;
        if let Some(session) = app.sessions.get_mut(active) {
            session.scroll_back = if lines < 0 {
                session.scroll_back + lines.unsigned_abs() as usize
            } else {
                session.scroll_back.saturating_sub(lines as usize)
            };
        }
    }

    pub fn set_focused(&self, focused: bool) {
        let mut app = self.app.borrow_mut();
        app.focused = focused;
        app.typed_at = now();
    }
}

/// The Ratatui terminal on the backend's grid, kept the grid's size.
struct Screen {
    terminal: Terminal<DomBackend>,
    parent: web_sys::Element,
    window: web_sys::Window,
    /// The parent's size in cells at the last frame.
    measured: (u16, u16),
    /// Set by the window's resize event, on which the backend rebuilds its grid blank.
    rebuilt: Rc<Cell<bool>>,
    _on_resize: Closure<dyn FnMut()>,
    /// A hollow block over the prompt's cursor cell. Ratzilla's cursors are
    /// a filled block or an underline, neither blinking, so the screen draws
    /// its own on top of the grid.
    cursor: web_sys::Element,
    cursor_style: String,
}

impl Screen {
    fn new(parent_id: &str) -> Result<Self, JsValue> {
        let error = |e: &dyn std::fmt::Display| JsValue::from_str(&e.to_string());
        let window = web_sys::window().ok_or("no window")?;
        let document = window.document().ok_or("no document")?;
        let parent = document
            .get_element_by_id(parent_id)
            .ok_or("no terminal element")?;
        let cursor = document.create_element("div")?;
        cursor.set_attribute("aria-hidden", "true")?;
        let backend = DomBackend::new_by_id(parent_id).map_err(|e| error(&e))?;
        let terminal = Terminal::with_options(
            backend,
            TerminalOptions {
                viewport: Viewport::Fixed(Rect::default()),
            },
        )
        .map_err(|e| error(&e))?;
        let rebuilt = Rc::new(Cell::new(true));
        let flag = rebuilt.clone();
        let on_resize = Closure::<dyn FnMut()>::new(move || flag.set(true));
        window.add_event_listener_with_callback("resize", on_resize.as_ref().unchecked_ref())?;
        Ok(Self {
            terminal,
            parent,
            window,
            measured: (0, 0),
            rebuilt,
            _on_resize: on_resize,
            cursor,
            cursor_style: String::new(),
        })
    }

    fn send_resize(&self) {
        if let Ok(event) = Event::new("resize") {
            let _ = self.window.dispatch_event(&event);
        }
    }

    fn frame(&mut self, app: &mut App) -> std::io::Result<()> {
        let (cell_w, cell_h) = self.terminal.backend().cell_size_css_px();
        app.cell = (cell_w, cell_h);
        let rect = self.parent.get_bounding_client_rect();
        let measured = (
            (rect.width() / f64::from(cell_w)) as u16,
            (rect.height() / f64::from(cell_h)) as u16,
        );
        // A closed drawer is display: none; nothing to draw until it opens.
        if measured.0 == 0 || measured.1 == 0 {
            self.measured = measured;
            return Ok(());
        }
        if measured != self.measured {
            self.measured = measured;
            // The drawer resized without the window; the backend only
            // rebuilds its grid on the window's resize event.
            self.send_resize();
        }
        if self.rebuilt.replace(false) {
            // An empty draw lets the backend rebuild and measure its grid;
            // the viewport then takes that size and the next draw is whole.
            self.terminal.resize(Rect::default())?;
            // It re-measures only a grid already on the page, and the first
            // was measured while the closed drawer had no size, so a first
            // build is drawn twice.
            if !self.parent.has_child_nodes() {
                self.terminal.draw(|_| {})?;
                self.send_resize();
                self.rebuilt.set(false);
            }
            self.terminal.draw(|_| {})?;
            let size = self.terminal.backend_mut().window_size()?.columns_rows;
            self.terminal.resize(Rect::new(0, 0, size.width, size.height))?;
        }
        let area = self.terminal.get_frame().area();
        if area.width > 0 && area.height > 0 {
            self.terminal.draw(|frame| app.draw(frame))?;
        }
        self.place_cursor(app);
        Ok(())
    }

    /// Moves the hollow cursor to the prompt: blinking while focused, solid
    /// for a beat after each key, steady and dim while unfocused.
    fn place_cursor(&mut self, app: &App) {
        // A rebuild empties the parent, cursor included.
        if !self.cursor.is_connected() {
            let _ = self.parent.append_child(&self.cursor);
        }
        let style = match app.cursor {
            Some(at) => {
                let lit = !app.focused || ((now() - app.typed_at) / BLINK_MS) as u64 % 2 == 0;
                let color = match (lit, app.focused) {
                    (false, _) => "transparent",
                    (true, true) => "#8aa8a0",
                    (true, false) => "#6c747c",
                };
                let (width, height) = app.cell;
                format!(
                    "position:absolute;pointer-events:none;box-sizing:border-box;\
                     border:1px solid {color};left:{}px;top:{}px;width:{width}px;height:{height}px",
                    f32::from(at.x) * width,
                    f32::from(at.y) * height,
                )
            }
            None => "display:none".to_owned(),
        };
        if style != self.cursor_style {
            let _ = self.cursor.set_attribute("style", &style);
            self.cursor_style = style;
        }
    }
}

impl Drop for Screen {
    /// The window outlives the screen; its listener must not call a freed closure.
    fn drop(&mut self) {
        let _ = self.window.remove_event_listener_with_callback(
            "resize",
            self._on_resize.as_ref().unchecked_ref(),
        );
    }
}

/// Draws a frame on every animation frame until the element leaves the page.
fn run_frames(mut screen: Screen, app: Rc<RefCell<App>>) {
    let next: Rc<RefCell<Option<Closure<dyn FnMut()>>>> = Rc::new(RefCell::new(None));
    let scheduled = next.clone();
    *next.borrow_mut() = Some(Closure::new(move || {
        if !screen.parent.is_connected() {
            // Dropping the closure ends the loop and frees the terminal.
            scheduled.borrow_mut().take();
            return;
        }
        if let Err(error) = screen.frame(&mut app.borrow_mut()) {
            web_sys::console::error_1(&JsValue::from_str(&format!("terminal: {error}")));
        }
        if let Some(callback) = scheduled.borrow().as_ref() {
            let _ = screen
                .window
                .request_animation_frame(callback.as_ref().unchecked_ref());
        }
    }));
    if let (Some(window), Some(callback)) = (web_sys::window(), next.borrow().as_ref()) {
        let _ = window.request_animation_frame(callback.as_ref().unchecked_ref());
    }
}

/// Mounts the terminal into the element with `parent_id`, which it fills and
/// which must be positioned (the cursor sits on it absolutely). `tabbed` draws
/// a tab bar; without it the terminal shows its one tab's header. Tabs come
/// from `set_tabs`. `on_action` receives each action as a JSON string. Frames
/// run until the element leaves the page; mount once per element.
#[wasm_bindgen]
pub fn mount(
    parent_id: &str,
    tabbed: bool,
    on_action: js_sys::Function,
) -> Result<TerminalHandle, JsValue> {
    let screen = Screen::new(parent_id)?;
    let app = Rc::new(RefCell::new(App::new(tabbed)));
    run_frames(screen, app.clone());
    Ok(TerminalHandle { app, on_action })
}
