// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { hasRole } from "@/lib/roles";
import MapDiagram from "./MapDiagram";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | null {
  const v = sp?.[key];
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

async function loadData(selectedId: string | null, includeAll: boolean) {
  noStore();
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = supabaseAdmin();

  const { data: authorisations, error } = await supabase
    .from("authorisations")
    .select("id, title")
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);

  let connectedIds = new Set<string>();
  let connectionRowByOtherId = new Map<string, string>();
  let allEdges: { a: string; b: string }[] = [];

  // Directional connections chosen FOR the selected authorisation (it is the source).
  if (selectedId) {
    const { data: conns, error: connErr } = await supabase
      .from("authorisation_connections")
      .select("id, authorisation_id_a, authorisation_id_b")
      .eq("authorisation_id_a", selectedId);
    // Degrade gracefully if the table has not been created yet (migration not applied).
    if (connErr) {
      console.error("Failed to load authorisation connections:", connErr.message);
    } else {
      (conns || []).forEach((c) => {
        if (c.authorisation_id_b) {
          connectedIds.add(c.authorisation_id_b);
          connectionRowByOtherId.set(c.authorisation_id_b, c.id);
        }
      });
    }
  }

  // Full directed edge list for the Map tab.
  if (includeAll) {
    const { data: all, error: allErr } = await supabase
      .from("authorisation_connections")
      .select("authorisation_id_a, authorisation_id_b");
    if (allErr) {
      console.error("Failed to load all authorisation connections:", allErr.message);
    } else {
      allEdges = (all || [])
        .filter((c) => c.authorisation_id_a && c.authorisation_id_b)
        .map((c) => ({ a: c.authorisation_id_a, b: c.authorisation_id_b }));
    }
  }

  return {
    authorisations: authorisations || [],
    connectedIds,
    connectionRowByOtherId,
    allEdges,
  };
}

function banner(ok: string | null, error: string | null) {
  if (!ok && !error) return null;
  const isError = !!error;
  return (
    <div
      className={[
        "rounded-md border px-4 py-2 text-sm",
        isError
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-green-300 bg-green-50 text-green-700",
      ].join(" ")}
    >
      {isError
        ? error
        : ok === "connection_added"
        ? "Connections added."
        : ok === "connection_removed"
        ? "Connection removed."
        : ok}
    </div>
  );
}

export default async function ConnectionMapPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const isAdmin = await hasRole("Admin");
  if (!isAdmin) redirect("/app/home?banner=no_access");

  const sp = (await searchParams) ?? {};
  const selectedId = pick(sp, "auth");
  const ok = pick(sp, "ok");
  const error = pick(sp, "error");
  const tab = pick(sp, "tab") === "map" ? "map" : "connect";

  const { authorisations, connectedIds, connectionRowByOtherId, allEdges } = await loadData(
    selectedId,
    tab === "map"
  );

  const selected = selectedId ? authorisations.find((a) => a.id === selectedId) : null;
  const titleById = new Map(authorisations.map((a) => [a.id, a.title]));

  // Connected authorisations (resolved), sorted by title.
  const connected = Array.from(connectedIds)
    .map((id) => ({
      id,
      title: titleById.get(id) || "Unknown authorisation",
      connectionId: connectionRowByOtherId.get(id),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  // Candidates available to connect to the selected authorisation (exclude itself
  // and already-connected ones).
  const candidates = selected
    ? authorisations.filter((a) => a.id !== selected.id && !connectedIds.has(a.id))
    : [];

  const tabHref = (t: string) =>
    `/app/admin/connections?tab=${t}${selectedId ? `&auth=${selectedId}` : ""}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connected Authorisation Map</h1>
          <p className="text-sm text-gray-600">
            Define which authorisations are connected. Connections are one-way: the ones
            you choose for an authorisation are highlighted to approvers when reviewing it.
          </p>
        </div>
        <Link
          href="/app/admin"
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          ← Back to Admin
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { key: "connect", label: "Connect" },
          { key: "map", label: "Map" },
        ].map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === t.key
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-800",
            ].join(" ")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {banner(ok, error)}

      {tab === "connect" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Authorisation list */}
          <div className="rounded-xl border bg-white p-4 lg:col-span-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Authorisations ({authorisations.length})
            </h2>
            <div className="max-h-[70vh] overflow-y-auto divide-y rounded-md border">
              {authorisations.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-500">No authorisations found.</div>
              ) : (
                authorisations.map((a) => {
                  const active = a.id === selectedId;
                  return (
                    <Link
                      key={a.id}
                      href={`/app/admin/connections?tab=connect&auth=${a.id}`}
                      className={[
                        "block px-3 py-2 text-sm",
                        active ? "bg-black text-white" : "hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {a.title}
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Connection editor */}
          <div className="rounded-xl border bg-white p-6 lg:col-span-2 space-y-6">
            {!selected ? (
              <p className="text-sm text-gray-600">
                Select an authorisation on the left to view and edit its connected authorisations.
              </p>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold">{selected.title}</h2>
                  <p className="text-sm text-gray-600">
                    Authorisations connected to this one. These are shown to approvers when
                    reviewing <span className="font-medium">{selected.title}</span>.
                  </p>
                </div>

                {/* Existing connections */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Connected authorisations ({connected.length})
                  </h3>
                  <div className="divide-y rounded-md border">
                    {connected.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500">
                        No connections yet. Add some below.
                      </div>
                    ) : (
                      connected.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="text-sm text-gray-900">{c.title}</span>
                          <form action="/app/admin/connections/remove" method="post">
                            <input type="hidden" name="connection_id" value={c.connectionId} />
                            <input type="hidden" name="auth" value={selected.id} />
                            <button className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                              Remove
                            </button>
                          </form>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add connections (multi-select) */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Add connections
                  </h3>
                  {candidates.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      All other authorisations are already connected.
                    </p>
                  ) : (
                    <form action="/app/admin/connections/add" method="post" className="space-y-3">
                      <input type="hidden" name="auth" value={selected.id} />
                      <p className="text-xs text-gray-500">
                        Tick all the authorisations to connect, then add them at once.
                      </p>
                      <div className="max-h-[40vh] overflow-y-auto divide-y rounded-md border">
                        {candidates.map((a) => (
                          <label
                            key={a.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              name="target"
                              value={a.id}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <span>{a.title}</span>
                          </label>
                        ))}
                      </div>
                      <button className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800">
                        Add selected connections
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-4">
          <MapDiagram
            nodes={authorisations.map((a) => ({ id: a.id, title: a.title }))}
            edges={allEdges}
          />
        </div>
      )}
    </div>
  );
}
