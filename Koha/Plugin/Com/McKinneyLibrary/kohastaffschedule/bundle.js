/**
 * Koha Staff Schedule Plugin – bundle.js
 * McKinney Public Library
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

  /* ─────────────────────────────────────────────
   * 1.  Minimal CSS injected at runtime
   *     (keeps dashboard.tt clean; scoped to #koha-schedule-app)
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

    /* ── Week grid ── */
    .ks-week-grid { overflow-x:auto; }
    .ks-grid { border-collapse:collapse; width:100%; min-width:680px;
               background:#fff; border-radius:6px;
               box-shadow:0 1px 4px rgba(0,0,0,.08); }
    .ks-grid th { background:#0f172a; color:#e2e8f0; padding:.6rem .8rem;
                  font-size:.78rem; text-transform:uppercase; letter-spacing:.05em;
                  border:1px solid #1e293b; white-space:nowrap; }
    .ks-grid td { padding:.5rem .8rem; border:1px solid #e2e8f0;
                  vertical-align:top; min-width:120px; font-size:.82rem; }
    .ks-grid tr:hover td { background:#f8fafc; }
    .ks-shift-chip { display:inline-flex; align-items:center; gap:.3rem;
                     background:#e0f2fe; color:#0369a1; border-radius:3px;
                     padding:.15rem .45rem; margin:.15rem 0; font-size:.78rem;
                     white-space:nowrap; }
    .ks-shift-chip .del-btn { background:none; border:none; cursor:pointer;
                               color:#64748b; font-size:.9rem; line-height:1;
                               padding:0 .1rem; }
    .ks-shift-chip .del-btn:hover { color:#ef4444; }
    .ks-empty { color:#94a3b8; font-size:.8rem; }

    /* ── Add-shift modal ── */
    .ks-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45);
                  display:flex; align-items:center; justify-content:center;
                  z-index:9999; }
    .ks-modal { background:#fff; border-radius:8px; padding:1.5rem;
                width:min(420px, 94vw); box-shadow:0 8px 32px rgba(0,0,0,.2); }
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

  /** Monday of the week containing `d` */
  function weekStart(d) {
    const copy = new Date(d);
    const day = copy.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
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

    /** Fetch all assignments for a 7-day window */
    async getWeek(from, to) {
      return this.get(`assignments?from=${from}&to=${to}`);
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
    weekOf: weekStart(new Date()), // Monday of displayed week
    branchFilter: "",              // "" = all
    assignments: [],               // raw rows from API
    loading: false,
    msg: null,                     // { text, type } or null
    modalOpen: false,
    modalDefaults: {},             // pre-fill date/branch when clicking a cell
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
    const prevBtn = el("button", { className: "ks-btn ks-btn-primary", onClick: () => navigate(-7) }, "◀ Prev");
    const nextBtn = el("button", { className: "ks-btn ks-btn-primary", onClick: () => navigate(7) }, "Next ▶");
    const todayBtn = el("button", { className: "ks-btn ks-btn-primary", onClick: () => jumpToday() }, "Today");

    const weekLabel = el(
      "strong",
      {},
      `${dayLabel(state.weekOf)} – ${dayLabel(addDays(state.weekOf, 6))}`
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
      weekLabel,
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
    // Build 7-day columns
    const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekOf, i));

    // Filter assignments
    const visible = state.assignments.filter((a) =>
      state.branchFilter ? a.branchcode === state.branchFilter : true
    );

    // Group by date
    const byDate = {};
    for (const a of visible) {
      byDate[a.shift_date] = byDate[a.shift_date] || [];
      byDate[a.shift_date].push(a);
    }

    // Header row
    const thead = el("thead");
    const hrow = el("tr");
    hrow.appendChild(el("th", {}, "Staff"));
    for (const d of days) hrow.appendChild(el("th", {}, dayLabel(d)));
    thead.appendChild(hrow);

    // One row per staff member visible this week
    const staffIds = [
      ...new Set(
        visible
          .map((a) => String(a.borrowernumber))
          .concat(CFG.staff.map((s) => String(s.id)))
      ),
    ];

    const tbody = el("tbody");
    for (const sid of staffIds) {
      const row = el("tr");
      row.appendChild(el("td", { style: "white-space:nowrap;font-weight:600;color:#0f172a" }, staffName(sid)));

      for (const d of days) {
        const dateStr = isoDate(d);
        const shifts = (byDate[dateStr] || []).filter(
          (a) => String(a.borrowernumber) === sid
        );

        const cell = el("td", {
          style: "cursor:" + (CFG.isAdmin ? "pointer" : "default"),
          onClick: CFG.isAdmin
            ? () => openModal({ borrowernumber: sid, shift_date: dateStr })
            : null,
        });

        if (shifts.length === 0) {
          cell.appendChild(el("span", { className: "ks-empty" }, "—"));
        } else {
          for (const s of shifts) {
            const chip = el(
              "div",
              { className: "ks-shift-chip" },
              `${branchName(s.branchcode)} ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`
            );
            if (CFG.isAdmin) {
              const delBtn = el("button", {
                className: "del-btn",
                title: "Delete shift",
                onClick(e) {
                  e.stopPropagation();
                  deleteShift(s.id);
                },
              }, "×");
              chip.appendChild(delBtn);
            }
            cell.appendChild(chip);
          }
        }
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }

    // If no staff at all
    if (staffIds.length === 0) {
      const empty = el("tr");
      empty.appendChild(
        el("td", { colspan: "8", style: "text-align:center;color:#94a3b8;padding:2rem" }, "No shifts this week.")
      );
      tbody.appendChild(empty);
    }

    const grid = el("table", { className: "ks-grid" }, thead, tbody);
    return el("div", { className: "ks-week-grid" }, grid);
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
    const notesIn = el("input", { type: "text", name: "notes", placeholder: "Optional notes" });

    async function submit() {
      const payload = {
        borrowernumber: staffSel.value,
        branchcode:     branchSel.value,
        shift_date:     dateIn.value,
        start_time:     startIn.value,
        end_time:       endIn.value,
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
        await loadWeek();
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
  async function loadWeek() {
    state.loading = true;
    render();
    const from = isoDate(state.weekOf);
    const to   = isoDate(addDays(state.weekOf, 6));
    try {
      state.assignments = await Api.getWeek(from, to);
    } catch (e) {
      showMsg("Could not load schedule: " + e.message, "err");
      state.assignments = [];
    }
    state.loading = false;
    render();
  }

  function navigate(days) {
    state.weekOf = addDays(state.weekOf, days);
    loadWeek();
  }

  function jumpToday() {
    state.weekOf = weekStart(new Date());
    loadWeek();
  }

  async function deleteShift(id) {
    if (!confirm("Delete this shift?")) return;
    try {
      await Api.deleteAssignment(id);
      showMsg("Shift deleted.", "ok");
      await loadWeek();
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
    loadWeek();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
