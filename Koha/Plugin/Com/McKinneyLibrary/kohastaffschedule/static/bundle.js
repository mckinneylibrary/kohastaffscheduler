/**
 * Koha Staff Schedule Plugin – bundle.js
 * McKinney Public Library
 *
 * DAILY HOURLY SCHEDULE VIEW
 * Hours: 6 AM to 10 PM (17 hour columns)
 * Rows: Staff members
 * Zone duties displayed as floating badges above shift bars
 *
 * No build step required. Drop alongside dashboard.tt.
 * Reads window.KohaScheduleConfig injected by the template.
 * Talks to the REST API defined in routes.pl.
 *
 * Plugin directory layout expected:
 *   Koha/Plugin/Com/McKinneyLibrary/kohastaffschedule/
 *     ├── dashboard.tt
 *     ├── bundle.js          ← this file
 *     └── ...
 */

(function () {
  "use strict";

  /* ─────────────────────────────────────────────
   * 0.  Config – pulled from the TT-injected global
   * ───────────────────────────────────────────── */
  const CFG = window.KohaScheduleConfig || {
    branches: [],
    staff: [],
    isAdmin: false,
    apiUrl: "/api/v1/contrib/kohastaffschedule/",
  };

  const API = CFG.apiUrl.replace(/\/?$/, "/"); // ensure trailing slash

  // Branch color mapping
  const BRANCH_COLORS = {
    MAIN: { bg: "#dbeafe", text: "#0369a1", border: "#0284c7" },
    CIRC: { bg: "#dcfce7", text: "#166534", border: "#16a34a" },
    REF:  { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" },
    OUT:  { bg: "#fed7aa", text: "#9a3412", border: "#ea580c" },
  };

  function getBranchColor(branchcode) {
    return BRANCH_COLORS[branchcode] || { bg: "#e2e8f0", text: "#1e293b", border: "#64748b" };
  }

  /* ─────────────────────────────────────────────
   * 1.  Minimal CSS injected at runtime
   * ───────────────────────────────────────────── */
  const CSS = `
    /* ── Layout ── */
    #schedule-root { font-family: 'Segoe UI', system-ui, sans-serif; }
    .ks-toolbar { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center;
                  margin-bottom:1.25rem; }
    .ks-toolbar label { font-size:.85rem; color:#475569; }
    .ks-toolbar select, .ks-toolbar input[type=date] {
      padding:.35rem .6rem; border:1px solid #cbd5e1; border-radius:4px;
      font-size:.85rem; background:#fff; }
    .ks-btn { padding:.4rem .9rem; border:none; border-radius:4px; cursor:pointer;
              font-size:.85rem; font-weight:600; transition:background .15s; }
    .ks-btn-primary { background:#0284c7; color:#fff; }
    .ks-btn-primary:hover { background:#0369a1; }
    .ks-btn-danger  { background:#ef4444; color:#fff; }
    .ks-btn-danger:hover  { background:#dc2626; }
    .ks-btn-sm { padding:.25rem .6rem; font-size:.78rem; }

    /* ── Daily Grid ── */
    .ks-day-grid { overflow-x:auto; margin-bottom:1rem; }
    .ks-grid { border-collapse:collapse; width:100%; min-width:800px;
               background:#fff; border-radius:6px;
               box-shadow:0 1px 4px rgba(0,0,0,.08); }
    .ks-grid th { background:#0f172a; color:#e2e8f0; padding:.6rem .4rem;
                  font-size:.7rem; text-transform:uppercase; letter-spacing:.05em;
                  border:1px solid #1e293b; white-space:nowrap; text-align:center; }
    .ks-grid td { padding:.5rem .2rem; border:1px solid #e2e8f0;
                  vertical-align:top; min-width:45px; font-size:.8rem; height:120px;
                  position:relative; background:#fafafa; }
    .ks-staff-col { background:#f1f5f9; font-weight:600; color:#0f172a;
                    white-space:nowrap; text-align:left; padding:.5rem .8rem;
                    min-width:140px; }
    .ks-grid tr:hover td:not(.ks-staff-col) { background:#f0f9ff; }

    /* ── Shift Bar ── */
    .ks-shift-bar { position:absolute; top:2px; left:2px; right:2px; bottom:2px;
                    border-radius:3px; border:1px solid; overflow:hidden;
                    cursor:pointer; display:flex; flex-direction:column;
                    font-size:.7rem; line-height:1.1; padding:2px;
                    transition:box-shadow .15s; }
    .ks-shift-bar:hover { box-shadow:0 2px 8px rgba(0,0,0,.15); }
    .ks-shift-bar .ks-shift-label { font-weight:600; white-space:nowrap;
                                     text-overflow:ellipsis; overflow:hidden; }
    .ks-shift-bar .ks-shift-time { font-size:.65rem; opacity:.9; }

    /* ── Zone Duty Badge ── */
    .ks-zone-badge { position:absolute; top:-18px; left:0; 
                     background:#9333ea; color:#fff; 
                     font-size:.65rem; font-weight:600;
                     padding:2px 4px; border-radius:2px;
                     white-space:nowrap; z-index:10;
                     max-width:90%; text-overflow:ellipsis; overflow:hidden; }

    /* ── Empty cell ── */
    .ks-empty-cell { color:#cbd5e1; font-size:.75rem; text-align:center;
                     display:flex; align-items:center; justify-content:center; }

    /* ── Add-shift modal ── */
    .ks-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45);
                  display:flex; align-items:center; justify-content:center;
                  z-index:9999; }
    .ks-modal { background:#fff; border-radius:8px; padding:1.5rem;
                width:min(460px, 94vw); box-shadow:0 8px 32px rgba(0,0,0,.2);
                max-height:90vh; overflow-y:auto; }
    .ks-modal h2 { margin:0 0 1rem; font-size:1rem; color:#0f172a; }
    .ks-form-row { display:flex; flex-direction:column; gap:.25rem; margin-bottom:.9rem; }
    .ks-form-row label { font-size:.82rem; color:#475569; font-weight:600; }
    .ks-form-row select, .ks-form-row input {
      padding:.4rem .6rem; border:1px solid #cbd5e1; border-radius:4px;
      font-size:.85rem; }
    .ks-form-actions { display:flex; gap:.6rem; justify-content:flex-end; margin-top:1rem; }
    .ks-msg { padding:.5rem .9rem; border-radius:4px; font-size:.82rem;
              margin-bottom:1rem; }
    .ks-msg-ok  { background:#dcfce7; color:#166534; }
    .ks-msg-err { background:#fee2e2; color:#991b1b; }

    /* ── Loading / empty states ── */
    .ks-loading { color:#64748b; font-size:.9rem; padding:2rem 0; text-align:center; }
  `;

  (function injectStyles() {
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
  })();

  /* ─────────────────────────────────────────────
   * 2.  Utility helpers
   * ───────────────────────────────────────────── */

  /** Zero-pad to 2 digits */
  const pad2 = (n) => String(n).padStart(2, "0");

  /** Format a JS Date as YYYY-MM-DD */
  function isoDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  /** Add N days to a Date, return new Date */
  const addDays = (d, n) => {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
  };

  /** Friendly "Mon Jun 2" label */
  function dayLabel(d) {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  /** Format HH:MM from "HH:MM:SS" or "HH:MM" */
  function fmtTime(t) {
    if (!t) return "";
    return t.slice(0, 5);
  }

  /** Parse hour from time string HH:MM */
  function parseHour(timeStr) {
    if (!timeStr) return 0;
    const [h] = timeStr.split(":").map(Number);
    return h;
  }

  /** Lookup helpers */
  function branchName(code) {
    const b = CFG.branches.find((x) => x.id === code);
    return b ? b.name : code;
  }
  function staffName(id) {
    const s = CFG.staff.find((x) => String(x.id) === String(id));
    return s ? s.name : `#${id}`;
  }

  /* ─────────────────────────────────────────────
   * 3.  API layer (mirrors routes.pl)
   * ───────────────────────────────────────────── */
  const Api = {
    async get(path) {
      const r = await fetch(API + path, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
      return r.json();
    },

    async post(path, body) {
      const r = await fetch(API + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
      return r.json();
    },

    async del(path) {
      const r = await fetch(API + path, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
      return r.ok;
    },

    /** Fetch all assignments for a single day */
    async getDay(date) {
      return this.get(`assignments?from=${date}&to=${date}`);
    },

    /** Create a new shift */
    async createAssignment(payload) {
      return this.post("assignments", payload);
    },

    /** Delete a shift by id */
    async deleteAssignment(id) {
      return this.del(`assignments/${id}`);
    },
  };

  /* ─────────────────────────────────────────────
   * 4.  State
   * ───────────────────────────────────────────── */
  const state = {
    currentDate: new Date(),           // currently displayed day
    branchFilter: "",                  // "" = all
    assignments: [],                   // raw rows from API
    loading: false,
    msg: null,                         // { text, type } or null
    modalOpen: false,
    modalDefaults: {},                 // pre-fill when clicking a cell
  };

  /* ─────────────────────────────────────────────
   * 5.  Render helpers
   * ───────────────────────────────────────────── */

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "className") {
        node.className = v;
      } else if (k === "html") {
        node.innerHTML = v;
      } else {
        node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  /* ─────────────────────────────────────────────
   * 6.  Sub-components
   * ───────────────────────────────────────────── */

  function buildToolbar() {
    const prevBtn = el("button", { className: "ks-btn ks-btn-primary", onClick: () => navigate(-1) }, "◀ Prev");
    const nextBtn = el("button", { className: "ks-btn ks-btn-primary", onClick: () => navigate(1) }, "Next ▶");
    const todayBtn = el("button", { className: "ks-btn ks-btn-primary", onClick: () => jumpToday() }, "Today");

    const dayLabel = el(
      "strong",
      {},
      `${dayLabel(state.currentDate)}`
    );

    // Branch filter
    const branchSel = el("select", {
      onChange(e) {
        state.branchFilter = e.target.value;
        render();
      },
    });
    branchSel.appendChild(new Option("All Branches", ""));
    for (const b of CFG.branches) {
      const opt = new Option(b.name, b.id);
      if (b.id === state.branchFilter) opt.selected = true;
      branchSel.appendChild(opt);
    }

    const toolbar = el(
      "div",
      { className: "ks-toolbar" },
      prevBtn,
      todayBtn,
      nextBtn,
      dayLabel,
      el("label", {}, "Branch: ", branchSel)
    );

    if (CFG.isAdmin) {
      const addBtn = el(
        "button",
        {
          className: "ks-btn ks-btn-primary",
          style: "margin-left:auto",
          onClick: () => openModal({}),
        },
        "+ Add Shift"
      );
      toolbar.appendChild(addBtn);
    }

    return toolbar;
  }

  function buildGrid() {
    const dateStr = isoDate(state.currentDate);

    // Filter assignments by date and branch
    const visible = state.assignments.filter((a) => {
      const dateMatch = a.shift_date === dateStr;
      const branchMatch = state.branchFilter ? a.branchcode === state.branchFilter : true;
      return dateMatch && branchMatch;
    });

    // Get unique staff members for this day
    const staffIds = [
      ...new Set(
        visible
          .map((a) => String(a.borrowernumber))
          .concat(CFG.staff.map((s) => String(s.id)))
      ),
    ].sort();

    // Hour columns: 6 AM to 10 PM
    const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i);

    // Build table
    const thead = el("thead");
    const hrow = el("tr");
    hrow.appendChild(el("th", {}, "Staff"));
    for (const h of HOURS) {
      const label = h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
      hrow.appendChild(el("th", {}, label));
    }
    thead.appendChild(hrow);

    const tbody = el("tbody");
    for (const sid of staffIds) {
      const row = el("tr");
      row.appendChild(
        el("td", { className: "ks-staff-col" }, staffName(sid))
      );

      for (const hour of HOURS) {
        const cell = el("td", {
          style: "cursor:" + (CFG.isAdmin ? "pointer" : "default"),
          onClick: CFG.isAdmin
            ? () => openModal({ borrowernumber: sid, shift_date: dateStr, hour })
            : null,
        });

        // Find shifts that overlap this hour
        const shiftsThisHour = visible.filter((a) => {
          if (String(a.borrowernumber) !== sid) return false;
          const startH = parseHour(a.start_time);
          const endH = parseHour(a.end_time);
          return hour >= startH && hour < endH;
        });

        if (shiftsThisHour.length === 0) {
          cell.appendChild(el("div", { className: "ks-empty-cell" }, "—"));
        } else {
          // For simplicity, show first shift spanning this hour
          const s = shiftsThisHour[0];
          const color = getBranchColor(s.branchcode);

          // Only show shift label on first hour
          const startH = parseHour(s.start_time);
          const isFirstHour = hour === startH;

          const bar = el("div", {
            className: "ks-shift-bar",
            style: `background-color:${color.bg}; border-color:${color.border}; color:${color.text};`,
            title: `${branchName(s.branchcode)} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}${s.zone_duty ? " • " + s.zone_duty : ""}`,
            onClick: CFG.isAdmin
              ? (e) => {
                  e.stopPropagation();
                  openModal({ shiftId: s.id, edit: true });
                }
              : null,
          });

          if (isFirstHour) {
            bar.appendChild(
              el("div", { className: "ks-shift-label" }, branchName(s.branchcode))
            );
            bar.appendChild(
              el("div", { className: "ks-shift-time" }, `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`)
            );

            // Zone duty badge floating above on first hour
            if (s.zone_duty) {
              bar.appendChild(
                el("div", { className: "ks-zone-badge" }, s.zone_duty)
              );
            }
          }

          // Delete button for admins (show only on first hour)
          if (CFG.isAdmin && isFirstHour) {
            const delBtn = el("button", {
              className: "ks-btn ks-btn-sm ks-btn-danger",
              style: "position:absolute; bottom:2px; right:2px; padding:1px 3px;",
              title: "Delete shift",
              onClick(e) {
                e.stopPropagation();
                deleteShift(s.id);
              },
            }, "×");
            bar.appendChild(delBtn);
          }

          cell.appendChild(bar);
        }
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }

    // If no staff at all
    if (staffIds.length === 0) {
      const empty = el("tr");
      empty.appendChild(
        el("td", { colSpan: "18", style: "text-align:center;color:#94a3b8;padding:2rem" }, "No staff scheduled for this day.")
      );
      tbody.appendChild(empty);
    }

    const grid = el("table", { className: "ks-grid" }, thead, tbody);
    return el("div", { className: "ks-day-grid" }, grid);
  }

  function buildModal() {
    if (!state.modalOpen) return null;

    const def = state.modalDefaults;

    // Staff select
    const staffSel = el("select", { name: "borrowernumber", required: "true" });
    staffSel.appendChild(new Option("— Select staff —", ""));
    for (const s of CFG.staff) {
      const opt = new Option(s.name, s.id);
      if (String(s.id) === String(def.borrowernumber)) opt.selected = true;
      staffSel.appendChild(opt);
    }

    // Branch select
    const branchSel = el("select", { name: "branchcode" });
    for (const b of CFG.branches) {
      const opt = new Option(b.name, b.id);
      if (b.id === (def.branchcode || CFG.branches[0]?.id)) opt.selected = true;
      branchSel.appendChild(opt);
    }

    const dateIn = el("input", {
      type: "date",
      name: "shift_date",
      value: def.shift_date || isoDate(new Date()),
      required: "true",
    });
    const startIn = el("input", { type: "time", name: "start_time", value: def.start_time || "09:00" });
    const endIn   = el("input", { type: "time", name: "end_time",   value: def.end_time   || "17:00" });
    const zoneDutyIn = el("input", { type: "text", name: "zone_duty", placeholder: "e.g., Reference Desk, Shelving", value: def.zone_duty || "" });
    const notesIn = el("input", { type: "text", name: "notes", placeholder: "Optional notes", value: def.notes || "" });

    async function submit() {
      const payload = {
        borrowernumber: staffSel.value,
        branchcode:     branchSel.value,
        shift_date:     dateIn.value,
        start_time:     startIn.value,
        end_time:       endIn.value,
        zone_duty:      zoneDutyIn.value,
        notes:          notesIn.value,
      };
      if (!payload.borrowernumber || !payload.shift_date) {
        showMsg("Please select a staff member and date.", "err");
        return;
      }
      try {
        await Api.createAssignment(payload);
        showMsg("Shift added.", "ok");
        closeModal();
        await loadDay();
      } catch (e) {
        showMsg("Error saving shift: " + e.message, "err");
      }
    }

    const modal = el(
      "div",
      { className: "ks-modal", onClick(e) { e.stopPropagation(); } },
      el("h2", {}, "Add Shift"),
      el("div", { className: "ks-form-row" }, el("label", {}, "Staff Member"), staffSel),
      el("div", { className: "ks-form-row" }, el("label", {}, "Branch"),       branchSel),
      el("div", { className: "ks-form-row" }, el("label", {}, "Date"),         dateIn),
      el("div", { className: "ks-form-row" }, el("label", {}, "Start Time"),   startIn),
      el("div", { className: "ks-form-row" }, el("label", {}, "End Time"),     endIn),
      el("div", { className: "ks-form-row" }, el("label", {}, "Zone Duty"),    zoneDutyIn),
      el("div", { className: "ks-form-row" }, el("label", {}, "Notes"),        notesIn),
      el(
        "div",
        { className: "ks-form-actions" },
        el("button", { className: "ks-btn", onClick: closeModal }, "Cancel"),
        el("button", { className: "ks-btn ks-btn-primary", onClick: submit }, "Save Shift")
      )
    );

    return el("div", { className: "ks-overlay", onClick: closeModal }, modal);
  }

  /* ─────────────────────────────────────────────
   * 7.  Main render
   * ───────────────────────────────────────────── */
  function render() {
    const root = document.getElementById("schedule-root");
    if (!root) return;
    root.innerHTML = "";

    // Message banner
    if (state.msg) {
      root.appendChild(
        el("div", { className: `ks-msg ks-msg-${state.msg.type}` }, state.msg.text)
      );
    }

    if (state.loading) {
      root.appendChild(el("div", { className: "ks-loading" }, "Loading schedule…"));
      return;
    }

    root.appendChild(buildToolbar());
    root.appendChild(buildGrid());

    const overlay = buildModal();
    if (overlay) root.appendChild(overlay);
  }

  /* ─────────────────────────────────────────────
   * 8.  Actions
   * ───────────────────────────────────────────── */
  async function loadDay() {
    state.loading = true;
    render();
    const date = isoDate(state.currentDate);
    try {
      state.assignments = await Api.getDay(date);
    } catch (e) {
      showMsg("Could not load schedule: " + e.message, "err");
      state.assignments = [];
    }
    state.loading = false;
    render();
  }

  function navigate(days) {
    state.currentDate = addDays(state.currentDate, days);
    loadDay();
  }

  function jumpToday() {
    state.currentDate = new Date();
    loadDay();
  }

  async function deleteShift(id) {
    if (!confirm("Delete this shift?")) return;
    try {
      await Api.deleteAssignment(id);
      showMsg("Shift deleted.", "ok");
      await loadDay();
    } catch (e) {
      showMsg("Error deleting: " + e.message, "err");
    }
  }

  function openModal(defaults) {
    state.modalOpen = true;
    state.modalDefaults = defaults || {};
    render();
  }

  function closeModal() {
    state.modalOpen = false;
    state.modalDefaults = {};
    render();
  }

  function showMsg(text, type) {
    state.msg = { text, type };
    setTimeout(() => {
      state.msg = null;
      render();
    }, 4000);
  }

  /* ─────────────────────────────────────────────
   * 9.  Bootstrap – wait for DOM ready
   * ───────────────────────────────────────────── */
  function boot() {
    const root = document.getElementById("schedule-root");
    if (!root) {
      console.warn("[KohaSchedule] #schedule-root not found – aborting.");
      return;
    }
    loadDay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
