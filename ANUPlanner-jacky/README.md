# AI-Buildathon

Simple local website that sends chat messages to the OpenAI API through a Node server.
It also includes a course finder that searches `courses.json` by course code or course name, plus `elective_subject_areas.json` by elective area name.
Students can add up to 8 course/elective preferences, including adding 4 matching electives at once.
The exchange finder searches ANU exchange program data extracted from `anu_programs.xlsx`, and students can add up to 5 exchange preferences.
The exchange assessment button converts the selected preferences into structured JSON, sends it to the OpenAI Responses API with web search enabled, and renders a report-style compatibility assessment.

## Setup

1. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

2. Add your OpenAI API key to `.env`:

   ```bash
   OPENAI_API_KEY=sk-your-api-key-here
   ```

   Optional model settings:

   ```bash
   OPENAI_MODEL=gpt-5.5
   OPENAI_ASSESSMENT_MODEL=gpt-5
   ```

3. Start the website:

   ```bash
   npm start
   ```

4. Open `http://localhost:3001`.

The browser calls `/api/chat` and `/api/exchange-assessment`; the server calls `https://api.openai.com/v1/responses`, so your API key stays server-side.
The assessment endpoint uses the `web_search` tool to check official exchange and course catalogue pages, so generating a report can take longer than a normal chat reply.

If port `3001` is already in use, run the site on another port:

```bash
PORT=3002 npm start
```

To regenerate the exchange program JSON after updating `anu_programs.xlsx`:

```bash
npm run extract:programs
```
