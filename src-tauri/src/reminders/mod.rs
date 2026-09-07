//! Reminder delivery.
//!
//! A reminder is stored in frontmatter as a local wall-clock instant, in the most readable
//! form that carries the user's intent:
//!
//! ```text
//! reminder: 2026-09-10          # date only — fires at DEFAULT_HOUR
//! reminder: 2026-09-10T15:30    # an explicit time
//! ```
//!
//! There is deliberately no timezone. A reminder is a note to yourself at a wall-clock
//! time; if you fly to another country, "remind me at 09:00" still means 09:00 where you
//! are, not 09:00 in the zone you wrote it in.
use crate::db::Index;
use crate::domain::PendingReminder;
use crate::errors::Result;
use chrono::{Duration, Local, NaiveDateTime, TimeDelta};

/// When a date-only reminder fires. Morning, so "remind me tomorrow" lands at the start of
/// the day rather than at midnight, which is nobody's idea of tomorrow.
pub const DEFAULT_HOUR: u32 = 9;

/// A reminder further past its time than this is swept without a notification. Markdown is
/// canonical and hand-writable, so a user can drop in — or import — a folder of files with
/// reminders long past; toasting every one of them would be a notification storm about
/// things that already happened. The value stays visible on the document either way.
pub const STALE_AFTER_HOURS: i64 = 24;

/// Notifications sent per poll, so even a same-day backlog trickles instead of flooding.
/// The rest stay pending and go out on the next poll.
pub const MAX_PER_POLL: usize = 5;

/// The instant a stored reminder should fire, or `None` if the value is not a shape we
/// understand — an unparseable reminder is left alone rather than guessed at or dropped.
pub fn fire_at(reminder: &str) -> Option<NaiveDateTime> {
    let value = reminder.trim();
    if value.is_empty() {
        return None;
    }
    // Hand-written frontmatter may use a space instead of "T", and may or may not carry
    // seconds. Accept all of it; only ever *write* "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM".
    let normalized = value.replacen(' ', "T", 1);
    for format in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"] {
        if let Ok(parsed) = NaiveDateTime::parse_from_str(&normalized, format) {
            return Some(parsed);
        }
    }
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .and_then(|date| date.and_hms_opt(DEFAULT_HOUR, 0, 0))
}

/// What to do with each pending reminder at `now`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    /// Not yet due, or unparseable.
    Wait,
    /// Due: notify, then record it so it fires once.
    Notify,
    /// Long past: record it without notifying.
    Sweep,
}

pub fn classify(reminder: &str, now: NaiveDateTime) -> Delivery {
    let Some(at) = fire_at(reminder) else {
        return Delivery::Wait;
    };
    if at > now {
        return Delivery::Wait;
    }
    if now - at > Duration::hours(STALE_AFTER_HOURS) {
        Delivery::Sweep
    } else {
        Delivery::Notify
    }
}

/// How a due reminder reads in the notification body.
pub fn describe(reminder: &str, now: NaiveDateTime) -> String {
    let Some(at) = fire_at(reminder) else {
        return "Reminder".into();
    };
    let same_day = at.date() == now.date();
    let stamp = if reminder.trim().len() <= 10 {
        // Date-only: naming DEFAULT_HOUR back to the user would be inventing a precision
        // they never asked for.
        at.format("%b %-d").to_string()
    } else if same_day {
        at.format("%-I:%M %p").to_string()
    } else {
        at.format("%b %-d, %-I:%M %p").to_string()
    };
    format!("Reminder · {stamp}")
}

/// The reminders to act on now, in the order they should be handled: soonest-overdue last,
/// so a capped poll deals with the oldest first.
pub fn selection(
    pending: Vec<PendingReminder>,
    now: NaiveDateTime,
) -> (Vec<PendingReminder>, Vec<PendingReminder>) {
    let mut due: Vec<_> = pending
        .into_iter()
        .filter_map(|r| match classify(&r.reminder_at, now) {
            Delivery::Wait => None,
            action => Some((action, r)),
        })
        .collect();
    due.sort_by(|a, b| fire_at(&a.1.reminder_at).cmp(&fire_at(&b.1.reminder_at)));

    let mut notify = Vec::new();
    let mut sweep = Vec::new();
    for (action, reminder) in due {
        match action {
            Delivery::Sweep => sweep.push(reminder),
            // Over the cap, the rest simply stay pending for the next poll.
            Delivery::Notify if notify.len() < MAX_PER_POLL => notify.push(reminder),
            _ => {}
        }
    }
    (notify, sweep)
}

pub fn now() -> NaiveDateTime {
    Local::now().naive_local()
}

/// How long until the next reminder is worth checking. Kept as a helper so the poll
/// interval has one home.
pub const fn poll_interval() -> TimeDelta {
    TimeDelta::seconds(30)
}

/// Delivers everything due at `moment`: notifies, then records what it handled.
///
/// Ordering is deliberate — notify first, record second. A crash in between can re-notify
/// on the next poll, whereas recording first would lose a reminder outright if the
/// notification failed, and a duplicate is a far smaller failure than a silence.
///
/// Takes the index and a notifier rather than an `AppHandle` so the orchestration is
/// testable without a running Tauri app. Returns how many notifications were sent.
pub fn run_once(
    index: &Index,
    moment: NaiveDateTime,
    mut notify: impl FnMut(&PendingReminder, String),
) -> Result<usize> {
    let (to_notify, to_sweep) = selection(index.pending_reminders()?, moment);
    if to_notify.is_empty() && to_sweep.is_empty() {
        return Ok(0);
    }
    for reminder in &to_notify {
        notify(reminder, describe(&reminder.reminder_at, moment));
    }
    let stamp = moment.format("%Y-%m-%dT%H:%M:%S").to_string();
    for reminder in to_notify.iter().chain(to_sweep.iter()) {
        // One failed record must not strand the rest: the worst case is that this
        // particular reminder notifies again next poll.
        if let Err(error) =
            index.mark_reminder_delivered(&reminder.id, &reminder.reminder_at, &stamp)
        {
            eprintln!(
                "Couldn't record reminder delivery for {}: {error}",
                reminder.id
            );
        }
    }
    Ok(to_notify.len())
}

/// The title a notification shows. Falls back the same way the document list does.
pub fn notification_title(reminder: &PendingReminder) -> &str {
    let title = reminder.title.trim();
    if title.is_empty() {
        "Untitled"
    } else {
        title
    }
}

/// One poll: reads the workspace index and shows any notifications now due.
///
/// The session lock is held across the notifications. They are capped at
/// [`MAX_PER_POLL`] and each is a fast local IPC, so the brief wait a document command
/// might see is a better trade than releasing and re-acquiring the lock — which would
/// leave a window where the workspace closes between notifying and recording, and the
/// same reminders fire again next poll.
#[cfg(feature = "desktop")]
pub fn deliver_due(app: &tauri::AppHandle) {
    use crate::commands::AppState;
    use tauri::Manager;
    use tauri_plugin_notification::NotificationExt;

    let state = app.state::<AppState>();
    let Ok(guard) = state.0.lock() else { return };
    let Some(session) = guard.as_ref() else {
        return;
    };

    let sent = run_once(&session.index, now(), |reminder, body| {
        if let Err(error) = app
            .notification()
            .builder()
            .title(notification_title(reminder))
            .body(body)
            .show()
        {
            eprintln!("Couldn't show reminder for {}: {error}", reminder.id);
        }
    });
    if let Err(error) = sent {
        eprintln!("Couldn't read pending reminders: {error}");
    }
}

/// Starts the poll loop. A plain thread rather than an async task, because the work is one
/// indexed query against a blocking SQLite connection.
#[cfg(feature = "desktop")]
pub fn spawn_watcher(app: tauri::AppHandle) {
    let interval = poll_interval()
        .to_std()
        .unwrap_or(std::time::Duration::from_secs(30));
    std::thread::spawn(move || {
        // A short first delay lets the workspace finish opening, so reminders that came
        // due while the app was closed are delivered promptly on launch rather than after
        // a full interval.
        std::thread::sleep(std::time::Duration::from_secs(5));
        loop {
            deliver_due(&app);
            std::thread::sleep(interval);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M").unwrap()
    }

    fn pending(id: &str, reminder_at: &str) -> PendingReminder {
        PendingReminder {
            id: id.into(),
            title: id.into(),
            reminder_at: reminder_at.into(),
        }
    }

    #[test]
    fn a_date_only_reminder_fires_in_the_morning_not_at_midnight() {
        assert_eq!(fire_at("2026-09-10"), Some(at("2026-09-10T09:00")));
    }

    #[test]
    fn an_explicit_time_is_taken_literally() {
        assert_eq!(fire_at("2026-09-10T15:30"), Some(at("2026-09-10T15:30")));
        assert_eq!(fire_at("2026-09-10T00:00"), Some(at("2026-09-10T00:00")));
    }

    /// Frontmatter is hand-writable, so the parser has to be generous about shape even
    /// though Sonata only ever writes two of these.
    #[test]
    fn hand_written_shapes_are_accepted() {
        assert_eq!(fire_at("2026-09-10 15:30"), Some(at("2026-09-10T15:30")));
        assert_eq!(
            fire_at("2026-09-10T15:30:45").map(|d| d.format("%H:%M:%S").to_string()),
            Some("15:30:45".to_string())
        );
        assert_eq!(fire_at("  2026-09-10  "), Some(at("2026-09-10T09:00")));
    }

    #[test]
    fn an_unparseable_reminder_never_fires_rather_than_being_guessed_at() {
        assert_eq!(fire_at(""), None);
        assert_eq!(fire_at("next tuesday"), None);
        assert_eq!(fire_at("2026-13-45"), None);
        assert_eq!(fire_at("tomorrow at 3"), None);
    }

    #[test]
    fn a_future_reminder_waits() {
        assert_eq!(
            classify("2026-09-10T15:30", at("2026-09-10T15:29")),
            Delivery::Wait
        );
    }

    #[test]
    fn a_reminder_fires_once_its_time_has_come() {
        assert_eq!(
            classify("2026-09-10T15:30", at("2026-09-10T15:30")),
            Delivery::Notify
        );
        assert_eq!(
            classify("2026-09-10T15:30", at("2026-09-10T23:59")),
            Delivery::Notify
        );
    }

    /// The case that matters for a Markdown-canonical app: importing files whose reminders
    /// are long past must not produce a notification per file.
    #[test]
    fn a_long_past_reminder_is_swept_without_notifying() {
        assert_eq!(
            classify("2026-09-10T15:30", at("2026-09-12T15:31")),
            Delivery::Sweep
        );
        // Exactly on the boundary still notifies; only strictly older is swept.
        assert_eq!(
            classify("2026-09-10T15:30", at("2026-09-11T15:30")),
            Delivery::Notify
        );
    }

    #[test]
    fn a_poll_notifies_the_oldest_first_and_leaves_the_rest_pending() {
        let now = at("2026-09-10T12:00");
        let pending: Vec<_> = (0..8)
            .map(|i| pending(&format!("d{i}"), &format!("2026-09-10T{:02}:00", 11 - i)))
            .collect();

        let (notify, sweep) = selection(pending, now);
        assert!(sweep.is_empty());
        assert_eq!(notify.len(), MAX_PER_POLL);
        // Oldest (04:00, the largest i) first.
        assert_eq!(notify[0].id, "d7");
        assert_eq!(notify[4].id, "d3");
    }

    #[test]
    fn a_poll_separates_what_to_notify_from_what_to_sweep() {
        let now = at("2026-09-10T12:00");
        let (notify, sweep) = selection(
            vec![
                pending("fresh", "2026-09-10T11:00"),
                pending("ancient", "2026-01-01T09:00"),
                pending("future", "2026-09-10T18:00"),
                pending("nonsense", "someday"),
            ],
            now,
        );
        assert_eq!(
            notify.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(),
            vec!["fresh"]
        );
        assert_eq!(
            sweep.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(),
            vec!["ancient"]
        );
    }

    #[test]
    fn the_notification_body_names_the_time_the_user_actually_set() {
        let now = at("2026-09-10T15:31");
        assert_eq!(describe("2026-09-10T15:30", now), "Reminder · 3:30 PM");
        // Date-only: do not invent a precision the user never asked for.
        assert_eq!(describe("2026-09-10", now), "Reminder · Sep 10");
        assert_eq!(
            describe("2026-09-09T08:05", now),
            "Reminder · Sep 9, 8:05 AM"
        );
    }

    fn seeded(reminders: &[(&str, &str)]) -> Index {
        let index = Index::open(std::path::Path::new(":memory:")).unwrap();
        for (id, reminder) in reminders {
            let mut doc = crate::markdown::new_document(
                format!("tasks/{id}.md"),
                crate::domain::DocumentType::Task,
                (*id).to_string(),
                String::new(),
            );
            doc.id = (*id).to_string();
            doc.reminder = Some((*reminder).to_string());
            doc.content_hash = Some("hash".into());
            index.upsert(&doc).unwrap();
        }
        index
    }

    /// Records the notified ids, and asserts nothing was recorded as delivered before its
    /// notification went out — a mark-then-notify ordering would lose reminders whenever
    /// the notification failed.
    fn deliver(index: &Index, now: NaiveDateTime) -> Vec<String> {
        let mut notified = Vec::new();
        run_once(index, now, |reminder, _body| {
            assert!(
                index
                    .pending_reminders()
                    .unwrap()
                    .iter()
                    .any(|p| p.id == reminder.id),
                "{} was recorded before it was notified",
                reminder.id
            );
            notified.push(reminder.id.clone());
        })
        .unwrap();
        notified
    }

    #[test]
    fn a_due_reminder_notifies_once_and_then_stays_quiet() {
        let index = seeded(&[("call", "2026-09-10T15:30")]);
        let now = at("2026-09-10T15:31");

        assert_eq!(deliver(&index, now), vec!["call".to_string()]);
        // Second poll, same reminder: nothing.
        assert!(deliver(&index, at("2026-09-10T16:00")).is_empty());
    }

    #[test]
    fn a_future_reminder_is_left_alone_entirely() {
        let index = seeded(&[("later", "2026-09-10T18:00")]);
        assert!(deliver(&index, at("2026-09-10T12:00")).is_empty());
        // Still pending, so it can fire when its time comes.
        assert_eq!(index.pending_reminders().unwrap().len(), 1);
        assert_eq!(
            deliver(&index, at("2026-09-10T18:00")),
            vec!["later".to_string()]
        );
    }

    /// The import case: a folder of Markdown with long-past reminders must be retired
    /// quietly rather than producing a notification per file.
    #[test]
    fn a_stale_backlog_is_retired_without_notifying() {
        let index = seeded(&[("old1", "2026-01-01T09:00"), ("old2", "2026-02-01T09:00")]);
        assert!(deliver(&index, at("2026-09-10T12:00")).is_empty());
        // Retired, not merely skipped, so they never come back.
        assert!(index.pending_reminders().unwrap().is_empty());
    }

    #[test]
    fn a_same_day_burst_is_capped_and_the_rest_wait_for_the_next_poll() {
        let seeds: Vec<(String, String)> = (0..7)
            .map(|i| (format!("d{i}"), format!("2026-09-10T{:02}:00", 4 + i)))
            .collect();
        let refs: Vec<(&str, &str)> = seeds
            .iter()
            .map(|(a, b)| (a.as_str(), b.as_str()))
            .collect();
        let index = seeded(&refs);
        let now = at("2026-09-10T12:00");

        let first = deliver(&index, now);
        assert_eq!(first.len(), MAX_PER_POLL);
        // Oldest first.
        assert_eq!(first[0], "d0");

        let second = deliver(&index, now);
        assert_eq!(second, vec!["d5".to_string(), "d6".to_string()]);
        assert!(deliver(&index, now).is_empty());
    }

    #[test]
    fn a_reminder_moved_forward_notifies_again_at_its_new_time() {
        let index = seeded(&[("call", "2026-09-10T15:30")]);
        assert_eq!(
            deliver(&index, at("2026-09-10T15:31")),
            vec!["call".to_string()]
        );

        // The user pushes it back an hour.
        let index = {
            let mut doc = index.get("call").unwrap();
            doc.reminder = Some("2026-09-10T16:30".into());
            index.upsert(&doc).unwrap();
            index
        };
        assert_eq!(
            deliver(&index, at("2026-09-10T16:31")),
            vec!["call".to_string()]
        );
    }

    #[test]
    fn the_notification_carries_the_document_title() {
        let reminder = PendingReminder {
            id: "01ABC".into(),
            title: "  Call the dentist  ".into(),
            reminder_at: "2026-09-10T15:30".into(),
        };
        assert_eq!(notification_title(&reminder), "Call the dentist");
        assert_eq!(
            notification_title(&PendingReminder {
                title: "   ".into(),
                ..reminder
            }),
            "Untitled"
        );
    }
}
