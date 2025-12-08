// =========================================================
// SUPABASE CONFIG
// =========================================================
const SUPABASE_URL = "https://pfussewqhvxaflwxrkey.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdXNzZXdxaHZ4YWZsd3hya2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODMwMzAsImV4cCI6MjA4MDY1OTAzMH0.X3QhVjTyKU9OuKShXSb4Lemw2985AN_h8TUW62R-amQ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================
// GLOBAL VARS
// =========================================================
let session = null;
let currentUserRole = "member";
let chatChannel = null;

// =========================================================
// GET GROUP ID
// =========================================================
const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get("id");

if (!groupId) window.location = "dashboard.html";

// =========================================================
// SESSION LOADING
// =========================================================
async function loadSession() {
  const { data } = await supabaseClient.auth.getSession();
  session = data.session;

  if (!session) window.location = "index.html";
}

// =========================================================
// LOAD GROUP HEADER (NAME + AVATAR + JOIN CODE)
// =========================================================
async function loadGroup() {
  const { data, error } = await supabaseClient
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .single();

  if (error || !data) {
    document.getElementById("group-title").innerText = "Gruppe nicht gefunden!";
    return;
  }

  document.getElementById("group-title").innerText = data.name;
  updateAvatar(data.name);

  const joinText = document.getElementById("join-code-text");
  joinText.innerText = `Code: ${data.join_code}`;

  document.querySelector(".copy-join-btn").onclick = () =>
    copyJoinCode(data.join_code);
}

function copyJoinCode(code) {
  navigator.clipboard.writeText(code);
  alert("Beitrittscode kopiert!");
}

// =========================================================
// USER ROLE
// =========================================================
async function loadUserRole() {
  const { data } = await supabaseClient
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", session.user.id)
    .single();

  if (data) currentUserRole = data.role;
}

// =========================================================
// TAB SWITCHING
// =========================================================
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadTab(btn.dataset.tab);
  });
});

function loadTab(tab) {
  if (tab === "overview") return loadOverview();
  if (tab === "members") return loadMembers();
  if (tab === "tasks") return renderTasksUI();
  if (tab === "events") return renderEventsUI();
  if (tab === "money") return renderMoneyUI();
  if (tab === "polls") return renderPollsUI();
  if (tab === "chat") return renderChatUI();

  document.getElementById("tab-content").innerHTML = "<p>Feature folgt…</p>";
}

// =========================================================
// MEMBERS
// =========================================================
async function loadMembers() {
  const { data, error } = await supabaseClient
    .from("group_members")
    .select("user_id, role, profiles(name)")
    .eq("group_id", groupId);

  const content = document.getElementById("tab-content");

  if (error || !data) {
    content.innerHTML = "<p>Fehler beim Laden der Mitglieder.</p>";
    return;
  }

  let html = `<h2>Mitglieder</h2>`;

  data.forEach((m) => {
    html += `
      <div class="member-item">
        <strong>${m.profiles?.name || "Unbekannt"}</strong>
        <span class="role-badge ${m.role}">${m.role}</span>

        <div class="member-controls">
          ${memberActions(m)}
        </div>
      </div>
    `;
  });

  content.innerHTML = html;
}

function memberActions(member) {
  if (currentUserRole === "owner" && member.role !== "owner") {
    return `
      <button onclick="setRole('${member.user_id}', 'admin')">Admin</button>
      <button onclick="setRole('${member.user_id}', 'member')">Member</button>
      <button onclick="removeUser('${member.user_id}')">Löschen</button>
    `;
  }

  if (currentUserRole === "admin" && member.role === "member") {
    return `<button onclick="setRole('${member.user_id}', 'admin')">Admin</button>`;
  }

  return "";
}

async function setRole(id, role) {
  await supabaseClient
    .from("group_members")
    .update({ role })
    .eq("group_id", groupId)
    .eq("user_id", id);

  await logActivity("member_role", `Rolle geändert zu ${role} (User: ${id})`);
  loadMembers();
}

async function removeUser(id) {
  if (!confirm("Wirklich entfernen?")) return;

  await supabaseClient
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", id);

  await logActivity("member_remove", `Mitglied entfernt (User: ${id})`);
  loadMembers();
}

// =========================================================
// EVENTS
// =========================================================
function renderEventsUI() {
  document.getElementById("tab-content").innerHTML = `
    <h2>Termine</h2>

    <div class="event-form">
      <input id="event-title" placeholder="Titel">
      <input id="event-date" type="date">
      <textarea id="event-desc" placeholder="Beschreibung"></textarea>
      <button id="add-event-btn">Hinzufügen</button>
    </div>

    <div id="event-list">Wird geladen…</div>
  `;

  document.getElementById("add-event-btn").onclick = addEvent;
  loadEvents();
}

async function loadEvents() {
  const { data, error } = await supabaseClient
    .from("events")
    .select("*")
    .eq("group_id", groupId)
    .order("date");

  const box = document.getElementById("event-list");

  if (error || !data) {
    box.innerHTML = "<p>Fehler beim Laden.</p>";
    return;
  }

  if (!data.length) {
    box.innerHTML = "<p>Keine Termine.</p>";
    return;
  }

  box.innerHTML = data
    .map(
      (e) => `
      <div class="event-item">
        <strong>${e.title}</strong> – ${e.date}<br>
        <small>${e.description || ""}</small>

        <div class="event-buttons">
          <button onclick="openEditEvent('${e.id}', '${escapeQuotes(
            e.title
          )}', '${e.date}', \`${
        e.description ? e.description.replace(/`/g, "\\`") : ""
      }\`)">
            ✏️ Bearbeiten
          </button>
          <button onclick="deleteEvent('${e.id}')">🗑️ Löschen</button>
        </div>
      </div>
    `
    )
    .join("");
}

function escapeQuotes(str) {
  return String(str || "").replace(/"/g, "&quot;").replace(/'/g, "\\'");
}

async function addEvent() {
  const title = document.getElementById("event-title").value.trim();
  const date = document.getElementById("event-date").value;
  const desc = document.getElementById("event-desc").value;

  if (!title || !date) return alert("Titel + Datum erforderlich!");

  await supabaseClient.from("events").insert({
    group_id: groupId,
    title,
    date,
    description: desc,
    created_by: session.user.id,
  });

  await logActivity("event_create", `Termin erstellt: "${title}"`);

  document.getElementById("event-title").value = "";
  document.getElementById("event-date").value = "";
  document.getElementById("event-desc").value = "";

  loadEvents();
}

function openEditEvent(id, title, date, desc) {
  const container = document.getElementById("tab-content");
  const existing = document.getElementById("event-modal");
  if (existing) existing.remove();

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div class="modal-backdrop" id="event-modal">
      <div class="modal">
        <h3>Termin bearbeiten</h3>

        <label>Titel:</label>
        <input id="edit-event-title" value="${title}">

        <label>Datum:</label>
        <input id="edit-event-date" type="date" value="${date}">

        <label>Beschreibung:</label>
        <textarea id="edit-event-desc">${desc || ""}</textarea>

        <div class="modal-buttons">
          <button onclick="saveEvent('${id}')">💾 Speichern</button>
          <button onclick="closeEventModal()">❌ Abbrechen</button>
        </div>
      </div>
    </div>
  `
  );
}

async function saveEvent(id) {
  const newTitle = document.getElementById("edit-event-title").value.trim();
  const newDate = document.getElementById("edit-event-date").value;
  const newDesc = document.getElementById("edit-event-desc").value;

  if (!newTitle || !newDate) return alert("Titel + Datum erforderlich!");

  await supabaseClient
    .from("events")
    .update({
      title: newTitle,
      date: newDate,
      description: newDesc,
    })
    .eq("id", id);

  await logActivity("event_update", `Termin bearbeitet: "${newTitle}"`);

  closeEventModal();
  loadEvents();
}

function closeEventModal() {
  const modal = document.getElementById("event-modal");
  if (modal) modal.remove();
}

async function deleteEvent(id) {
  if (!confirm("Termin wirklich löschen?")) return;

  await supabaseClient.from("events").delete().eq("id", id);

  await logActivity("event_delete", `Termin gelöscht (ID: ${id})`);
  loadEvents();
}

// =========================================================
// POLLS (UMFRAGEN) – Mehrfachauswahl möglich
// =========================================================
function renderPollsUI() {
  document.getElementById("tab-content").innerHTML = `
    <h2>Umfragen</h2>

    <div class="poll-form">
      <input id="poll-title" placeholder="Frage eingeben">

      <div id="poll-options-box">
        <input class="poll-option" placeholder="Option 1">
        <input class="poll-option" placeholder="Option 2">
      </div>

      <button id="poll-add-option-btn">Option hinzufügen</button>
      <button id="poll-create-btn">Umfrage erstellen</button>
    </div>

    <h3>Aktive Umfragen</h3>
    <div id="poll-list">Wird geladen…</div>
  `;

  document.getElementById("poll-add-option-btn").onclick = addPollOptionInput;
  document.getElementById("poll-create-btn").onclick = createPoll;

  loadPolls();
}

function addPollOptionInput() {
  const box = document.getElementById("poll-options-box");
  const input = document.createElement("input");
  input.className = "poll-option";
  input.placeholder = "Weitere Option";
  box.appendChild(input);
}

async function createPoll() {
  const title = document.getElementById("poll-title").value.trim();
  const optionInputs = [...document.querySelectorAll(".poll-option")];

  const options = optionInputs
    .map((o) => o.value.trim())
    .filter((o) => o.length > 0);

  if (!title) return alert("Bitte einen Titel eingeben.");
  if (options.length < 2) return alert("Mindestens 2 Optionen erforderlich.");

  const { data: poll, error: pollError } = await supabaseClient
    .from("group_polls")
    .insert({
      group_id: groupId,
      title,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (pollError) {
    console.error(pollError);
    return alert("Fehler beim Erstellen der Umfrage.");
  }

  const rows = options.map((text) => ({
    poll_id: poll.id,
    text,
  }));

  const { error: optError } = await supabaseClient
    .from("group_poll_options")
    .insert(rows);

  if (optError) {
    console.error(optError);
    alert("Optionen konnten nicht gespeichert werden.");
  }

  loadPolls();
}

async function loadPolls() {
  const listEl = document.getElementById("poll-list");

  const { data: polls, error } = await supabaseClient
    .from("group_polls")
    .select("id, title, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error || !polls || !polls.length) {
    listEl.innerHTML = "<p>Keine Umfragen vorhanden.</p>";
    return;
  }

  let html = "";
  for (const poll of polls) {
    html += await renderSinglePoll(poll);
  }

  listEl.innerHTML = html;
}

async function renderSinglePoll(poll) {
  const { data: options } = await supabaseClient
    .from("group_poll_options")
    .select("*")
    .eq("poll_id", poll.id);

  const { data: votes } = await supabaseClient
    .from("group_poll_votes")
    .select("*")
    .eq("poll_id", poll.id);

  const totalVotes = votes.length;
  const myId = session?.user?.id || null;

  let html = `
    <div class="poll-box">
      <h4>${poll.title}</h4>
      <div class="poll-options">
  `;

  options.forEach((opt) => {
    const count = votes.filter((v) => v.option_id === opt.id).length;
    const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
    const hasVotedThis =
      myId && votes.some((v) => v.user_id === myId && v.option_id === opt.id);

    html += `
      <div class="poll-option-row">
        <button 
          onclick="votePoll('${poll.id}', '${opt.id}')"
          class="${hasVotedThis ? "voted" : ""}">
          ${opt.text}
        </button>
        <span>${count} Stimmen (${pct}%)</span>
      </div>
    `;
  });

  html += `</div></div>`;
  return html;
}

async function votePoll(pollId, optionId) {
  // Toggle: wenn diese Option schon gewählt ist -> löschen, sonst hinzufügen
  const { data: existing } = await supabaseClient
    .from("group_poll_votes")
    .select("*")
    .eq("poll_id", pollId)
    .eq("option_id", optionId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (existing) {
    await supabaseClient
      .from("group_poll_votes")
      .delete()
      .eq("id", existing.id);
  } else {
    await supabaseClient.from("group_poll_votes").insert({
      poll_id: pollId,
      option_id: optionId,
      user_id: session.user.id,
    });
  }

  loadPolls();
}

// =========================================================
// TASKS (KANBAN MIT BUTTONS, FILTER, SORT, KOMMENTARE)
// =========================================================
function renderTasksUI() {
  document.getElementById("tab-content").innerHTML = `
    <h2>Aufgaben</h2>

    <div class="task-toolbar">
      <div class="task-filters">
        <label>Filter:</label>
        <select id="task-filter-assignee">
          <option value="all">Alle</option>
          <option value="me">Meine</option>
        </select>

        <label>Sortierung:</label>
        <select id="task-sort">
          <option value="created_desc">Neueste zuerst</option>
          <option value="deadline_asc">Deadline (früheste zuerst)</option>
          <option value="priority_desc">Priorität (hoch zuerst)</option>
        </select>
      </div>
    </div>

    <div class="task-form">
      <input id="task-title" placeholder="Titel">
      <textarea id="task-desc" placeholder="Beschreibung"></textarea>

      <label>Deadline:</label>
      <input id="task-deadline" type="date">

      <label>Priorität:</label>
      <select id="task-priority">
        <option value="low">Niedrig</option>
        <option value="medium" selected>Mittel</option>
        <option value="high">Hoch</option>
      </select>

      <label>Verantwortlicher:</label>
      <select id="task-assigned"></select>

      <button id="add-task-btn">Aufgabe hinzufügen</button>
    </div>

    <div class="kanban">
      <div class="kanban-column">
        <h3>Offen</h3>
        <div id="task-open" class="kanban-list"></div>
      </div>

      <div class="kanban-column">
        <h3>In Arbeit</h3>
        <div id="task-progress" class="kanban-list"></div>
      </div>

      <div class="kanban-column">
        <h3>Erledigt</h3>
        <div id="task-done" class="kanban-list"></div>
      </div>
    </div>
  `;

  document.getElementById("add-task-btn").onclick = addTask;
  document.getElementById("task-filter-assignee").onchange = loadTasksKanban;
  document.getElementById("task-sort").onchange = loadTasksKanban;

  loadTaskAssignees();
  loadTasksKanban();
}

async function addTask() {
  const title = document.getElementById("task-title").value.trim();
  const desc = document.getElementById("task-desc").value.trim();
  const deadline = document.getElementById("task-deadline").value;
  const priority = document.getElementById("task-priority").value;
  const assigned = document.getElementById("task-assigned").value;

  if (!title) return alert("Titel erforderlich!");

  await supabaseClient.from("tasks").insert({
    group_id: groupId,
    title,
    description: desc,
    deadline: deadline || null,
    status: "open",
    priority,
    assigned_to: assigned || null,
    created_by: session.user.id,
  });

  await logActivity("task_create", `Aufgabe erstellt: "${title}"`);

  document.getElementById("task-title").value = "";
  document.getElementById("task-desc").value = "";
  document.getElementById("task-deadline").value = "";

  loadTasksKanban();
}

async function loadTaskAssignees() {
  const { data, error } = await supabaseClient
    .from("group_members")
    .select("user_id, profiles(name)")
    .eq("group_id", groupId);

  const assignSelect = document.getElementById("task-assigned");
  const filterSelect = document.getElementById("task-filter-assignee");

  assignSelect.innerHTML = `<option value="">Niemand</option>`;

  if (error || !data) return;

  data.forEach((m) => {
    const name = m.profiles?.name || "Unbekannt";
    assignSelect.innerHTML += `<option value="${m.user_id}">${name}</option>`;

    const exists = Array.from(filterSelect.options).some(
      (opt) => opt.value === m.user_id
    );
    if (!exists) {
      filterSelect.innerHTML += `<option value="${m.user_id}">${name}</option>`;
    }
  });
}

async function loadTasksKanban() {
  const { data, error } = await supabaseClient
    .from("tasks")
    .select("*")
    .eq("group_id", groupId);

  const open = document.getElementById("task-open");
  const progress = document.getElementById("task-progress");
  const done = document.getElementById("task-done");

  open.innerHTML = "";
  progress.innerHTML = "";
  done.innerHTML = "";

  if (error || !data) {
    open.innerHTML = "<p>Fehler beim Laden der Aufgaben.</p>";
    return;
  }

  let tasks = [...data];

  const filter = document.getElementById("task-filter-assignee").value;
  if (filter === "me") {
    tasks = tasks.filter((t) => t.assigned_to === session.user.id);
  } else if (filter !== "all") {
    tasks = tasks.filter((t) => t.assigned_to === filter);
  }

  const sortVal = document.getElementById("task-sort").value;
  tasks.sort((a, b) => {
    if (sortVal === "created_desc") {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    if (sortVal === "deadline_asc") {
      const da = a.deadline ? new Date(a.deadline) : new Date("2100-01-01");
      const db = b.deadline ? new Date(b.deadline) : new Date("2100-01-01");
      return da - db;
    }
    if (sortVal === "priority_desc") {
      const order = { high: 3, medium: 2, low: 1 };
      return (order[b.priority] || 0) - (order[a.priority] || 0);
    }
    return 0;
  });

  tasks.forEach((task) => {
    const el = document.createElement("div");
    el.classList.add("task-card");
    el.dataset.id = task.id;

    const deadlineInfo = buildDeadlineInfo(task.deadline);
    const priorityLabel =
      task.priority === "high"
        ? "🔴 Hoch"
        : task.priority === "medium"
        ? "🟡 Mittel"
        : "🟢 Niedrig";

    el.innerHTML = `
      <strong>${task.title}</strong>
      <p>${task.description || ""}</p>
      ${
        task.deadline
          ? `<span class="deadline-badge ${deadlineInfo.className}">
              🗓 ${task.deadline} ${deadlineInfo.label}
            </span>`
          : ""
      }
      <div class="priority-badge ${task.priority}">${priorityLabel}</div>

      <div class="task-buttons">
        ${taskStatusButtons(task)}
        <button onclick="openTaskComments('${task.id}')">💬 Kommentare</button>
        <button class="delete-btn" onclick="deleteTask('${task.id}')">🗑 Löschen</button>
      </div>
      <div class="task-comments" id="task-comments-${task.id}" style="display:none;"></div>
    `;

    if (task.status === "open") open.appendChild(el);
    if (task.status === "in_progress") progress.appendChild(el);
    if (task.status === "done") done.appendChild(el);
  });
}

function buildDeadlineInfo(deadline) {
  if (!deadline) return { label: "", className: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0)
    return { label: "(überfällig)", className: "deadline-overdue" };
  if (diffDays === 0)
    return { label: "(heute)", className: "deadline-today" };
  if (diffDays <= 2)
    return { label: "(bald)", className: "deadline-soon" };

  return { label: "", className: "" };
}

function taskStatusButtons(task) {
  if (task.status === "open") {
    return `
      <button onclick="changeTaskStatus('${task.id}', 'in_progress')">→ In Arbeit</button>
      <button onclick="changeTaskStatus('${task.id}', 'done')">✓ Erledigt</button>
    `;
  }
  if (task.status === "in_progress") {
    return `
      <button onclick="changeTaskStatus('${task.id}', 'open')">← Offen</button>
      <button onclick="changeTaskStatus('${task.id}', 'done')">✓ Erledigt</button>
    `;
  }
  if (task.status === "done") {
    return `
      <button onclick="changeTaskStatus('${task.id}', 'in_progress')">← In Arbeit</button>
    `;
  }
  return "";
}

async function changeTaskStatus(id, status) {
  await supabaseClient.from("tasks").update({ status }).eq("id", id);

  await logActivity("task_status", `Status geändert zu "${status}" (Task: ${id})`);
  loadTasksKanban();
}

async function deleteTask(id) {
  if (!confirm("Wirklich löschen?")) return;

  await supabaseClient.from("tasks").delete().eq("id", id);
  await logActivity("task_delete", `Aufgabe gelöscht (ID: ${id})`);
  loadTasksKanban();
}

// =========================================================
// TASK-KOMMENTARE
// =========================================================
async function openTaskComments(taskId) {
  const box = document.getElementById(`task-comments-${taskId}`);
  if (!box) return;

  const isVisible = box.style.display === "block";
  if (isVisible) {
    box.style.display = "none";
    return;
  }

  box.style.display = "block";
  box.innerHTML = "<p>Kommentare werden geladen…</p>";

  const { data, error } = await supabaseClient
    .from("task_comments")
    .select("id, comment_text, created_at, user_id")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("task_comments Fehler:", error.message);
    box.innerHTML = "<p>Kommentare nicht verfügbar.</p>";
    return;
  }

  let html = `<div class="comments-list">`;
  if (!data.length) {
    html += `<p class="comment-empty">Noch keine Kommentare.</p>`;
  } else {
    data.forEach((c) => {
      const created = c.created_at
        ? new Date(c.created_at).toLocaleString("de-DE")
        : "";
      html += `
        <div class="comment-item">
          <small>${created}</small><br>
          <span>${c.comment_text}</span>
        </div>
      `;
    });
  }
  html += `</div>
    <div class="comment-form">
      <textarea id="comment-input-${taskId}" placeholder="Kommentar hinzufügen…"></textarea>
      <button onclick="addTaskComment('${taskId}')">Senden</button>
    </div>
  `;

  box.innerHTML = html;
}

async function addTaskComment(taskId) {
  const input = document.getElementById(`comment-input-${taskId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const { error } = await supabaseClient.from("task_comments").insert({
    task_id: taskId,
    user_id: session.user.id,
    comment_text: text, // WICHTIG: richtiger Spaltenname
  });

  if (error) {
    console.error("Fehler beim Speichern von task_comments:", error.message);
    alert("Kommentar konnte nicht gespeichert werden.");
    return;
  }

  input.value = "";
  openTaskComments(taskId); // neu laden
}

// =========================================================
// KASSE (Finanzen)
// =========================================================
function renderMoneyUI() {
  document.getElementById("tab-content").innerHTML = `
    <h2>Kasse</h2>

    <div class="money-form">
      <input id="money-amount" type="number" step="0.01" placeholder="Betrag (€)">
      <input id="money-desc" placeholder="Beschreibung">

      <select id="money-category">
        <option value="sonstiges">Sonstiges</option>
        <option value="einnahme">Einnahme</option>
        <option value="ausgabe">Ausgabe</option>
      </select>

      <button id="money-add-btn">Hinzufügen</button>
    </div>

    <div class="money-summary">
      <h3>Gesamtstand</h3>
      <p id="money-total">Wird berechnet…</p>
    </div>

    <div class="money-list" id="money-list">
      Wird geladen…
    </div>
  `;

  document.getElementById("money-add-btn").onclick = addMoneyEntry;
  loadMoneyEntries();
}

async function loadMoneyEntries() {
  const { data } = await supabaseClient
    .from("group_money")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const list = document.getElementById("money-list");

  if (!data || !data.length) {
    list.innerHTML = "<p>Noch keine Einträge.</p>";
  } else {
    list.innerHTML = data
      .map(
        (e) => `
        <div class="money-item">
          <strong>${e.amount.toFixed(2)}€</strong>
          <span>${e.description || ""}</span>
          <span class="money-cat ${e.category}">${e.category}</span>
          <small>${new Date(e.created_at).toLocaleDateString()}</small>
        </div>
      `
      )
      .join("");
  }

  updateMoneyTotal(data || []);
}

function updateMoneyTotal(entries) {
  let total = entries.reduce((sum, e) => {
    if (e.category === "ausgabe") return sum - Number(e.amount);
    return sum + Number(e.amount);
  }, 0);

  document.getElementById("money-total").innerHTML =
    total.toFixed(2) + " €";
}

async function addMoneyEntry() {
  const amount = parseFloat(document.getElementById("money-amount").value);
  const desc = document.getElementById("money-desc").value;
  const category = document.getElementById("money-category").value;

  if (!amount) return alert("Bitte Betrag eingeben!");

  await supabaseClient.from("group_money").insert({
    group_id: groupId,
    user_id: session.user.id,
    amount,
    description: desc,
    category,
  });

  loadMoneyEntries();
  loadOverviewMoney(); // Dashboard aktualisieren
}

// =========================================================
// OVERVIEW DASHBOARD (inkl. Chat)
// =========================================================
async function loadOverview() {
  document.getElementById("tab-content").innerHTML = `
    <h2>Gruppen-Dashboard</h2>
    <p class="sub">Zentrale Übersicht aller wichtigen Infos</p>

    <div class="overview-grid">

      <div class="overview-card">
        <div class="icon-box icon-blue"><i class="ri-group-line"></i></div>
        <h3>Mitglieder</h3>
        <p id="ov-members">Lädt...</p>
      </div>

      <div class="overview-card">
        <div class="icon-box icon-yellow"><i class="ri-list-check-3"></i></div>
        <h3>Aufgaben</h3>
        <p id="ov-tasks">Lädt...</p>
        <div class="progress-bar">
          <div id="ov-tasks-fill"></div>
        </div>
      </div>

      <div class="overview-card">
        <div class="icon-box icon-green"><i class="ri-calendar-event-line"></i></div>
        <h3>Nächster Termin</h3>
        <p id="ov-events">Lädt...</p>
      </div>

      <div class="overview-card">
        <div class="icon-box icon-purple"><i class="ri-bank-card-line"></i></div>
        <h3>Kasse</h3>
        <p id="ov-money">Lädt...</p>
      </div>

    </div>

    <h3>Letzte Aktivitäten</h3>
    <div id="ov-activity">Lädt...</div>

    <h3>Gruppen-Chat</h3>
    <div class="chat-box">
      <div id="chat-messages" class="chat-messages"></div>
      <div class="chat-input-row">
        <input id="chat-message-input" placeholder="Nachricht schreiben…">
        <button id="chat-send-btn">Senden</button>
      </div>
    </div>
  `;

  document.getElementById("chat-send-btn").onclick = sendChatMessage;

  loadOverviewMembers();
  loadOverviewTasks();
  loadOverviewEvents();
  loadOverviewMoney();
  loadOverviewActivity();

  loadChatMessages();
  setupChatRealtime();
}

// Mitglieder
async function loadOverviewMembers() {
  const { data } = await supabaseClient
    .from("group_members")
    .select("role")
    .eq("group_id", groupId);

  if (!data) return;

  document.getElementById("ov-members").innerHTML = `
    <strong>${data.length}</strong> Mitglieder
  `;
}

// Aufgaben
async function loadOverviewTasks() {
  const { data } = await supabaseClient
    .from("tasks")
    .select("status")
    .eq("group_id", groupId);

  if (!data) return;

  const total = data.length;
  const open = data.filter((t) => t.status === "open").length;
  const progress = data.filter((t) => t.status === "in_progress").length;
  const done = data.filter((t) => t.status === "done").length;
  const donePct = total ? Math.round((done / total) * 100) : 0;

  document.getElementById("ov-tasks").innerHTML = `
    Offen: ${open}<br>
    In Arbeit: ${progress}<br>
    Erledigt: ${done}
  `;

  document.getElementById("ov-tasks-fill").style.width = donePct + "%";
}

// Termine
async function loadOverviewEvents() {
  const { data } = await supabaseClient
    .from("events")
    .select("*")
    .eq("group_id", groupId)
    .order("date", { ascending: true });

  const box = document.getElementById("ov-events");

  if (!data || data.length === 0) {
    box.innerHTML = "Keine Termine.";
    return;
  }

  const next = data[0];
  box.innerHTML = `
    <strong>${next.title}</strong><br>
    ${next.date}
  `;
}

// Kasse
async function loadOverviewMoney() {
  const { data } = await supabaseClient
    .from("group_money")
    .select("amount, category")
    .eq("group_id", groupId);

  if (!data) return;

  let total = 0;
  data.forEach((e) => {
    if (e.category === "ausgabe") total -= Number(e.amount);
    else total += Number(e.amount);
  });

  document.getElementById("ov-money").innerHTML = `
    Gesamt: <strong>${total.toFixed(2)} €</strong>
  `;
}

// Aktivitäten
async function loadOverviewActivity() {
  const { data } = await supabaseClient
    .from("group_activity")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(5);

  const box = document.getElementById("ov-activity");

  if (!data || data.length === 0) {
    box.innerHTML = "<p>Keine Aktivitäten.</p>";
    return;
  }

  box.innerHTML = data
    .map(
      (a) => `
    <div class="activity-item">
      <small>${new Date(a.created_at).toLocaleString("de-DE")}</small><br>
      ${a.message}
    </div>
  `
    )
    .join("");
}

// Einfacher Logger
async function logActivity(type, message) {
  try {
    await supabaseClient.from("group_activity").insert({
      group_id: groupId,
      user_id: session?.user?.id || null,
      type,
      message,
    });
  } catch (e) {
    console.warn("group_activity Tabelle nicht verfügbar:", e.message);
  }
}

// =========================================================
// BACK BUTTON + LEAVE GROUP
// =========================================================
document.getElementById("back-btn").onclick = () => {
  window.location = "dashboard.html";
};

document.getElementById("leave-group-btn").onclick = leaveGroup;

async function leaveGroup() {
  if (!confirm("Willst du die Gruppe wirklich verlassen?")) return;

  await supabaseClient
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", session.user.id);

  alert("Du hast die Gruppe verlassen.");
  window.location = "dashboard.html";
}

// =========================================================
// UPDATE GROUP AVATAR
// =========================================================
function updateAvatar(name) {
  const span = document.getElementById("group-avatar-letter");
  if (!span) return;
  span.innerText = name.charAt(0).toUpperCase();
}

// =========================================================
// CHAT
// =========================================================
async function loadChatMessages() {
    const { data, error } = await supabaseClient
        .from("group_messages")
        .select("id, message_text, created_at, user_id, profiles(name)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    renderChatMessages(data);
}



function renderChatMessages(messages) {
    const box = document.getElementById("chat-messages");

    box.innerHTML = messages
        .map(m => `
            <div class="chat-msg">
                <div class="chat-msg-user">${m.profiles?.name || "Unbekannt"}</div>
                <div class="chat-msg-text">${m.message_text}</div>
                <div class="chat-msg-time">${new Date(m.created_at).toLocaleTimeString()}</div>
            </div>
        `)
        .join("");

    box.scrollTop = box.scrollHeight;
}


async function sendChatMessage() {
    const input = document.getElementById("chat-message-input");
    const text = input.value.trim();

    if (!text) return;

    const { data: { session } } = await supabaseClient.auth.getSession();

    await supabaseClient.from("group_messages").insert({
        group_id: groupId,
        user_id: session.user.id,
        message_text: text
    });

    input.value = "";
}

function setupChatRealtime() {
  if (chatChannel) return; // nur einmal abonnieren

  chatChannel = supabaseClient
    .channel("group-chat-" + groupId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "group_messages",
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        const msg = payload.new;
        const list = document.getElementById("chat-messages");
        if (!list) return;

        list.innerHTML += `
          <div class="chat-msg">
            <div class="chat-user">${msg.user_id.substring(0, 6)}</div>
            <div class="chat-text">${msg.message_text}</div>
            <div class="chat-time">${new Date(
              msg.created_at
            ).toLocaleTimeString()}</div>
          </div>
        `;
        list.scrollTop = list.scrollHeight;
      }
    )
    .subscribe();
}
function renderChatUI() {
    document.getElementById("tab-content").innerHTML = `
        <h2>Gruppen-Chat</h2>

        <div id="chat-box" class="chat-box">
            <div id="chat-messages" class="chat-messages">Lade Nachrichten...</div>
        </div>

        <div class="chat-input-area">
            <input id="chat-message-input" type="text" placeholder="Nachricht eingeben..." />
            <button id="chat-send-btn">Senden</button>
        </div>
    `;

    document.getElementById("chat-send-btn").onclick = sendChatMessage;

    loadChatMessages(); // Nachrichten laden
}

// =========================================================
// INIT PAGE
// =========================================================
async function initGroupPage() {
  await loadSession();
  await loadUserRole();
  await loadGroup();
  loadOverview();
}

initGroupPage();

supabaseClient
    .channel("chat-" + groupId)
    .on(
        "postgres_changes",
        {
            event: "INSERT",
            schema: "public",
            table: "group_messages",
            filter: `group_id=eq.${groupId}`
        },
        async (payload) => {
            const msg = payload.new;

            // Profilnamen abrufen
            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("name")
                .eq("id", msg.user_id)
                .single();

            const box = document.getElementById("chat-messages");
            if (!box) return;

            box.innerHTML += `
                <div class="chat-msg">
                    <div class="chat-msg-user">${profile?.name || "Unbekannt"}</div>
                    <div class="chat-msg-text">${msg.message_text}</div>
                    <div class="chat-msg-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
                </div>
            `;

            box.scrollTop = box.scrollHeight;
        }
    )
    .subscribe();

