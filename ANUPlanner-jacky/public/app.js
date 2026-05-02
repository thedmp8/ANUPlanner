const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messagesElement = document.querySelector("#messages");
const sendButton = document.querySelector("#send-button");
const statusPill = document.querySelector("#status-pill");
const statusText = document.querySelector("#status-text");
const assessmentNotesInput = document.querySelector("#assessment-notes");
const generateAssessmentButton = document.querySelector("#generate-assessment-button");
const askButton = document.querySelector("#ask-button");
const assessmentStatus = document.querySelector("#assessment-status");
const assessmentReport = document.querySelector("#assessment-report");
const courseSearchInput = document.querySelector("#course-search-input");
const courseResults = document.querySelector("#course-results");
const courseCount = document.querySelector("#course-count");
const preferenceCount = document.querySelector("#preference-count");
const preferenceList = document.querySelector("#preference-list");
const clearPreferencesButton = document.querySelector("#clear-preferences");
const programSearchInput = document.querySelector("#program-search-input");
const programResults = document.querySelector("#program-results");
const programCount = document.querySelector("#program-count");
const exchangePreferenceCount = document.querySelector("#exchange-preference-count");
const exchangePreferenceList = document.querySelector("#exchange-preference-list");
const clearExchangePreferencesButton = document.querySelector("#clear-exchange-preferences");

const MAX_PREFERENCES = 5;
const MAX_EXCHANGE_PREFERENCES = 5;
const STORAGE_KEY = "anu-course-preferences";
const EXCHANGE_STORAGE_KEY = "anu-exchange-preferences";
const ASSESSMENT_STORAGE_KEY = "anu-last-exchange-assessment";
const messages = [];
let preferences = loadPreferences();
let exchangePreferences = loadExchangePreferences();
let courses = [];
let electiveSubjectAreas = [];
let programs = [];
let assessmentProgressTimer = null;
let assessmentProgressStartedAt = 0;
let assessmentProgressMessage = "";

renderMessages();
renderPreferences();
renderExchangePreferences();
loadCourses();
loadElectiveSubjectAreas();
loadPrograms();
restoreSavedAssessment();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = input.value.trim();

  if (!content || sendButton.disabled) {
    return;
  }

  messages.push({ role: "user", content });
  input.value = "";
  resizeInput();
  renderMessages();
  setLoading(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    messages.push({ role: "assistant", content: data.reply || "No response returned." });
    setStatus("Ready");
  } catch (error) {
    messages.push({
      role: "assistant",
      content: error.message,
      isError: true
    });
    setStatus("Error", true);
  } finally {
    setLoading(false);
    renderMessages();
    if (!askButton.hidden) {
      assessmentNotesInput.focus();
    }
  }
});

generateAssessmentButton.addEventListener("click", generateExchangeAssessment);

input.addEventListener("input", resizeInput);
courseSearchInput.addEventListener("input", renderCourseResults);
courseResults.addEventListener("click", handleCourseResultClick);
preferenceList.addEventListener("click", handlePreferenceClick);
clearPreferencesButton.addEventListener("click", clearPreferences);
programSearchInput.addEventListener("input", renderProgramResults);
programResults.addEventListener("click", handleProgramResultClick);
exchangePreferenceList.addEventListener("click", handleExchangePreferenceClick);
clearExchangePreferencesButton.addEventListener("click", clearExchangePreferences);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

askButton.addEventListener("click", sendFollowUp);

assessmentNotesInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !askButton.hidden) {
    event.preventDefault();
    sendFollowUp();
  }
});

function sendFollowUp() {
  const content = assessmentNotesInput.value.trim();
  if (!content || askButton.disabled) return;
  input.value = content;
  assessmentNotesInput.value = "";
  form.requestSubmit();
}

function renderMessages() {
  messagesElement.replaceChildren(
    ...messages.map((message) => {
      const node = document.createElement("article");
      node.className = `message ${message.role}${message.isError ? " error" : ""}`;
      node.textContent = message.content;
      return node;
    })
  );

  const scrollArea = messagesElement.closest(".report-chat-area") || messagesElement;
  scrollArea.scrollTop = scrollArea.scrollHeight;
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
  input.disabled = isLoading;
  askButton.disabled = isLoading;
  assessmentNotesInput.disabled = isLoading;

  if (isLoading) {
    setStatus("Thinking");
    statusPill.classList.add("loading");
  } else {
    statusPill.classList.remove("loading");
  }
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusPill.classList.toggle("error", isError);
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

async function loadCourses() {
  try {
    const response = await fetch("/courses.json");

    if (!response.ok) {
      throw new Error("Could not load courses.json");
    }

    const data = await response.json();
    courses = Array.isArray(data) ? data : [];
    updateCourseCount();
    renderCourseResults();
  } catch (error) {
    courseCount.textContent = "Unavailable";
    courseResults.replaceChildren(createEmptyState(error.message));
  }
}

async function loadElectiveSubjectAreas() {
  try {
    const response = await fetch("/elective_subject_areas.json");

    if (!response.ok) {
      throw new Error("Could not load elective_subject_areas.json");
    }

    const data = await response.json();
    electiveSubjectAreas = Array.isArray(data)
      ? data.map((area) => String(area).trim()).filter(Boolean)
      : [];
    updateCourseCount();
    renderCourseResults();
  } catch (error) {
    electiveSubjectAreas = [];
    updateCourseCount();
  }
}

async function loadPrograms() {
  try {
    const response = await fetch("/anu_programs.json");

    if (!response.ok) {
      throw new Error("Could not load anu_programs.json");
    }

    const data = await response.json();
    programs = Array.isArray(data) ? data : [];
    programCount.textContent = `${programs.length.toLocaleString()} programs`;
    renderProgramResults();
  } catch (error) {
    programCount.textContent = "Unavailable";
    programResults.replaceChildren(createEmptyState(error.message));
  }
}

function renderCourseResults() {
  const query = courseSearchInput.value.trim().toLowerCase();

  if (!query) {
    courseResults.replaceChildren(createEmptyState("Search by course code, course name, or elective area."));
    return;
  }

  const terms = query.split(/\s+/).filter(Boolean);
  const courseMatches = courses
    .filter((course) => {
      const searchableText = String(course.search || `${course.code || ""} ${course.title || ""}`)
        .toLowerCase();
      return terms.every((term) => searchableText.includes(term));
    })
    .map((course) => ({
      type: "course",
      id: `course:${course.code || course.title || ""}`,
      title: course.title || "Untitled course",
      label: course.code || "No code"
    }));
  const electiveMatches = electiveSubjectAreas
    .filter((area) => terms.every((term) => area.toLowerCase().includes(term)))
    .map((area) => ({
      type: "elective",
      id: `elective:${area}`,
      title: area,
      label: "Elective subject area"
    }));
  const matches = [...courseMatches, ...electiveMatches].slice(0, 40);

  if (!matches.length) {
    courseResults.replaceChildren(createEmptyState("No matching courses found."));
    return;
  }

  courseResults.replaceChildren(
    ...matches.map((course) => {
      const item = document.createElement("article");
      item.className = `finder-result ${course.type}`;

      const label = document.createElement("strong");
      label.textContent = course.label;

      const title = document.createElement("span");
      title.textContent = course.title;

      const actions = document.createElement("div");
      actions.className = "result-actions";

      if (course.type === "elective") {
        actions.append(
          createActionButton("Add 1", "add", course.id, course.type, course.label, course.title, 1),
          createActionButton("Add 4", "add", course.id, course.type, course.label, course.title, 4)
        );
      } else {
        actions.append(
          createActionButton("Add", "add", course.id, course.type, course.label, course.title, 1)
        );
      }

      item.append(label, title, actions);
      return item;
    })
  );
}

function handleCourseResultClick(event) {
  const button = event.target.closest("button[data-action='add']");

  if (!button) {
    return;
  }

  addPreference(
    {
      id: button.dataset.id,
      type: button.dataset.type,
      label: button.dataset.label,
      title: button.dataset.title
    },
    Number(button.dataset.amount || 1)
  );
}

function addPreference(item, requestedAmount) {
  const remaining = MAX_PREFERENCES - preferences.length;

  if (remaining <= 0) {
    return;
  }

  const amount = Math.min(Math.max(requestedAmount, 1), remaining);

  if (item.type === "course" && preferences.some((preference) => preference.id === item.id)) {
    return;
  }

  for (let index = 0; index < amount; index += 1) {
    preferences.push({
      ...item,
      slotId: `${item.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`
    });
  }

  savePreferences();
  renderPreferences();
  renderCourseResults();
}

function handlePreferenceClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = button.dataset.id;
  const index = preferences.findIndex((item) => item.slotId === id);
  const preference = preferences[index];

  if (!preference) {
    return;
  }

  if (button.dataset.action === "remove") {
    preferences.splice(index, 1);
  }

  if (button.dataset.action === "up" && index > 0) {
    [preferences[index - 1], preferences[index]] = [preferences[index], preferences[index - 1]];
  }

  if (button.dataset.action === "down" && index < preferences.length - 1) {
    [preferences[index], preferences[index + 1]] = [preferences[index + 1], preferences[index]];
  }

  savePreferences();
  renderPreferences();
  renderCourseResults();
}

function renderPreferences() {
  const total = preferences.length;
  preferenceCount.textContent = `${total} / ${MAX_PREFERENCES} selected`;
  clearPreferencesButton.disabled = total === 0;

  preferenceList.replaceChildren(
    ...Array.from({ length: MAX_PREFERENCES }, (_, index) => {
      const preference = preferences[index];
      const item = document.createElement("article");
      item.className = `preference-item ${preference ? preference.type : "empty"}`;

      const rank = document.createElement("strong");
      rank.className = "preference-rank";
      rank.textContent = String(index + 1);

      const text = document.createElement("div");
      text.className = "preference-text";

      const label = document.createElement("strong");
      label.textContent = preference?.label || "Empty preference";

      const title = document.createElement("span");
      title.textContent = preference?.title || "Add a course or elective from the search results.";

      text.append(label, title);

      const actions = document.createElement("div");
      actions.className = "preference-actions";

      if (preference) {
        actions.append(
          createPreferenceButton("↑", "up", preference.slotId, index === 0, "Move up"),
          createPreferenceButton("↓", "down", preference.slotId, index === preferences.length - 1, "Move down"),
          createPreferenceButton("×", "remove", preference.slotId, false, "Remove")
        );
      }

      item.append(rank, text, actions);
      return item;
    })
  );
}

function clearPreferences() {
  preferences = [];
  savePreferences();
  renderPreferences();
  renderCourseResults();
}

function createActionButton(text, action, id, type, label, title, amount) {
  const button = document.createElement("button");
  const existing = preferences.find((preference) => preference.id === id);
  const isDuplicateCourse = type === "course" && Boolean(existing);

  button.type = "button";
  button.className = "small-button";
  button.textContent = isDuplicateCourse ? "Added" : text;
  button.disabled = preferences.length >= MAX_PREFERENCES || isDuplicateCourse;
  button.dataset.action = action;
  button.dataset.id = id;
  button.dataset.type = type;
  button.dataset.label = label;
  button.dataset.title = title;
  button.dataset.amount = String(amount);
  return button;
}

function createPreferenceButton(text, action, id, disabled = false, title = text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.textContent = text;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.disabled = disabled;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

function savePreferences() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function loadPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    const cleanItems = parsed
      .filter((item) => ["course", "elective"].includes(item.type))
      .map((item) => ({
        id: String(item.id || ""),
        slotId: item.slotId ? String(item.slotId) : "",
        type: item.type,
        label: String(item.label || ""),
        title: String(item.title || ""),
        count: Math.max(1, Number(item.count || 1))
      }))
      .filter((item) => item.id && item.title);
    const expandedItems = [];

    for (const item of cleanItems) {
      if (expandedItems.length >= MAX_PREFERENCES) {
        break;
      }

      const count = item.slotId ? 1 : item.count;

      for (let index = 0; index < count && expandedItems.length < MAX_PREFERENCES; index += 1) {
        expandedItems.push({
          id: item.id,
          slotId: item.slotId || `${item.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          type: item.type,
          label: item.label,
          title: item.title
        });
      }
    }

    return expandedItems;
  } catch {
    return [];
  }
}

function updateCourseCount() {
  if (!courses.length && !electiveSubjectAreas.length) {
    courseCount.textContent = "Loading";
    return;
  }

  courseCount.textContent =
    `${courses.length.toLocaleString()} courses + ` +
    `${electiveSubjectAreas.length.toLocaleString()} electives`;
}

function renderProgramResults() {
  const query = programSearchInput.value.trim().toLowerCase();

  if (!query) {
    programResults.replaceChildren(createEmptyState("Search by university, city, country, or region."));
    return;
  }

  const terms = query.split(/\s+/).filter(Boolean);
  const matches = programs
    .filter((program) => {
      const searchableText = String(
        program.search ||
          `${program.name || ""} ${program.city || ""} ${program.country || ""} ${program.region || ""}`
      ).toLowerCase();
      return terms.every((term) => searchableText.includes(term));
    })
    .slice(0, 40);

  if (!matches.length) {
    programResults.replaceChildren(createEmptyState("No matching exchange programs found."));
    return;
  }

  programResults.replaceChildren(
    ...matches.map((program) => {
      const item = document.createElement("article");
      item.className = "finder-result";
      const id = `program:${program.name || ""}:${program.city || ""}:${program.country || ""}`;

      const name = document.createElement("strong");
      name.textContent = program.name || "Unnamed program";

      const location = document.createElement("span");
      location.textContent = [program.city, program.country, program.region].filter(Boolean).join(" - ");

      const actions = document.createElement("div");
      actions.className = "result-actions";
      actions.append(
        createExchangeActionButton(
          "Add",
          id,
          program.name || "Unnamed program",
          location.textContent || "No location"
        )
      );

      item.append(name, location, actions);
      return item;
    })
  );
}

function handleProgramResultClick(event) {
  const button = event.target.closest("button[data-action='add-exchange']");

  if (!button) {
    return;
  }

  addExchangePreference({
    id: button.dataset.id,
    title: button.dataset.title,
    label: button.dataset.label
  });
}

function addExchangePreference(item) {
  if (exchangePreferences.length >= MAX_EXCHANGE_PREFERENCES) {
    return;
  }

  if (exchangePreferences.some((preference) => preference.id === item.id)) {
    return;
  }

  exchangePreferences.push({
    ...item,
    slotId: `${item.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  });

  saveExchangePreferences();
  renderExchangePreferences();
  renderProgramResults();
}

function handleExchangePreferenceClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = button.dataset.id;
  const index = exchangePreferences.findIndex((item) => item.slotId === id);
  const preference = exchangePreferences[index];

  if (!preference) {
    return;
  }

  if (button.dataset.action === "remove") {
    exchangePreferences.splice(index, 1);
  }

  if (button.dataset.action === "up" && index > 0) {
    [exchangePreferences[index - 1], exchangePreferences[index]] = [
      exchangePreferences[index],
      exchangePreferences[index - 1]
    ];
  }

  if (button.dataset.action === "down" && index < exchangePreferences.length - 1) {
    [exchangePreferences[index], exchangePreferences[index + 1]] = [
      exchangePreferences[index + 1],
      exchangePreferences[index]
    ];
  }

  saveExchangePreferences();
  renderExchangePreferences();
  renderProgramResults();
}

function renderExchangePreferences() {
  const total = exchangePreferences.length;
  exchangePreferenceCount.textContent = `${total} / ${MAX_EXCHANGE_PREFERENCES} selected`;
  clearExchangePreferencesButton.disabled = total === 0;

  exchangePreferenceList.replaceChildren(
    ...Array.from({ length: MAX_EXCHANGE_PREFERENCES }, (_, index) => {
      const preference = exchangePreferences[index];
      const item = document.createElement("article");
      item.className = `preference-item exchange ${preference ? "" : "empty"}`;

      const rank = document.createElement("strong");
      rank.className = "preference-rank";
      rank.textContent = String(index + 1);

      const text = document.createElement("div");
      text.className = "preference-text";

      const title = document.createElement("strong");
      title.textContent = preference?.title || "Empty exchange preference";

      const label = document.createElement("span");
      label.textContent = preference?.label || "Add a program from the exchange search results.";

      text.append(title, label);

      const actions = document.createElement("div");
      actions.className = "preference-actions";

      if (preference) {
        actions.append(
          createPreferenceButton("↑", "up", preference.slotId, index === 0, "Move up"),
          createPreferenceButton(
            "↓",
            "down",
            preference.slotId,
            index === exchangePreferences.length - 1,
            "Move down"
          ),
          createPreferenceButton("×", "remove", preference.slotId, false, "Remove")
        );
      }

      item.append(rank, text, actions);
      return item;
    })
  );
}

function clearExchangePreferences() {
  exchangePreferences = [];
  saveExchangePreferences();
  renderExchangePreferences();
  renderProgramResults();
}

function createExchangeActionButton(text, id, title, label) {
  const button = document.createElement("button");
  const existing = exchangePreferences.some((preference) => preference.id === id);

  button.type = "button";
  button.className = "small-button";
  button.textContent = existing ? "Added" : text;
  button.disabled = exchangePreferences.length >= MAX_EXCHANGE_PREFERENCES || existing;
  button.dataset.action = "add-exchange";
  button.dataset.id = id;
  button.dataset.title = title;
  button.dataset.label = label;
  return button;
}

function saveExchangePreferences() {
  localStorage.setItem(EXCHANGE_STORAGE_KEY, JSON.stringify(exchangePreferences));
}

function loadExchangePreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXCHANGE_STORAGE_KEY) || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        id: String(item.id || ""),
        slotId: String(item.slotId || `${item.id || ""}:${Math.random().toString(36).slice(2)}`),
        title: String(item.title || ""),
        label: String(item.label || "")
      }))
      .filter((item) => item.id && item.title)
      .slice(0, MAX_EXCHANGE_PREFERENCES);
  } catch {
    return [];
  }
}

async function generateExchangeAssessment() {
  const plan = buildAssessmentPlan();

  if (!plan.course_preferences.length) {
    renderAssessmentError("Add at least one course or elective preference first.");
    return;
  }

  if (!plan.destination_preferences.length) {
    renderAssessmentError("Add at least one exchange preference first.");
    return;
  }

  generateAssessmentButton.disabled = true;
  startAssessmentProgress("Starting assessment request.");
  setStatus("Assessing");
  statusPill.classList.add("loading");

  try {
    const response = await fetch("/api/exchange-assessment-stream", {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ plan })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Assessment request failed");
    }

    const data = await readAssessmentStream(response, (event, payload) => {
      if (event === "status" || event === "heartbeat") {
        updateAssessmentProgress(payload.message || "Assessment is still running.");
      }
    });

    renderAssessmentReport(data.assessment);
    saveAssessmentResult(data.assessment, data.plan || plan);
    assessmentStatus.textContent = "Assessment generated and saved in this browser.";
    setStatus("Ready");
    assessmentNotesInput.placeholder = "Ask a follow-up question...";
    assessmentNotesInput.value = "";
    askButton.hidden = false;
  } catch (error) {
    renderAssessmentError(error.message);
    setStatus("Error", true);
  } finally {
    stopAssessmentProgress();
    generateAssessmentButton.disabled = false;
    statusPill.classList.remove("loading");
  }
}

async function readAssessmentStream(response, onEvent) {
  if (!response.body) {
    throw new Error("This browser could not read the assessment progress stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completedPayload = null;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      const event = parseServerEvent(eventText);

      if (!event) {
        continue;
      }

      if (event.name === "error") {
        throw new Error(event.payload.error || "Assessment failed.");
      }

      if (event.name === "complete") {
        completedPayload = event.payload;
      }

      onEvent(event.name, event.payload);
    }
  }

  if (!completedPayload) {
    throw new Error("The assessment stream ended before a result was returned.");
  }

  return completedPayload;
}

function parseServerEvent(eventText) {
  const lines = eventText.split("\n");
  let name = "message";
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      name = line.slice(6).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return {
    name,
    payload: JSON.parse(dataLines.join("\n"))
  };
}

function buildAssessmentPlan() {
  return {
    home_university: "Australian National University",
    course_preferences: preferences.map((preference) => {
      if (preference.type === "course") {
        return {
          type: "specific_course",
          code: preference.label,
          title: preference.title
        };
      }

      return {
        type: "elective",
        subject_area: stripElectivePrefix(preference.title)
      };
    }),
    destination_preferences: exchangePreferences.map((preference) => {
      const location = parseExchangeLocation(preference.label);

      return {
        type: "university",
        value: cleanExchangeProgramName(preference.title),
        city: location.city,
        country: location.country,
        region: location.region
      };
    }),
    desired_exchange_load: "full-time semester",
    notes: assessmentNotesInput.value.trim()
  };
}

function stripElectivePrefix(value) {
  return String(value || "").replace(/^Elective\s*-\s*/i, "").trim() || String(value || "");
}

function cleanExchangeProgramName(value) {
  return String(value || "")
    .replace(/^Exchange Program\s*-\s*/i, "")
    .replace(/^Semester Program\s*-\s*/i, "")
    .replace(/^Short Program\s*-\s*/i, "")
    .trim();
}

function parseExchangeLocation(value) {
  const [city = "", country = "", region = ""] = String(value || "")
    .split(" - ")
    .map((part) => part.trim());

  return { city, country, region };
}

function startAssessmentProgress(message) {
  assessmentProgressStartedAt = Date.now();
  assessmentProgressMessage = message;
  assessmentReport.replaceChildren(createAssessmentProgressCard());
  updateAssessmentProgress(message);
  assessmentProgressTimer = window.setInterval(() => updateAssessmentProgress(), 1000);
}

function updateAssessmentProgress(message = assessmentProgressMessage) {
  assessmentProgressMessage = message;
  const elapsedSeconds = Math.round((Date.now() - assessmentProgressStartedAt) / 1000);
  const elapsedText = formatElapsedTime(elapsedSeconds);
  const status = `${assessmentProgressMessage} Elapsed: ${elapsedText}`;
  const messageElement = document.querySelector("#assessment-progress-message");
  const elapsedElement = document.querySelector("#assessment-progress-elapsed");

  assessmentStatus.textContent = status;

  if (messageElement) {
    messageElement.textContent = assessmentProgressMessage;
  }

  if (elapsedElement) {
    elapsedElement.textContent = `Elapsed: ${elapsedText}`;
  }
}

function stopAssessmentProgress() {
  window.clearInterval(assessmentProgressTimer);
  assessmentProgressTimer = null;
}

function createAssessmentProgressCard() {
  const card = document.createElement("article");
  card.className = "report-card progress-card";

  const heading = createElement("h3", "", "Assessment in progress");
  const pulse = document.createElement("span");
  pulse.className = "progress-pulse";
  pulse.setAttribute("aria-hidden", "true");
  heading.prepend(pulse);

  const message = createElement("p", "", "");
  message.id = "assessment-progress-message";

  const elapsed = createElement("p", "progress-elapsed", "");
  elapsed.id = "assessment-progress-elapsed";

  card.append(heading, message, elapsed);
  return card;
}

function formatElapsedTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderAssessmentError(message) {
  assessmentStatus.textContent = message;
  assessmentReport.replaceChildren(createReportCard("Error", [createParagraph(message)]));
}

function saveAssessmentResult(assessment, plan) {
  localStorage.setItem(
    ASSESSMENT_STORAGE_KEY,
    JSON.stringify({
      assessment,
      plan,
      savedAt: new Date().toISOString()
    })
  );
}

function restoreSavedAssessment() {
  const savedAssessment = loadSavedAssessment();

  if (!savedAssessment) {
    return;
  }

  renderAssessmentReport(savedAssessment.assessment);
  assessmentStatus.textContent = "Showing the last generated assessment. Generate again to update it.";
  assessmentNotesInput.placeholder = "Ask a follow-up question...";
  assessmentNotesInput.value = "";
  askButton.hidden = false;
}

function loadSavedAssessment() {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSESSMENT_STORAGE_KEY) || "null");

    if (!saved?.assessment) {
      return null;
    }

    return saved;
  } catch {
    localStorage.removeItem(ASSESSMENT_STORAGE_KEY);
    return null;
  }
}

function renderAssessmentReport(assessment) {
  if (!assessment || typeof assessment !== "object") {
    renderAssessmentError("No structured assessment was returned.");
    return;
  }

  const universities = getUniversityAssessments(assessment);

  if (!universities.length) {
    renderAssessmentError("No university assessments were returned.");
    return;
  }

  const sections = [
    createReportCard("Overall verdict", [createBadge(assessment.summary?.overall_verdict || "No verdict")]),
    ...universities.map(renderUniversityAssessment)
  ].filter(Boolean);

  assessmentReport.replaceChildren(...sections);
}

function getUniversityAssessments(assessment) {
  if (Array.isArray(assessment.university_assessments)) {
    return assessment.university_assessments;
  }

  if (!Array.isArray(assessment.destinations_assessed)) {
    return [];
  }

  return assessment.destinations_assessed.map((destination) => {
    const compatibility = destination.course_compatibility || {};
    const eligibility = destination.exchange_eligibility || {};
    const location = destination.location || {};
    const firstElective = compatibility.elective_matches?.[0] || {};

    return {
      university: destination.destination || "Unnamed university",
      location: [location.city, location.country, location.region].filter(Boolean).join(", "),
      overall_verdict: compatibility.verdict || "Possible fit",
      confidence: compatibility.confidence || eligibility.confidence || "Medium",
      summary_paragraph: [eligibility.notes, destination.full_load_assessment?.notes]
        .filter(Boolean)
        .join(" "),
      exchange_program_url: eligibility.evidence_url || "",
      elective_course_search_url: firstElective.course_list_url || "",
      specific_course_substitutes: (compatibility.specific_course_matches || []).map((match) => ({
        home_course: [match.home_course?.code, match.home_course?.title].filter(Boolean).join(" - "),
        host_course: [match.host_substitute?.code, match.host_substitute?.title].filter(Boolean).join(" - "),
        url: match.host_substitute?.url || ""
      }))
    };
  });
}

function renderUniversityAssessment(assessment) {
  const card = document.createElement("article");
  card.className = "destination-card compact-assessment-card";

  const heading = document.createElement("div");
  heading.className = "destination-heading";
  heading.append(
    createElement("h4", "", assessment.university || "Unnamed university"),
    createBadge(assessment.overall_verdict || "No verdict")
  );

  card.append(heading);
  card.append(
    createParagraph(
      [
        assessment.location,
        assessment.confidence ? `Confidence: ${assessment.confidence}` : "",
        assessment.summary_paragraph
      ]
        .filter(Boolean)
        .join(". ")
    )
  );
  card.append(renderSubstituteList(assessment.specific_course_substitutes || []));
  card.append(
    createDefinitionList([
      ["Exchange program", assessment.exchange_program_url || "No official source found"],
      ["Electives/course search", assessment.elective_course_search_url || "No official source found"]
    ])
  );

  return card;
}

function renderSubstituteList(substitutes) {
  const wrapper = document.createElement("div");
  wrapper.className = "substitute-list";
  wrapper.append(createElement("strong", "", "Specific substitutes"));

  if (!substitutes.length) {
    wrapper.append(createParagraph("No clear specific-course substitute found."));
    return wrapper;
  }

  const list = document.createElement("ul");
  list.append(
    ...substitutes.map((substitute) => {
      const item = document.createElement("li");
      item.append(
        `${substitute.home_course || "Home course"} -> ${substitute.host_course || "Host course"} `,
        createInlineLink(substitute.url)
      );
      return item;
    })
  );
  wrapper.append(list);
  return wrapper;
}

function createInlineLink(url) {
  if (!isUrl(url)) {
    return document.createTextNode("(No official source found)");
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Source";
  return link;
}

function createReportCard(title, children) {
  const section = document.createElement("section");
  section.className = "report-card";
  section.append(createElement("h3", "", title), ...children.filter(Boolean));
  return section;
}

function createMiniCard(children) {
  const card = document.createElement("article");
  card.className = "mini-card";
  card.append(...children.filter(Boolean));
  return card;
}

function createSubsection(title, children) {
  const section = document.createElement("section");
  section.className = "report-subsection";
  section.append(createElement("h5", "", title), ...children);
  return section;
}

function createDefinitionList(rows) {
  const list = document.createElement("dl");
  list.className = "definition-list";

  for (const [term, value] of rows) {
    if (!value) {
      continue;
    }

    list.append(createElement("dt", "", term));
    const description = document.createElement("dd");

    if (isUrl(value)) {
      const link = document.createElement("a");
      link.href = value;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = value;
      description.append(link);
    } else {
      description.textContent = value;
    }

    list.append(description);
  }

  return list;
}

function createList(title, items) {
  if (!items.length) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "report-list";
  wrapper.append(createElement("strong", "", title));
  const list = document.createElement("ul");
  list.append(...items.map((item) => createElement("li", "", item)));
  wrapper.append(list);
  return wrapper;
}

function createBadge(text) {
  const badge = document.createElement("span");
  badge.className = "verdict-badge";
  badge.textContent = text;
  return badge;
}

function createParagraph(text) {
  if (!text) {
    return null;
  }

  return createElement("p", "", text);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  element.textContent = text;
  return element;
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value));
}

function createEmptyState(message) {
  const node = document.createElement("p");
  node.className = "empty-state";
  node.textContent = message;
  return node;
}
