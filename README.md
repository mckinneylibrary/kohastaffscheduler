# Staff Scheduler — Koha plugin

`Koha::Plugin::Com::LibSched::StaffScheduler`

A library staff scheduling tool that runs **inside Koha** as a tool plugin. It
manages branch hours, task‑zone assignments, recurring shifts, breaks, teams,
closures, and daily timeline views across multiple locations. Staff, branches,
and holidays are read directly from Koha — **no external database is required.**

The plugin bundles a single‑page React app and serves both the app and its JSON
API through Koha's `plugins/run.pl` dispatcher.

---

## Table of contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Upgrading](#upgrading)
- [Uninstalling](#uninstalling)
- [Features](#features)
- [Scheduling model](#scheduling-model)
- [Permissions](#permissions)
- [Data model](#data-model)
- [SQL report templates](#sql-report-templates)
- [Troubleshooting](#troubleshooting)
- [Version history](#version-history)

---

## Requirements

- A Koha install with the **plugin system enabled**
  (`<enable_plugins>1</enable_plugins>` in `koha-conf.xml`).
- Staff users whose patron category has the **Use tool plugins**
  permission (`tools.plugins_tool`).
- Superlibrarian access for any user who will manage branches, zones, teams,
  roles, closures, or edit branch hours.

The plugin runs on hosted Koha (e.g. ByWater) as well as self‑hosted installs.
On hosted Koha it tunnels mutations through `GET` requests to work around the
intranet auth/WAF layer; see the [version history](#version-history) for the
specifics.

---

## Installation

1. Download the packaged plugin file. It is distributed as a `.kpz`
   (a renamed ZIP archive). If you received a `.zip`, **rename it to `.kpz`**
   before uploading.
2. In the Koha staff client go to
   **Administration → Manage plugins → Upload plugin**.
3. Choose the `.kpz` file and upload it.
4. From the plugins list, **run the install / setup step** for Staff Scheduler.
   This creates the plugin's tables (see [Data model](#data-model)).
5. Open the tool from the plugins list to launch the scheduler.

Make sure the staff who will use it have the **Use tool plugins** permission
(**Patrons → set permissions → Tools → Use tool plugins**).

---

## Upgrading

Upload the newer `.kpz` over the existing install (same
**Upload plugin** flow). The install step is **idempotent** — it uses
`CREATE TABLE IF NOT EXISTS` and additive `ALTER`s, so existing data is
preserved and schema changes are applied safely.

The bundled app URL embeds the plugin version, so a real upgrade busts the
browser cache automatically. If the tool HTML itself looks stale right after an
upgrade, hard‑refresh the tab (Ctrl/Cmd‑Shift‑R).

---

## Uninstalling

Removing the plugin via **Manage plugins** drops the plugin's own tables. Koha's
core tables (`borrowers`, `branches`, holidays, etc.) are **never** modified by
this plugin, so uninstalling leaves your catalog and patron data untouched.

---

## Features

The tool has five pages:

- **Dashboard** — daily timeline per staff member. Filter by role, team, branch,
  and zone, plus a searchable multi‑select "Specific Employees" picker. Click a
  block to edit it; superlibrarians can add shifts inline and copy a task‑zone
  assignment to other staff on the same day.
- **Schedule** — batch‑create Branch Hours or Task‑Zone assignments for many
  staff at once (searchable multi‑select), with optional recurrence. Each
  employee is validated independently; skipped slots are summarised.
- **Staff** — staff directory with an inline per‑employee schedule calendar
  (week / month view).
- **Reports** — coverage variance, zone utilization, a daily headcount heatmap,
  and the audit log.
- **Settings** — manage branches, virtual branches, work zones, staff roles,
  department teams, and closures / holidays. Includes **Backup & Restore**:
  export every entity to CSV, download a one‑click backup `.zip` (CSVs plus a
  self‑contained, printable offline schedule that opens in any browser with no
  internet), and re‑upload edited assignment / zone / team CSVs with a
  preview of every create / update / skip before anything is saved. The app
  also saves a fresh backup automatically once per day.

---

## Scheduling model

- **Two shift types:**
  - **Branch Hours** (`is_base_shift = 1`, linked to a Koha branch via
    `location_id`) — when a staff member is working at a branch.
  - **Task Zones** (`is_base_shift = 0`, linked to a zone via `zone_id`) —
    duties *within* a branch‑hours window. A task zone **must** nest inside an
    existing Branch Hours shift for the same employee on the same day.
- **Branch‑bound zones.** A zone may belong to a branch. A branch‑bound zone is
  only assignable when the staff member's wrapping Branch Hours are at that
  branch; a global zone is assignable anywhere.
- **Virtual branches / "Out".** A virtual branch is an away / override state
  (e.g. Out, Vacation, Training, Meeting). Assigning one as a base shift clears
  that day's **overlapping** assignments for the staff member. Built‑in **Out**
  (`__OUT__`) is always excluded from Reports totals; custom virtual branches
  each carry a `counts_toward_total` toggle.
- **Breaks / lunch.** A zone flagged as a break schedules like a task zone but is
  excluded from task‑zone totals and deducted from branch‑hour totals in
  Reports.
- **Teams.** Staff can be grouped into department teams and filtered by team.
  Team membership lives in the plugin's own tables — **borrower records are never
  altered.**
- **Recurrence.** Recurring shifts share a `series_id`; edits and deletes can
  apply to a single shift or to all future shifts in the series. Recurring task
  zones silently skip dates that lack wrapping Branch Hours (e.g. closures).
- **Audit log.** Every create / update / delete is written to the audit table.

---

## Permissions

- **Use the scheduler:** patron category needs **Use tool plugins**
  (`tools.plugins_tool`).
- **Superlibrarian‑only writes:** managing branches, virtual branches, zones,
  roles, teams, closures, and **all Branch‑Hours edits** require superlibrarian.
- **Self‑service:** non‑admin staff can create and modify only their **own**
  task zones; every mutation is checked server‑side and audited.

---

## Data model

The install step creates these tables (all prefixed `koha_plugin_staffsched_`):

| Table | Purpose |
| --- | --- |
| `assignments` | Branch‑hours + task‑zone shifts (the core schedule) |
| `zones` | Work zones (with a break flag and optional branch binding) |
| `virtual_branches` | Custom away states (Out, Vacation, …) + `counts_toward_total` |
| `teams` | Department teams |
| `staff_teams` | Staff → team membership (one team per staff) |
| `branch_colors` | Per‑branch display colour overrides |
| `audit` | Append‑only audit log of every mutation |

Key columns on `koha_plugin_staffsched_assignments`: `id`, `employee_id`
(Koha `borrowernumber`), `zone_id`, `location_id` (Koha `branchcode`, or
`__OUT__` / a virtual‑branch id), `shift_date`, `start_time`, `end_time`,
`is_base_shift`, `series_id`, `custom_label`, `notes`.

---

## SQL report templates

You can build dashboards in **Reports → Create from SQL** in Koha. Edit branch
codes to match your install (look them up under **Administration → Libraries**).
The `<<…|date>>` syntax produces runtime date prompts.

**Total branch hours per staff member in a date range** (excludes "Out"):

```sql
SELECT  b.surname, b.firstname,
        ROUND(SUM(TIME_TO_SEC(TIMEDIFF(a.end_time, a.start_time)))/3600, 2) AS hours
FROM    koha_plugin_staffsched_assignments a
JOIN    borrowers b ON b.borrowernumber = a.employee_id
WHERE   a.is_base_shift = 1
  AND   a.location_id <> '__OUT__'
  AND   a.shift_date BETWEEN <<From|date>> AND <<To|date>>
GROUP BY a.employee_id
ORDER BY b.surname, b.firstname;
```

**Weekly headcount heatmap** (one row per date, a column per branch):

```sql
SELECT
    a.shift_date,
    SUM(CASE WHEN a.location_id = 'MAIN'   THEN 1 ELSE 0 END) AS main,
    SUM(CASE WHEN a.location_id = 'BRANCH' THEN 1 ELSE 0 END) AS branch
FROM   koha_plugin_staffsched_assignments a
WHERE  a.is_base_shift = 1
  AND  a.location_id  <> '__OUT__'
  AND  a.shift_date BETWEEN <<Week start|date>>
                        AND DATE_ADD(<<Week start|date>>, INTERVAL 6 DAY)
GROUP  BY a.shift_date
ORDER  BY a.shift_date;
```

> Edit the `CASE WHEN a.location_id = '…'` lines to match your actual branch
> codes.

**Audit log for a date range:**

```sql
SELECT  au.created_at, au.changed_by, au.action_type, au.details
FROM    koha_plugin_staffsched_audit au
WHERE   au.created_at BETWEEN <<From|date>> AND <<To|date>>
ORDER BY au.created_at DESC;
```

---

## Troubleshooting

**"Access denied" page when a non‑superlibrarian opens the tool**
Make sure that user's patron category has **Use tool plugins**
(`tools.plugins_tool`) enabled under **Patrons → Permissions**.

**"Couldn't load some scheduler data" red banner**
The banner lists which endpoints failed and shows the HTTP status,
content‑type, byte count, and a preview. The most common causes are expired
Koha sessions (log out and back in) and missing tables (re‑run the plugin
install).

**Stale UI after upgrade**
Hard‑refresh the scheduler tab (Ctrl/Cmd‑Shift‑R). The bundle URL includes the
plugin version so a real upgrade busts the cache, but the *tool HTML* itself can
sit in browser cache for a short window.

**Branch‑hour vs. task‑zone confusion**
A task zone *must* sit inside an existing branch‑hour window for the same
employee on the same day. If you can't create a task zone at a given time, check
that the employee has a branch‑hour shift covering that time first.

**Setting someone to "Out" wiped other assignments**
This is intentional — Out (and any virtual branch) is a sentinel that means
"not working at a real desk for this window". It clears that day's overlapping
assignments to keep the calendar consistent. The change is logged in the audit
table.

---

## Version history

- **1.0.29** — Three scheduling quality-of-life improvements. (1) Editing or
  deleting a **repeating** shift from the Dashboard now asks whether the change
  applies to just that one occurrence or to this shift and all following shifts
  in the series — matching the choice already offered on the Schedule page;
  one-off shifts save and delete with no extra prompt. (2) A **Keep my view**
  checkbox on the Dashboard remembers your filters and selected date between
  visits; untick it to stop remembering and clear the saved view. (3) The
  **Upcoming Shifts Roster** on the Schedule page can now be filtered by
  employee and by date, and only shows today's and future shifts — past dates
  are hidden.
- **1.0.28** — Fixed the Dashboard **Zone** filter. Filtering by one or more
  zones now shows *only* the staff who actually have a Task Zone assignment in
  one of those zones on the day in view — previously anyone who simply had
  Branch Hours that day still appeared. When a Branch filter is combined with a
  Zone filter, the matching zone must also fall within the selected branch.
- **1.0.27** — Drag to move & resize shifts on the Dashboard timeline. Grab a
  shift body to slide it to a new time (its length is preserved), or drag the
  left/right edge to make it shorter or longer — everything snaps to 15‑minute
  steps. Superlibrarians can also drag a **Task Zone** straight up or down onto
  another staff member's row to reassign it. A plain click still opens the edit
  window; only a deliberate drag moves a shift. Every drag is checked against
  the same rules as the edit form (no same‑type overlaps, task zones must stay
  within Branch Hours, branch‑bound zones, closed days) and a Branch Hours block
  cannot be moved or shrunk if doing so would leave one of its Task Zones
  stranded — an invalid drop snaps back and explains why. Staff can only drag
  their own Task Zones; superlibrarians can drag anything, Branch Hours included.
  Each drag edits just that one shift and is audit‑logged like any other change.
- **1.0.26** — Backup, restore & offline view (Settings › Backup & Restore,
  superlibrarians only). Export every entity to its own CSV, or download a
  single backup `.zip` bundling all CSVs plus a self‑contained, printable
  **offline schedule** (an HTML file with the data inlined — opens in any
  browser with no internet, ideal when the network or Koha is down). Re‑upload
  an edited **assignments**, **zones** or **teams** CSV: rows are matched by id
  (update) or by name (create), validated against the overlap / nesting /
  branch rules, and shown as a create / update / skip **preview** before
  commit. Imports are additive — they never delete. A once‑per‑day automatic
  backup runs in the background for superlibrarians so the latest schedule is
  always saved to disk. (Staff, branches and closures are owned by Koha, so
  they are exported for reference but cannot be re‑imported.)
- **1.0.25** — No more overlapping shifts of the same type. A staff member can no
  longer be given two **Branch Hours** that overlap (whether at the same branch
  or different branches), and likewise cannot have two **Task Zones** overlapping
  the same time. In other words each point in the day holds at most one Branch
  Hours shift and one Task Zone. (Task zones still nest inside branch hours — that
  pairing is expected; only same-type overlaps are blocked.) Enforced everywhere
  shifts are created or edited: the Dashboard add/edit/clone flows and the
  Schedule batch-create and edit flows (the batch summary now reports any slots
  skipped for "conflicting with an existing task zone").
- **1.0.24** — Current-hour highlight on the Dashboard. When the Dashboard is
  showing **today**, the column for the current hour is highlighted with an amber
  band across the header and every staff row (and the hour label is brightened),
  making it easy to see "where we are right now" at a glance. The highlight
  refreshes automatically each minute and disappears when viewing other dates.
- **1.0.23** — Resizable Dashboard staff column. The vertical divider between the
  staff-name column and the timeline can now be dragged left/right to widen or
  narrow the name column, so long names (e.g. "Charlotte McD…") can be shown in
  full. The chosen width is remembered per browser; double-click the divider to
  reset it to the default.
- **1.0.22** — Dashboard defaults to *your* branch, plus staff sorting.
  1. **Branch-scoped default view.** When a staff member opens the Dashboard, it
     now defaults to showing only the people working at **their logged-in branch**
     for that day (the `me` endpoint now returns the user's `home_branch` from
     Koha's `userenv`). A "Showing staff at … — Show all staff" banner lets them
     drop the scope, and the Branches filter still lets them pick other branches.
  2. **Sortable staff list.** A Sort control on the Dashboard orders the staff
     rows by **Last name** (default), **First name**, or **Team**.
- **1.0.21** — Fixed marking a staff member **"Out"** (or any virtual branch)
  failing with a `404 [text/html] … errorpage.tt` error when they had overlapping
  task zones. The server's OUT override already deletes the overlapping zones, then
  the client deleted the same now-gone rows; the plugin's HTTP 404 for the missing
  row was rewritten by hosted Koha's Apache `ErrorDocument` into the HTML error
  page. Single deletes are now idempotent (a missing row is a `204` no-op), and the
  client no longer issues the redundant deletes in Koha mode.
- **1.0.20** — Fixed non-superlibrarian staff seeing a blank screen / "Failed to
  load module script ... MIME type text/html". The React bundle (`index.js` /
  `index.css`) was served via `method=asset`, which Koha gates behind
  `plugins.manage` (superlibrarian-only) — so ordinary staff got Koha's HTML
  access-denied page where the browser expected JavaScript. Assets now route
  through `method=tool` (like the API already does), which rides on the "Use
  tool plugins" permission, so all staff can load the scheduler.
- **1.0.19** — Virtual branches.
  1. **"Out" no longer counts toward total branch hours.** Reports excludes any
     hours scheduled at a virtual branch from gross branch-hour totals and the
     daily headcount heatmap.
  2. **Custom virtual branches.** Superlibrarians can add/edit/delete extra
     virtual branches in Settings → Branches (e.g. Vacation, Training, Meeting),
     each with a "counts toward total" toggle. Assigning a virtual branch as a
     base shift clears that day's overlapping shifts for the staff member (the
     same away-state behavior as the built-in **Out**). Stored in the new
     `koha_plugin_staffsched_virtual_branches` table. Note: `install()` widens
     `koha_plugin_staffsched_assignments.location_id` to `VARCHAR(36)` to hold
     virtual-branch UUID ids — existing installs upgrade idempotently.
- **1.0.18** — Fixed an intermittent "Koha API error 404 (errorpage.tt)" when
  saving certain edits (e.g. marking a staff member's branch to **Out**).
  Mutations tunnel the request body as base64 in the URL; standard base64 can
  contain `/`, which becomes `%2F` once URL-encoded, and Apache's default
  `AllowEncodedSlashes Off` rejects such URLs with a 404 before the request
  ever reaches the plugin. The body is now encoded as URL-safe base64
  (base64url), so no `%2F` is ever produced.
- **1.0.17** — Three scheduling upgrades:
  1. **Branch-bound zones.** A work zone can now belong to a branch (set in
     Settings → Work Zones). A branch-bound task zone is only assignable when
     the staff member's wrapping Branch Hours are at that branch; zones left as
     "All branches" stay global. Enforced on the Dashboard and Schedule pages.
  2. **Schedule many staff at once.** The Schedule (batch) page employee picker
     is now a searchable multi-select. Each selected employee is validated
     independently (closures, conflicts, wrapping Branch Hours, zone branch)
     and skipped slots are summarised after creating.
  3. **Copy an assignment to other staff.** Editing a task zone on the
     Dashboard now offers a "Copy to other staff" picker (superlibrarians) that
     duplicates the zone/time/label/notes to the chosen staff on the same day,
     skipping anyone without matching Branch Hours or at a different branch.
- **1.0.16** — Fixed a "Koha API error 400 (Bad request)" when saving a long
  recurring schedule: batches are now split into chunks so the tunneled
  request URL stays under the web server's limit. The Dashboard **Teams** and
  **Task Zones** filters are now searchable multi-selects too (matching the
  Specific Employees picker).
- **1.0.15** — Dashboard "Specific Employees" filter is now a searchable,
  multi-select list (type to find staff, checkboxes, removable chips) instead
  of a flat row of pills. Recurring **task zone** scheduling now skips dates
  that lack wrapping Branch Hours (e.g. closures) instead of aborting the whole
  batch; a single (non-recurring) task zone on such a date still blocks.
- **1.0.14** — Teams in Koha: superlibrarians create/edit/delete teams in
  Settings, assign each staff member to a team (stored in the plugin's own
  `staff_teams` table — borrower records are never altered), and filter the
  Dashboard and Reports by team. Recurring schedules now silently skip Koha
  closure dates instead of aborting the whole batch (a single shift on a
  closed date still blocks). New **break/lunch** zone flag: a break zone is
  schedulable like a task zone but is excluded from task-zone totals and its
  hours are deducted from branch-hour totals in Reports.
- **1.0.13** — Lock all admin writes to superlibrarian-only; the
  Configure page's edit-permission toggle is no longer consulted.
- **1.0.12** — Route the JSON API through `method=tool` so the
  `tools.plugins_tool` permission is enough; previously every API
  call required `plugins.manage` (superlibrarian).
- **1.0.11** — Diagnostic error messages: API failures show HTTP
  status, content-type, byte count, and a printable preview.
- **1.0.10** — Server-side per-row write checks; non-admin staff
  can mutate only their own task zones; every mutation audited.
- **1.0.9** — "Out" override only deletes overlapping task zones
  for the affected employee, not the whole day's calendar.
- **1.0.8** — Dashboard tolerates partial API failures: shows a red
  banner naming the failed endpoints instead of a blank screen.
