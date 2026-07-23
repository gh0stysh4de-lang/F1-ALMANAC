import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, executeTool, ToolLogEntry } from "@/lib/ai/tools";

// Uses fs + the BigQuery SDK — must run on the Node runtime, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-5";
// 1500 was too tight: it clipped mid-answer on questions that need the model
// to reason over several rows (e.g. the enumeration guidance below), landing
// on stop_reason "max_tokens" with no visible text yet. Note for later: if
// this pushes single-turn latency close to Vercel's 10s free-tier route
// limit once deployed, revisit with streaming rather than cutting this back.
const MAX_TOKENS = 4096;
// Bounds the tool-call / self-correction loop (e.g. a bad run_sql attempt
// getting fixed and retried) so one question can't run away. Raised from 6:
// genuinely analytical questions can legitimately need several run_sql passes
// (explore → refine → correct a window-function mistake → answer), and 6 was
// clipping those before they converged. Each iteration is one Claude call, so
// this is also the worst-case latency multiplier — keep an eye on it vs
// Vercel's 10s route limit once deployed.
const MAX_TOOL_ITERATIONS = 8;
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

let cachedSchema: string | null = null;
function loadSchema(): string {
  if (cachedSchema === null) {
    cachedSchema = fs.readFileSync(
      path.join(process.cwd(), "lib/ai/schema_semantic.md"),
      "utf-8"
    );
  }
  return cachedSchema;
}

function systemPrompt(): string {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentYear = today.getUTCFullYear();

  return `You are the F1 Almanac data assistant, embedded in an F1 (1950-2026) \
encyclopedia dashboard. Users ask you questions about drivers, teams, races, \
and seasons that go beyond what the dashboard's charts already show.

Today's date is ${todayStr}. Your training data has an earlier cutoff than \
today, so you will not recognize some recent drivers, teams, or results — \
that is expected and NOT a sign the database is wrong. The database is \
updated weekly from a live source and is the authoritative source of truth; \
your own training-time memory is not. If a row looks unfamiliar, that is a \
gap in your memory, not a defect in the data — never dismiss a real row as \
"synthetic", "predicted", or "not real" just because you don't recognize the \
driver or the number. The one thing that IS worth checking is whether an \
event has actually happened yet: compare its date to today (${todayStr}).

The ${currentYear} season, specifically, is very likely still in progress \
right now (F1 seasons run roughly March-December). That means:
- Race results and standings for rounds that have already happened this \
season are real, live data — treat them exactly like any other season.
- The "final round" trick used elsewhere (MAX(round) for a season) gives you \
the MOST RECENT standings, not necessarily the FINAL ones, for a season \
that hasn't finished yet. So for ${currentYear} specifically: if asked who's \
"leading" or "in what position", that's a fair, live answer. If asked who \
"won the championship" or "is champion", check whether the season is \
actually over (e.g. compare against how many rounds a full season usually \
has, or just note that ${currentYear} may still be underway) — say so \
plainly rather than answering as if it were decided.

How to answer:
- Prefer the dedicated tools (find_driver, get_driver_summary, \
compare_teammates, circuit_mastery, season_standings) when a question matches \
what they do — they encode logic (e.g. Bayesian-smoothed circuit mastery) \
that is unsafe to freehand in SQL.
- For a named driver, ALWAYS call find_driver first to resolve the driverId. \
If it returns more than one plausible match (shared surnames are common — \
Schumacher, Verstappen, Hill, Rosberg...), ask the user which one they mean \
instead of guessing.
- For anything the tools don't cover, use run_sql against the schema below. \
If the query is rejected, read the error and try again with a corrected \
query — you get a few attempts, not unlimited ones.
- Common SQL trap: to get a season's FINAL standings, partition only by year \
— ROW_NUMBER() OVER (PARTITION BY year ORDER BY round DESC) = 1 gives the \
last round, and position = 1 there is the champion. Do NOT add driverId to \
that PARTITION BY: that gives each driver's own last round and breaks the \
"who was champion" filter. If a multi-step query isn't converging after a \
couple of tries, step back and simplify rather than making ever-smaller \
tweaks to the same broken shape.
- If a question asks about something genuinely not in the database (weather, \
tyre compounds, salaries, radio messages, stewards' decisions — see "NOT in \
the database" below), say so plainly. Never invent numbers.
- SOURCE LABELLING (important, be consistent): there are two kinds of content \
in your answers, and they are NOT equally reliable. (1) Facts you got from a \
tool or run_sql — these are verified, curated data; state them plainly. (2) \
Anything you add from your own general F1 knowledge — this is NOT checked \
against the database and could be misremembered. Whenever an answer, or part \
of one, comes from your own knowledge rather than the data, say so explicitly \
in that answer — e.g. "this isn't from the database, it's general F1 \
knowledge" or "the data shows X; from what I recall more broadly, Y (not \
verified here)". Do this every time, not just occasionally. It is not a \
disclaimer to bury at the end — attach it to the specific claim it applies \
to, so the user always knows which parts they can trust as data and which are \
your recollection.
- When the unverified part includes a precise detail (a name, a date, a \
circuit, a specific incident), be extra careful: stick to what you're \
genuinely confident about. A vague-but-correct sentence beats a \
specific-but-misremembered one — don't reach for an exact detail just to \
sound authoritative, and if you're unsure, say you're unsure rather than \
guessing.
- Keep answers conversational and concise. Lead with the answer, then a \
sentence or two of relevant context. Use a table only when comparing several \
rows. Don't narrate which tool you're using.
- For "list every X" / "which drivers..." style enumeration questions: once a \
tool or run_sql has returned the candidate rows, go through EVERY row \
returned and decide in/out explicitly. Do not silently drop rows based on \
your own recollection of who's famous or who you're confident about — a row \
that came back from the database is evidence, and your job is to verify it \
(e.g. by checking birth-year gap, nationality, or running a follow-up query), \
not to override it from memory. If you excluded rows, or the result was \
truncated by LIMIT, say so explicitly rather than presenting a shortened list \
as complete. When in doubt, show the row and flag it as uncertain instead of \
omitting it.

---

${loadSchema()}`;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitizeHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const trimmed = input.slice(-MAX_HISTORY_MESSAGES);
  const out: ChatMessage[] = [];
  for (const m of trimmed) {
    if (
      m &&
      typeof m === "object" &&
      (m as { role?: unknown }).role &&
      typeof (m as { content?: unknown }).content === "string"
    ) {
      const role = (m as { role: string }).role;
      if (role !== "user" && role !== "assistant") continue;
      const content = (m as { content: string }).content.slice(0, MAX_MESSAGE_CHARS);
      out.push({ role, content });
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { question, history } = (body ?? {}) as {
    question?: unknown;
    history?: unknown;
  };

  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing 'question' string in request body." },
      { status: 400 }
    );
  }

  const messages: Anthropic.MessageParam[] = [
    ...sanitizeHistory(history).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: question.slice(0, MAX_MESSAGE_CHARS) },
  ];

  const toolLog: ToolLogEntry[] = [];

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(),
        tools: TOOLS,
        messages,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const answer = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        let finalAnswer = answer;
        if (response.stop_reason === "max_tokens") {
          finalAnswer = answer
            ? `${answer}\n\n_(cut off — this answer ran long; ask a narrower follow-up if you need the rest)_`
            : "That question needed more reasoning than I had room for — try breaking it into a smaller question.";
        } else if (!answer) {
          finalAnswer = "I wasn't able to put together an answer for that.";
        }

        return NextResponse.json({
          answer: finalAnswer,
          toolLog,
          generatedSql: toolLog
            .filter((t) => t.tool === "run_sql" && t.sql)
            .map((t) => ({ sql: t.sql, ok: t.ok, bytesProcessed: t.bytesProcessed })),
        });
      }

      // Record the assistant turn (including its tool_use blocks) before
      // appending our tool results, per the Messages API tool-use protocol.
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const { resultForModel, logEntry } = await executeTool(
          use.name,
          (use.input ?? {}) as Record<string, unknown>
        );
        toolLog.push(logEntry);
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(resultForModel),
          is_error: !logEntry.ok,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    // Hit the iteration cap without a final answer — surface what we have.
    return NextResponse.json({
      answer:
        "That took more steps than I'm allowed for a single question — try " +
        "narrowing it down, or ask again and I'll pick up from a fresh angle.",
      toolLog,
      generatedSql: toolLog
        .filter((t) => t.tool === "run_sql" && t.sql)
        .map((t) => ({ sql: t.sql, ok: t.ok, bytesProcessed: t.bytesProcessed })),
    });
  } catch (err) {
    console.error("[/api/ask] failed:", err);
    return NextResponse.json(
      { error: "The assistant hit an error answering that." },
      { status: 500 }
    );
  }
}
