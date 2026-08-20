export type CourseVersionLogRow = {
  version_number?: number | null;
  published_by?: string | null;
  change_notes?: string | null;
};

export type CourseVersionPublisher = {
  full_name?: string | null;
  email?: string | null;
} | null | undefined;

export const COURSE_VERSION_LOG_PAGE_SIZE = 25;

export class CourseVersionLogAccessError extends Error {
  constructor() {
    super("Admin access is required to load course version logs.");
    this.name = "CourseVersionLogAccessError";
  }
}

/**
 * Keeps a search term safe for a PostgREST `.or()` filter while retaining
 * ordinary words that administrators expect to search for.
 */
export function sanitizeCourseVersionLogSearch(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[%_*:,()."'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function requireCourseVersionChangeNotes(value: unknown): string {
  const notes = typeof value === "string" ? value.trim() : "";
  if (!notes) {
    throw new Error("Enter a summary of what changed before publishing this course version.");
  }
  return notes;
}

export function courseVersionReleaseAttribution(
  changeNotes: unknown,
  actorId: string,
  publishedAt = new Date().toISOString()
) {
  return {
    change_notes: requireCourseVersionChangeNotes(changeNotes),
    published_by: actorId,
    published_at: publishedAt,
  };
}

export function assertResumableCourseVersion(row: CourseVersionLogRow): void {
  if (!row.change_notes?.trim()) {
    throw new Error(
      "This interrupted course version has no immutable change summary and cannot be published. Contact an administrator to repair the unfinished release."
    );
  }
}

export function publisherNameForCourseVersion(
  row: CourseVersionLogRow,
  profile: CourseVersionPublisher
): string {
  const name = profile?.full_name?.trim() || profile?.email?.trim();
  if (name) return name;
  if (!row.published_by) {
    return row.version_number === 1 ? "System baseline" : "Not recorded";
  }
  return "Former or unknown user";
}

export function changeDetailsForCourseVersion(row: CourseVersionLogRow): string {
  const notes = row.change_notes?.trim();
  if (notes) return notes;
  if (row.version_number === 1) {
    return "Baseline version — no publisher summary was captured.";
  }
  return "No change summary was recorded for this older release.";
}

export async function loadCourseVersionLogPage(args: {
  isAdmin: boolean;
  adminClient: any;
  q?: string | null;
  page?: number;
}) {
  if (!args.isAdmin) throw new CourseVersionLogAccessError();

  const term = sanitizeCourseVersionLogSearch(args.q);
  const requestedPage = Math.max(1, Number.isFinite(args.page) ? Math.trunc(args.page as number) : 1);

  const loadPage = async (requested: number) => {
    const from = (requested - 1) * COURSE_VERSION_LOG_PAGE_SIZE;
    let query = args.adminClient
      .from("course_versions")
      .select("id, course_id, version_number, title, status, change_notes, published_at, published_by", {
        count: "exact",
      })
      .in("status", ["published", "superseded"])
      .order("published_at", { ascending: false })
      .order("version_number", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + COURSE_VERSION_LOG_PAGE_SIZE - 1);

    if (term) {
      const like = `%${term}%`;
      query = query.or(`title.ilike.${like},change_notes.ilike.${like}`);
    }
    return query;
  };

  let currentPage = requestedPage;
  let { data: rows, count, error } = await loadPage(currentPage);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / COURSE_VERSION_LOG_PAGE_SIZE));

  if (!error && currentPage > totalPages) {
    currentPage = totalPages;
    ({ data: rows, error } = await loadPage(currentPage));
  }

  return {
    rows: rows ?? [],
    totalCount,
    totalPages,
    currentPage,
    error,
    term,
  };
}