// @ts-nocheck
"use client";

import { useMemo, useState } from "react";

interface Risk {
  id: string;
  risk_code: string | null;
  title: string;
  is_enterprise: boolean;
  risk_kind: string | null;
  status: string;
  parent_risk_id?: string | null;
}

function riskCodeSortKey(code: string | null): [string, number] {
  if (!code) return ["zzz", Number.MAX_SAFE_INTEGER];
  const match = code.match(/^([A-Za-z]+)-?(\d+)?/);
  if (!match) return [code.toLowerCase(), Number.MAX_SAFE_INTEGER];
  return [match[1].toLowerCase(), match[2] ? parseInt(match[2], 10) : Number.MAX_SAFE_INTEGER];
}

function sortByCode(a: Risk, b: Risk) {
  const [pa, na] = riskCodeSortKey(a.risk_code);
  const [pb, nb] = riskCodeSortKey(b.risk_code);
  if (pa !== pb) return pa < pb ? -1 : 1;
  if (na !== nb) return na - nb;
  return (a.title || "").localeCompare(b.title || "");
}

function isEnterprise(risk: Risk) {
  return risk.risk_kind === "enterprise" || risk.is_enterprise === true;
}

function isContributing(risk: Risk) {
  return risk.risk_kind === "contributing";
}

function matches(risk: Risk, query: string) {
  const q = query.toLowerCase();
  return (
    (risk.risk_code || "").toLowerCase().includes(q) ||
    (risk.title || "").toLowerCase().includes(q)
  );
}

export default function SafefliteRiskPicker({
  risks,
  initialSelectedIds,
}: {
  risks: Risk[];
  initialSelectedIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds)
  );
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const { enterpriseGroups, otherContributing, legacy } = useMemo(() => {
    const ers = risks.filter(isEnterprise).sort(sortByCode);
    const erIds = new Set(ers.map((r) => r.id));

    const childrenByEr = new Map<string, Risk[]>();
    const orphanCrs: Risk[] = [];
    const legacyRisks: Risk[] = [];

    for (const risk of risks) {
      if (isEnterprise(risk)) continue;
      if (isContributing(risk)) {
        if (risk.parent_risk_id && erIds.has(risk.parent_risk_id)) {
          const list = childrenByEr.get(risk.parent_risk_id) || [];
          list.push(risk);
          childrenByEr.set(risk.parent_risk_id, list);
        } else {
          orphanCrs.push(risk);
        }
      } else {
        legacyRisks.push(risk);
      }
    }

    for (const list of childrenByEr.values()) list.sort(sortByCode);
    orphanCrs.sort(sortByCode);
    legacyRisks.sort(sortByCode);

    return {
      enterpriseGroups: ers.map((er) => ({
        er,
        children: childrenByEr.get(er.id) || [],
      })),
      otherContributing: orphanCrs,
      legacy: legacyRisks,
    };
  }, [risks]);

  const query = search.trim();
  const searching = query.length > 0;

  const visible = useMemo(() => {
    if (!searching) {
      return {
        groups: enterpriseGroups.map((g) => ({ ...g, visibleChildren: g.children })),
        otherContributing,
        legacy,
      };
    }
    const groups = [];
    for (const g of enterpriseGroups) {
      const erMatches = matches(g.er, query);
      const matchingChildren = g.children.filter((c) => matches(c, query));
      if (erMatches || matchingChildren.length > 0) {
        groups.push({
          ...g,
          visibleChildren: matchingChildren,
        });
      }
    }
    return {
      groups,
      otherContributing: otherContributing.filter((r) => matches(r, query)),
      legacy: legacy.filter((r) => matches(r, query)),
    };
  }, [searching, query, enterpriseGroups, otherContributing, legacy]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const RiskRow = ({ risk, indent }: { risk: Risk; indent?: boolean }) => (
    <label
      className={`flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer ${
        indent ? "pl-10" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={selected.has(risk.id)}
        onChange={() => toggleSelected(risk.id)}
        className="mt-1"
      />
      <span className="text-sm">
        {risk.risk_code && (
          <span className="mr-2 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
            {risk.risk_code}
          </span>
        )}
        {risk.title}
      </span>
    </label>
  );

  const totalSelected = selected.size;

  return (
    <div className="grid gap-1">
      {/* Selected ids submitted with the form regardless of collapse/search state */}
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name="safeflite_risk_ids" value={id} />
      ))}

      <input
        type="search"
        value={search}
        onChange={(e) => {
          const value = e.target.value;
          setSearch(value);
          if (value.trim().length === 0) {
            // Clearing the search returns to the fully collapsed hierarchy
            setExpanded(new Set());
          }
        }}
        placeholder="Search risks by code or title…"
        className="w-full rounded-md border px-3 py-2 text-sm"
        aria-label="Search SafeFLITE risks"
      />

      <div className="max-h-80 overflow-y-auto rounded-md border">
        {visible.groups.length === 0 &&
        visible.otherContributing.length === 0 &&
        visible.legacy.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            No risks match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <>
            {visible.groups.map(({ er, children, visibleChildren }) => {
              const isOpen = searching || expanded.has(er.id);
              const selectedChildCount = children.filter((c) =>
                selected.has(c.id)
              ).length;
              return (
                <div key={er.id} className="border-b last:border-b-0">
                  <div className="flex items-center gap-1 bg-gray-50/70 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(er.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-200"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      aria-expanded={isOpen}
                      disabled={searching}
                    >
                      <svg
                        className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <label className="flex flex-1 items-start gap-2 cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={selected.has(er.id)}
                        onChange={() => toggleSelected(er.id)}
                        className="mt-1"
                      />
                      <span className="text-sm font-semibold">
                        {er.risk_code && (
                          <span className="mr-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800">
                            {er.risk_code}
                          </span>
                        )}
                        {er.title}
                      </span>
                    </label>
                    {!isOpen && selectedChildCount > 0 && (
                      <span className="mr-1 shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                        {selectedChildCount} selected
                      </span>
                    )}
                    {children.length > 0 && (
                      <span className="mr-1 shrink-0 text-xs text-gray-400">
                        {children.length} CR{children.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {isOpen &&
                    visibleChildren.map((child) => (
                      <RiskRow key={child.id} risk={child} indent />
                    ))}
                  {isOpen && children.length === 0 && (
                    <div className="pl-10 py-1.5 text-xs text-gray-400">
                      No contributing risks under this enterprise risk.
                    </div>
                  )}
                </div>
              );
            })}

            {visible.otherContributing.length > 0 && (
              <div className="border-b last:border-b-0">
                <div className="bg-gray-50/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Other contributing risks
                </div>
                {visible.otherContributing.map((risk) => (
                  <RiskRow key={risk.id} risk={risk} />
                ))}
              </div>
            )}

            {visible.legacy.length > 0 && (
              <div>
                <div className="bg-gray-50/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Legacy risks
                </div>
                {visible.legacy.map((risk) => (
                  <RiskRow key={risk.id} risk={risk} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="text-xs text-gray-500">
        {totalSelected} risk{totalSelected === 1 ? "" : "s"} selected
      </div>
    </div>
  );
}
