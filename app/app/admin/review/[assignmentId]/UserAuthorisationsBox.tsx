// @ts-nocheck

type AuthorisationOverviewItem = {
  assignmentId: string | null;
  authorisationId: string;
  title: string;
  status: string;
  completedAt: string | null;
  isConnected: boolean;
  isCurrent: boolean;
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${d}/${m}/${y}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    assigned: { label: "Assigned", className: "bg-gray-100 text-gray-700" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
    pending_approval: { label: "Pending Approval", className: "bg-amber-100 text-amber-800" },
    completed: { label: "Completed", className: "bg-green-100 text-green-700" },
    approved: { label: "Approved", className: "bg-green-100 text-green-700" },
    expired: { label: "Expired", className: "bg-red-100 text-red-700" },
    revoked: { label: "Revoked", className: "bg-red-100 text-red-700" },
    not_assigned: { label: "Not Assigned", className: "bg-gray-100 text-gray-500" },
  };
  const entry = map[status] || { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.className}`}>
      {entry.label}
    </span>
  );
}

function AuthorisationRow({ item }: { item: AuthorisationOverviewItem }) {
  const showCompleted =
    item.completedAt && (item.status === "completed" || item.status === "approved");
  return (
    <div
      className={[
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
        item.isCurrent
          ? "border-indigo-300 bg-indigo-50"
          : item.isConnected
          ? "border-amber-300 bg-amber-50"
          : "border-gray-200 bg-white",
      ].join(" ")}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{item.title}</span>
          {item.isCurrent && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Under review
            </span>
          )}
          {item.isConnected && !item.isCurrent && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Connected
            </span>
          )}
        </div>
        {showCompleted && (
          <p className="mt-0.5 text-xs text-gray-500">Completed {formatDate(item.completedAt)}</p>
        )}
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

export default function UserAuthorisationsBox({
  items,
  currentAuthTitle,
}: {
  items: AuthorisationOverviewItem[];
  currentAuthTitle: string;
}) {
  // Connected (including the current one) first, then the rest. Within each group,
  // sort alphabetically by title for a stable, predictable order.
  const connected = items
    .filter((i) => i.isConnected || i.isCurrent)
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  const others = items
    .filter((i) => !i.isConnected && !i.isCurrent)
    .sort((a, b) => a.title.localeCompare(b.title));

  const connectedRelated = connected.filter((i) => !i.isCurrent);

  return (
    <div className="rounded-xl border bg-white p-6">
      <h2 className="text-lg font-semibold mb-1">User's Authorisations</h2>
      <p className="text-sm text-gray-600 mb-4">
        All authorisations assigned to this user and their current status. Authorisations
        connected to <span className="font-medium">{currentAuthTitle}</span> (defined in the
        Connected Authorisation Map) are highlighted and shown first.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">This user has no authorisation assignments.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Connected to this authorisation
              {connectedRelated.length > 0 ? ` (${connectedRelated.length})` : ""}
            </h3>
            {connected.length === 0 ? (
              <p className="text-sm text-gray-500">No connected authorisations defined.</p>
            ) : (
              <div className="space-y-2">
                {connected.map((item) => (
                  <AuthorisationRow key={item.authorisationId} item={item} />
                ))}
              </div>
            )}
            {connectedRelated.length === 0 && connected.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                No other authorisations are connected to this one in the Connected Authorisation Map.
              </p>
            )}
          </div>

          {others.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Other authorisations ({others.length})
              </h3>
              <div className="space-y-2">
                {others.map((item) => (
                  <AuthorisationRow key={item.authorisationId} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
