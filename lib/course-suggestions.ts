// @ts-nocheck
// Course metadata suggestion engine.
//
// Builds a normalized "content corpus" for a course (module names, rich-text
// blocks stripped to plain text, file/video/link block names, quiz question
// text), hashes it for change detection, and generates a suggested title,
// description and tags whose wording carries maximum linkable detail for the
// downstream safety-management system (which matches courses to hazards,
// controls and manual sections purely from title + description keywords).
//
// Generation uses OpenAI when OPENAI_API_KEY is set; otherwise (or on any
// provider failure) an extractive fallback produces the same output shape.
// Outbound calls follow lib/http/bounded-fetch.ts hygiene (hard timeout,
// body always consumed).

import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { boundedFetch } from "@/lib/http/bounded-fetch";

export type CourseCorpus = {
  courseId: string;
  /** Normalized plain-text corpus, section per module. */
  text: string;
  /** sha256 of the normalized corpus (stable across formatting noise). */
  hash: string;
  /** Rough stats for the UI / prompt. */
  moduleCount: number;
  blockCount: number;
  questionCount: number;
};

export type MetadataSuggestion = {
  title: string;
  description: string;
  tags: string[];
  source: "ai" | "extractive";
  model: string | null;
};

/** Strip HTML tags/entities down to readable plain text. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Chunk .in() lists so Supabase URL limits are never exceeded. */
function chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Gather all training content for a course into a normalized corpus.
 * Traversal: courses -> course_modules -> module_content_blocks;
 * quizzes by module_id -> quiz_questions (quiz_id only).
 */
export async function buildCourseCorpus(courseId: string): Promise<CourseCorpus> {
  const admin = supabaseAdmin();

  const { data: modules, error: mErr } = await admin
    .from("course_modules")
    .select("id, type, title, order_index")
    .eq("course_id", courseId)
    .order("type", { ascending: true })
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });
  if (mErr) throw new Error(`Failed to load modules: ${mErr.message}`);

  const moduleIds = (modules ?? []).map((m) => m.id);

  // Content blocks for all modules (chunked)
  const blocks: any[] = [];
  for (const ids of chunk(moduleIds)) {
    const { data, error } = await admin
      .from("module_content_blocks")
      .select("id, module_id, kind, data, order_index")
      .in("module_id", ids)
      .order("order_index", { ascending: true });
    if (error) throw new Error(`Failed to load content blocks: ${error.message}`);
    blocks.push(...(data ?? []));
  }

  // Quizzes -> questions for quiz modules
  const quizModuleIds = (modules ?? [])
    .filter((m) => m.type === "digital_assessment_quiz")
    .map((m) => m.id);
  const quizzes: any[] = [];
  for (const ids of chunk(quizModuleIds)) {
    if (ids.length === 0) continue;
    const { data, error } = await admin
      .from("quizzes")
      .select("id, module_id")
      .in("module_id", ids);
    if (error) throw new Error(`Failed to load quizzes: ${error.message}`);
    quizzes.push(...(data ?? []));
  }
  const quizIds = quizzes.map((q) => q.id);
  const questions: any[] = [];
  for (const ids of chunk(quizIds)) {
    if (ids.length === 0) continue;
    // Column name varies (question/stem/prompt) — select * and map below,
    // same as app/api/modules/[moduleId]/quiz/route.ts.
    const { data, error } = await admin
      .from("quiz_questions")
      .select("*")
      .in("quiz_id", ids)
      .order("order_index", { ascending: true });
    if (error) throw new Error(`Failed to load quiz questions: ${error.message}`);
    questions.push(...(data ?? []));
  }

  const blocksByModule = new Map<string, any[]>();
  for (const b of blocks) {
    const list = blocksByModule.get(b.module_id) ?? [];
    list.push(b);
    blocksByModule.set(b.module_id, list);
  }
  const quizzesByModule = new Map<string, string[]>();
  for (const q of quizzes) {
    const list = quizzesByModule.get(q.module_id) ?? [];
    list.push(q.id);
    quizzesByModule.set(q.module_id, list);
  }
  const questionsByQuiz = new Map<string, any[]>();
  for (const q of questions) {
    const list = questionsByQuiz.get(q.quiz_id) ?? [];
    list.push(q);
    questionsByQuiz.set(q.quiz_id, list);
  }

  const sections: string[] = [];
  let blockCount = 0;
  let questionCount = 0;

  for (const mod of modules ?? []) {
    const lines: string[] = [];
    lines.push(`## Module (${String(mod.type).replace(/_/g, " ")}): ${mod.title ?? "Untitled"}`);

    for (const b of blocksByModule.get(mod.id) ?? []) {
      const d = b.data ?? {};
      switch (b.kind) {
        case "rich_text": {
          const text = htmlToPlainText(String(d.text ?? ""));
          if (text) { lines.push(text); blockCount++; }
          break;
        }
        case "file": {
          const name = String(d.display ?? "").trim();
          if (name) { lines.push(`File: ${name}`); blockCount++; }
          break;
        }
        case "link": {
          const label = String(d.label ?? "").trim() || String(d.url ?? "").trim();
          if (label) { lines.push(`Link: ${label}`); blockCount++; }
          break;
        }
        case "video_embed": {
          const url = String(d.url ?? "").trim();
          const name = String(d.display ?? d.title ?? "").trim();
          if (name) { lines.push(`Video: ${name}`); blockCount++; }
          else if (url) {
            // last path segment as a weak name signal
            const seg = url.split("?")[0].split("/").filter(Boolean).pop() ?? "";
            if (seg) { lines.push(`Video: ${decodeURIComponent(seg)}`); blockCount++; }
          }
          break;
        }
        case "request_document": {
          const label = String(d.label ?? "").trim();
          if (label) { lines.push(`Required document: ${label}`); blockCount++; }
          break;
        }
        case "equipment_form": {
          const title = String(d.title ?? "").trim();
          if (title) { lines.push(`Equipment form: ${title}`); blockCount++; }
          break;
        }
        default:
          break;
      }
    }

    for (const quizId of quizzesByModule.get(mod.id) ?? []) {
      for (const q of questionsByQuiz.get(quizId) ?? []) {
        const text = htmlToPlainText(String(q.question ?? q.stem ?? q.prompt ?? ""));
        if (text) { lines.push(`Quiz question: ${text}`); questionCount++; }
      }
    }

    sections.push(lines.join("\n"));
  }

  const text = sections.join("\n\n").trim();
  // Normalize before hashing so pure whitespace churn doesn't flip the flag.
  const normalized = text.replace(/\s+/g, " ").toLowerCase().trim();
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");

  return {
    courseId,
    text,
    hash,
    moduleCount: (modules ?? []).length,
    blockCount,
    questionCount,
  };
}

/* -------------------------------------------------------------------- */
/* Extractive fallback                                                    */
/* -------------------------------------------------------------------- */

const STOPWORDS = new Set(
  `a an and are as at be been but by can could do does for from had has have how i if in into is it its may might must not of on or our shall should so than that the their them then there these they this to was we were what when where which while who will with would you your all also any each per etc use used using new more most other over under after before during without within about above below between course module training learners learner complete completed section content please ensure following include includes back next click here upload provided provide question answer correct incorrect true false`
    .split(/\s+/)
);

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (w) =>
    w.length > 3 || /^[a-z]/.test(w) === false
      ? w.charAt(0).toUpperCase() + w.slice(1)
      : w
  );
}

/**
 * Extractive suggestion: headings, bolded terms, bullet/list nouns, section
 * numbers pulled straight out of the corpus. Same output shape as the AI path.
 */
export function extractiveSuggestion(
  corpus: CourseCorpus,
  current: { title?: string | null; department?: string | null }
): MetadataSuggestion {
  const text = corpus.text;

  // Section / regulation numbers quoted in content (e.g. "section 4.2", "CAP 393", "Part 145")
  const sectionRefs = Array.from(
    new Set(
      (text.match(/\b(?:section|sect\.?|chapter|part|cap|reg(?:ulation)?|manual)\s*[A-Z]?[\d]+(?:\.\d+)*\b/gi) ?? [])
        .map((s) => s.replace(/\s+/g, " ").trim())
    )
  ).slice(0, 6);

  // Module titles are the strongest topic signal
  const moduleTitles = Array.from(
    new Set(
      (text.match(/^## Module \([^)]*\): (.+)$/gm) ?? []).map((l) =>
        l.replace(/^## Module \([^)]*\): /, "").trim()
      )
    )
  ).filter((t) => !/^untitled|^training module$|^digital quiz$|^onsite/i.test(t));

  // Frequent multi-word phrases (bigrams) and salient single terms
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }

  const topTerms = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
  const topPhrases = [...bigrams.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p]) => p);

  // Bullet-list lines carry procedure/check nouns
  const bulletLines = (text.match(/^- .+$/gm) ?? [])
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 3 && l.length < 90)
    .slice(0, 8);

  // Title: prefer concrete module topics over the generic course title
  const topicPart =
    moduleTitles.slice(0, 2).join(" & ") ||
    topPhrases.slice(0, 2).map(titleCase).join(" & ") ||
    (current.title ?? "Training Course");
  let title = topicPart;
  if (sectionRefs.length > 0) title = `${title} (${sectionRefs[0]})`;
  title = title.slice(0, 80).trim();

  // Description: 3-6 sentences + keyword line
  const sentences: string[] = [];
  if (moduleTitles.length > 0) {
    sentences.push(`Covers ${moduleTitles.slice(0, 4).join(", ")}.`);
  }
  if (topPhrases.length > 0) {
    sentences.push(
      `Key topics include ${topPhrases.slice(0, 5).join(", ")}.`
    );
  }
  if (bulletLines.length > 0) {
    sentences.push(
      `Procedures and checks taught: ${bulletLines.slice(0, 4).join("; ")}.`
    );
  }
  if (sectionRefs.length > 0) {
    sentences.push(`References ${sectionRefs.join(", ")}.`);
  }
  if (corpus.questionCount > 0) {
    sentences.push(
      `Includes a knowledge assessment of ${corpus.questionCount} question${corpus.questionCount === 1 ? "" : "s"}.`
    );
  }
  if (current.department) {
    sentences.push(`Intended for ${current.department} personnel.`);
  }
  const keywordLine = `Keywords: ${Array.from(
    new Set([...topPhrases, ...topTerms])
  )
    .slice(0, 12)
    .join(", ")}.`;
  const description = [...sentences.slice(0, 6), keywordLine].join(" ").trim();

  const tags = Array.from(
    new Set(
      [...topPhrases.slice(0, 5), ...topTerms.slice(0, 8)].map((t) =>
        t.toLowerCase().trim()
      )
    )
  ).slice(0, 10);

  return { title, description, tags, source: "extractive", model: null };
}

/* -------------------------------------------------------------------- */
/* AI provider (OpenAI)                                                  */
/* -------------------------------------------------------------------- */

const OPENAI_MODEL = process.env.OPENAI_SUGGESTION_MODEL || "gpt-4o-mini";
const MAX_CORPUS_CHARS = 24_000;

async function aiSuggestion(
  corpus: CourseCorpus,
  current: { title?: string | null; description?: string | null; department?: string | null; tags?: string[] }
): Promise<MetadataSuggestion | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You write metadata for aviation-industry training courses. The title and description are consumed by a downstream safety-management system that links courses to hazards, controls and manual sections PURELY from title + description keywords, so the wording must carry maximum linkable detail.

Given the course content below, produce JSON with exactly these keys:
- "title": string, max 80 characters, specific and operational (name the equipment/procedure/hazard, include a quoted manual/regulation section number if one appears in the content). Never generic.
- "description": string, 3 to 6 sentences followed by a final "Keywords: ..." line. Must explicitly surface concrete nouns from the content: equipment/components, hazards/failure modes mitigated, procedures/checks taught, any manual or regulation section numbers quoted in the content, target audience/role, and recurrence if evident. NEVER use filler like "This course will teach you" or "By the end of this course".
- "tags": array of 5-10 short lowercase keyword strings.

Only use facts present in the content. Do not invent section numbers, equipment or hazards.

Current title: ${current.title ?? "(none)"}
Current department: ${current.department ?? "(none)"}

COURSE CONTENT:
${corpus.text.slice(0, MAX_CORPUS_CHARS)}`;

  let res: Response | null = null;
  try {
    res = await boundedFetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 700,
        }),
      },
      30_000
    );

    // Always consume the body (socket hygiene) — success or failure.
    const bodyText = await res.text();
    if (!res.ok) {
      console.error(
        `[course-suggestions] OpenAI ${res.status}: ${bodyText.slice(0, 300)}`
      );
      return null;
    }
    const body = JSON.parse(bodyText);
    const content = body?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);

    const title = String(parsed.title ?? "").trim().slice(0, 90);
    const description = String(parsed.description ?? "").trim();
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 10)
      : [];
    if (!title || !description) return null;

    return { title, description, tags, source: "ai", model: OPENAI_MODEL };
  } catch (e: any) {
    console.error("[course-suggestions] OpenAI call failed:", e?.message ?? e);
    return null;
  }
}

/**
 * Generate a suggestion for a course: AI when a provider key is available,
 * extractive fallback otherwise (or on any provider failure). Never throws
 * for provider problems — only for empty corpora / DB errors.
 */
export async function generateSuggestion(
  corpus: CourseCorpus,
  current: { title?: string | null; description?: string | null; department?: string | null; tags?: string[] }
): Promise<MetadataSuggestion> {
  if (!corpus.text || corpus.text.replace(/\s/g, "").length === 0) {
    throw new Error("This course has no training content to analyse yet. Add modules and content first.");
  }
  const ai = await aiSuggestion(corpus, current);
  if (ai) return ai;
  return extractiveSuggestion(corpus, current);
}

/** Load the stored last suggestion for a course (null when none / table missing). */
export async function loadStoredSuggestion(courseId: string) {
  try {
    const { data, error } = await supabaseAdmin()
      .from("course_metadata_suggestions")
      .select("course_id, content_hash, suggested_title, suggested_description, suggested_tags, source, model, updated_at")
      .eq("course_id", courseId)
      .maybeSingle();
    if (error) {
      console.warn("[course-suggestions] load failed:", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.warn("[course-suggestions] load failed:", e);
    return null;
  }
}

/** Persist the latest suggestion + corpus hash (best-effort upsert). */
export async function storeSuggestion(
  courseId: string,
  corpusHash: string,
  s: MetadataSuggestion,
  actorId: string | null
) {
  const { error } = await supabaseAdmin()
    .from("course_metadata_suggestions")
    .upsert(
      {
        course_id: courseId,
        content_hash: corpusHash,
        suggested_title: s.title,
        suggested_description: s.description,
        suggested_tags: s.tags,
        source: s.source,
        model: s.model,
        created_by: actorId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "course_id" }
    );
  if (error) {
    // Non-fatal: suggestion is still returned to the UI; only change
    // detection is degraded.
    console.error("[course-suggestions] store failed:", error.message);
  }
}
