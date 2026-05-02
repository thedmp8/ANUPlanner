import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = resolve(ROOT_DIR, "public");
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_ASSESSMENT_MODEL = "gpt-5";
const EXCHANGE_ASSISTANT_INSTRUCTIONS = `Produce a concise exchange compatibility assessment.

You are an exchange course-matching assistant for university students.

Assess whether a student can plausibly complete requested Australian National University course preferences while on exchange based on:
1. The student's requested course preferences.
2. The student's preferred exchange destinations.
3. Official exchange programme pages.
4. Official host-university course/module catalogues.

Search official and current sources wherever possible. Prioritise:
- Australian National University exchange/partner university database.
- Official host-university exchange/study abroad pages.
- Official host-university course/module catalogues.
- Official faculty/school pages.

Do not rely on rankings, blogs, forums, or unofficial summaries unless official sources are unavailable; clearly mark lower-confidence evidence.

Do not write conversationally. Do not say "I", "we", "I found", or "I searched".
Do not claim guaranteed equivalence or credit approval. Use planning language such as "potential substitute", "likely compatible", "partial match", or "not suitable".
Do not invent course codes, course titles, eligibility, or URLs. If no official source is found, say "No official source found".

Keep the result barebones.
For each university, provide only:
- university name
- one overall verdict from: Strong fit, Possible fit, Weak fit, Not suitable
- confidence from: High, Medium, Low
- a short summary paragraph of no more than 2 concise sentences
- specific course substitutes with source URLs, when found
- one official course/module/unit search URL for general electives at that university
- one official exchange programme or partner URL when available

Avoid long notes, recommendations, alternatives, large risk lists, or detailed study-abroad advice.`;

const EXCHANGE_ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        overall_verdict: {
          type: "string",
          enum: ["Strong fit", "Possible fit", "Weak fit", "Not suitable"]
        }
      },
      required: ["overall_verdict"]
    },
    university_assessments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          university: { type: "string" },
          location: { type: "string" },
          overall_verdict: {
            type: "string",
            enum: ["Strong fit", "Possible fit", "Weak fit", "Not suitable"]
          },
          confidence: {
            type: "string",
            enum: ["High", "Medium", "Low"]
          },
          summary_paragraph: { type: "string" },
          exchange_program_url: { type: "string" },
          elective_course_search_url: { type: "string" },
          specific_course_substitutes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                home_course: { type: "string" },
                host_course: { type: "string" },
                url: { type: "string" }
              },
              required: ["home_course", "host_course", "url"]
            }
          }
        },
        required: [
          "university",
          "location",
          "overall_verdict",
          "confidence",
          "summary_paragraph",
          "exchange_program_url",
          "elective_course_search_url",
          "specific_course_substitutes"
        ]
      }
    },
    disclaimer: { type: "string" }
  },
  required: ["summary", "university_assessments", "disclaimer"]
};

loadDotEnv();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/exchange-assessment-stream") {
      await handleExchangeAssessmentStream(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/exchange-assessment") {
      await handleExchangeAssessment(req, res);
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/courses.json") {
      await serveRootJson("courses.json", "Course data not found", req.method === "HEAD", res);
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/anu_programs.json") {
      await serveRootJson("anu_programs.json", "Program data not found", req.method === "HEAD", res);
      return;
    }

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      url.pathname === "/elective_subject_areas.json"
    ) {
      await serveRootJson(
        "elective_subject_areas.json",
        "Elective subject area data not found",
        req.method === "HEAD",
        res
      );
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(url.pathname, req.method === "HEAD", res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Unexpected server error" });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    const nextPort = PORT + 1;
    console.error(
      `Port ${PORT} is already in use. Stop the existing server or run this app with PORT=${nextPort} npm start.`
    );
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`ChatGPT API website running at http://${displayHost}:${PORT}`);
});

async function handleChat(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    sendJson(res, 500, {
      error: "Missing OPENAI_API_KEY. Add it to .env or set it before starting the server."
    });
    return;
  }

  const body = await readJson(req);
  const messages = normalizeMessages(body.messages);

  if (!messages.some((message) => message.role === "user")) {
    sendJson(res, 400, { error: "Send at least one user message." });
    return;
  }

  const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      instructions:
        process.env.OPENAI_INSTRUCTIONS ||
        "You are a helpful assistant embedded in a simple website. Keep answers concise and practical.",
      input: messages
    })
  });

  const data = await openAIResponse.json().catch(() => ({}));

  if (!openAIResponse.ok) {
    sendJson(res, openAIResponse.status, {
      error: data.error?.message || "OpenAI API request failed."
    });
    return;
  }

  sendJson(res, 200, {
    id: data.id,
    model: data.model,
    reply: extractOutputText(data)
  });
}

async function handleExchangeAssessment(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    sendJson(res, 500, {
      error: "Missing OPENAI_API_KEY. Add it to .env or set it before starting the server."
    });
    return;
  }

  const body = await readJson(req);
  const plan = normalizeExchangePlan(body.plan);

  if (!plan.course_preferences.length) {
    sendJson(res, 400, { error: "Add at least one course or elective preference first." });
    return;
  }

  if (!plan.destination_preferences.length) {
    sendJson(res, 400, { error: "Add at least one exchange preference first." });
    return;
  }

  const result = await createExchangeAssessment(apiKey, plan);
  sendJson(res, 200, result);
}

async function handleExchangeAssessmentStream(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    sendJson(res, 500, {
      error: "Missing OPENAI_API_KEY. Add it to .env or set it before starting the server."
    });
    return;
  }

  const body = await readJson(req);
  const plan = normalizeExchangePlan(body.plan);

  if (!plan.course_preferences.length) {
    sendJson(res, 400, { error: "Add at least one course or elective preference first." });
    return;
  }

  if (!plan.destination_preferences.length) {
    sendJson(res, 400, { error: "Add at least one exchange preference first." });
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  let heartbeat = null;
  let streamOpen = true;
  let completed = false;

  res.on("close", () => {
    if (completed) {
      return;
    }

    streamOpen = false;
    clearInterval(heartbeat);
    controller.abort();
  });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const sendEvent = (event, payload) => {
    if (!streamOpen || res.destroyed) {
      return;
    }

    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const elapsedSeconds = () => Math.round((Date.now() - startedAt) / 1000);

  sendEvent("status", {
    message: "Request received by the local server.",
    elapsed_seconds: elapsedSeconds()
  });

  heartbeat = setInterval(() => {
    sendEvent("heartbeat", {
      message: getAssessmentProgressMessage(elapsedSeconds()),
      elapsed_seconds: elapsedSeconds()
    });
  }, 10_000);

  try {
    sendEvent("status", {
      message: "Asking OpenAI to search official exchange and course sources.",
      elapsed_seconds: elapsedSeconds()
    });

    const result = await createExchangeAssessment(apiKey, plan, controller.signal);
    clearInterval(heartbeat);
    sendEvent("complete", {
      ...result,
      elapsed_seconds: elapsedSeconds()
    });
    completed = true;
    res.end();
  } catch (error) {
    clearInterval(heartbeat);

    if (controller.signal.aborted) {
      return;
    }

    sendEvent("error", {
      error: error.message || "OpenAI exchange assessment request failed.",
      elapsed_seconds: elapsedSeconds()
    });
    completed = true;
    res.end();
  }
}

async function createExchangeAssessment(apiKey, plan, signal) {
  const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_ASSESSMENT_MODEL || DEFAULT_ASSESSMENT_MODEL,
      instructions: EXCHANGE_ASSISTANT_INSTRUCTIONS,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      text: {
        format: {
          type: "json_schema",
          name: "exchange_compatibility_assessment",
          schema: EXCHANGE_ASSESSMENT_SCHEMA,
          strict: true
        }
      },
      input: [
        {
          role: "user",
          content:
            "Return JSON only. Produce an exchange compatibility assessment for this structured plan:\n\n" +
            JSON.stringify(plan, null, 2)
        }
      ]
    })
  });

  const data = await openAIResponse.json().catch(() => ({}));

  if (!openAIResponse.ok) {
    throw new Error(data.error?.message || "OpenAI exchange assessment request failed.");
  }

  const text = extractOutputText(data);
  const assessment = parseJsonOutput(text);

  if (!assessment) {
    throw new Error("The model returned an assessment that could not be parsed as JSON.");
  }

  return {
    id: data.id,
    model: data.model,
    plan,
    assessment
  };
}

async function serveStatic(pathname, headOnly, res) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = resolve(PUBLIC_DIR, `.${relativePath}`);

  if (!filePath.startsWith(`${PUBLIC_DIR}${sep}`) && filePath !== PUBLIC_DIR) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const fileInfo = await stat(filePath);

    if (!fileInfo.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const type = mimeTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });

    if (!headOnly) {
      res.end(await readFile(filePath));
    } else {
      res.end();
    }
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function serveRootJson(fileName, notFoundMessage, headOnly, res) {
  const filePath = resolve(ROOT_DIR, fileName);

  try {
    const fileInfo = await stat(filePath);

    if (!fileInfo.isFile()) {
      sendJson(res, 404, { error: notFoundMessage });
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });

    if (!headOnly) {
      res.end(await readFile(filePath));
    } else {
      res.end();
    }
  } catch {
    sendJson(res, 404, { error: notFoundMessage });
  }
}

function normalizeExchangePlan(plan) {
  const source = plan && typeof plan === "object" ? plan : {};

  return {
    home_university: "Australian National University",
    course_preferences: normalizeCoursePreferences(source.course_preferences),
    destination_preferences: normalizeDestinationPreferences(source.destination_preferences),
    desired_exchange_load: String(source.desired_exchange_load || "full-time semester").slice(0, 120),
    notes: String(source.notes || "").slice(0, 1200)
  };
}

function getAssessmentProgressMessage(elapsedSeconds) {
  if (elapsedSeconds < 20) {
    return "OpenAI request is active.";
  }

  if (elapsedSeconds < 60) {
    return "Still generating. Official source search can take a little while.";
  }

  if (elapsedSeconds < 180) {
    return "Still connected and waiting for the assessment response.";
  }

  return "Still connected. Large plans with multiple universities can take several minutes.";
}

function normalizeCoursePreferences(coursePreferences) {
  if (!Array.isArray(coursePreferences)) {
    return [];
  }

  return coursePreferences
    .map((preference) => {
      if (!preference || typeof preference !== "object") {
        return null;
      }

      if (preference.type === "specific_course") {
        return {
          type: "specific_course",
          code: String(preference.code || "").slice(0, 20),
          title: String(preference.title || "").slice(0, 200)
        };
      }

      if (preference.type === "elective") {
        return {
          type: "elective",
          subject_area: String(preference.subject_area || "").slice(0, 200)
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeDestinationPreferences(destinationPreferences) {
  if (!Array.isArray(destinationPreferences)) {
    return [];
  }

  return destinationPreferences
    .map((preference) => {
      if (!preference || typeof preference !== "object") {
        return null;
      }

      return {
        type: ["university", "city", "country", "region"].includes(preference.type)
          ? preference.type
          : "university",
        value: String(preference.value || "").slice(0, 240),
        city: String(preference.city || "").slice(0, 120),
        country: String(preference.country || "").slice(0, 120),
        region: String(preference.region || "").slice(0, 120)
      };
    })
    .filter((preference) => preference && preference.value)
    .slice(0, 5);
}

function readJson(req) {
  return new Promise((resolvePromise, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolvePromise(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => ["user", "assistant"].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, 8000)
    }))
    .filter((message) => message.content.trim())
    .slice(-20);
}

function parseJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const textParts = [];

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n\n").trim() || "No text response returned.";
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function loadDotEnv() {
  const envPath = resolve(ROOT_DIR, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ||= value;
  }
}
