"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Node = { id: string; title: string };
type Edge = { a: string; b: string };
type Pos = { x: number; y: number };

const CARD_W = 168;
const CARD_H = 44;
const HALF_W = CARD_W / 2;
const HALF_H = CARD_H / 2;
const SLOT = CARD_W + 56;
const LEVEL_GAP = 124;
const PAD_X = 48;
const PAD_Y = 40;

export default function MapDiagram({
  nodes,
  edges,
  savedPositions = {},
}: {
  nodes: Node[];
  edges: Edge[];
  savedPositions?: Record<string, Pos>;
}) {
  const [focusId, setFocusId] = useState<string>("");
  // Manual position overrides (saved layout seeds these; dragging updates them).
  const [overrides, setOverrides] = useState<Record<string, Pos>>(savedPositions);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Dragging/saving only makes sense for the full map: focus mode uses a transient
  // focus-only layout, so persisting those coordinates would corrupt the global map.
  const canEdit = !focusId;

  // Keep manual overrides in sync if the saved layout prop changes (e.g. the page
  // re-renders with freshly loaded positions without a full remount).
  useEffect(() => {
    setOverrides(savedPositions);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(savedPositions)]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // ---- Automatic tree layout (used for any node without a manual override) ----
  const { activeNodes, activeEdges, autoPos, outgoing } = useMemo(() => {
    const connectedIds = new Set<string>();
    edges.forEach((e) => {
      connectedIds.add(e.a);
      connectedIds.add(e.b);
    });

    let aNodes = nodes.filter((n) => connectedIds.has(n.id));
    let aEdges = edges;

    if (focusId) {
      const neighbours = new Set<string>([focusId]);
      edges.forEach((e) => {
        if (e.a === focusId) neighbours.add(e.b);
        if (e.b === focusId) neighbours.add(e.a);
      });
      aNodes = nodes.filter((n) => neighbours.has(n.id));
      aEdges = edges.filter(
        (e) =>
          neighbours.has(e.a) &&
          neighbours.has(e.b) &&
          (e.a === focusId || e.b === focusId)
      );
    }

    const ids = new Set(aNodes.map((n) => n.id));
    aEdges = aEdges.filter((e) => ids.has(e.a) && ids.has(e.b));

    const out = new Map<string, string[]>();
    aEdges.forEach((e) => {
      if (!out.has(e.a)) out.set(e.a, []);
      out.get(e.a)!.push(e.b);
    });

    const memo = new Map<string, number>();
    const onStack = new Set<string>();
    const levelOf = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      onStack.add(id);
      let best = 0;
      for (const next of out.get(id) || []) {
        if (onStack.has(next)) continue;
        best = Math.max(best, 1 + levelOf(next));
      }
      onStack.delete(id);
      memo.set(id, best);
      return best;
    };

    const byLevel = new Map<number, Node[]>();
    aNodes.forEach((n) => {
      const lvl = levelOf(n.id);
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl)!.push(n);
    });

    const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    levels.forEach((l) => byLevel.get(l)!.sort((a, b) => a.title.localeCompare(b.title)));

    const maxRow = Math.max(1, ...levels.map((l) => byLevel.get(l)!.length));
    const w = Math.max(560, maxRow * SLOT + PAD_X * 2);

    const p = new Map<string, Pos>();
    levels.forEach((l, li) => {
      const row = byLevel.get(l)!;
      const n = row.length;
      row.forEach((node, i) => {
        const x = ((i + 1) / (n + 1)) * (w - PAD_X * 2) + PAD_X;
        const y = PAD_Y + HALF_H + li * LEVEL_GAP;
        p.set(node.id, { x, y });
      });
    });

    return { activeNodes: aNodes, activeEdges: aEdges, autoPos: p, outgoing: out };
  }, [nodes, edges, focusId]);

  // Resolve a node's position: manual override wins, else automatic layout.
  const posOf = (id: string): Pos => overrides[id] || autoPos.get(id) || { x: 0, y: 0 };

  const layoutNodes = activeNodes
    .filter((n) => autoPos.has(n.id) || overrides[n.id])
    .map((n) => ({ ...n, ...posOf(n.id) }));

  // Canvas size grows to fit dragged-out cards.
  const width = Math.max(
    560,
    ...layoutNodes.map((n) => n.x + HALF_W + PAD_X)
  );
  const height = Math.max(
    320,
    ...layoutNodes.map((n) => n.y + HALF_H + PAD_Y)
  );

  const layoutEdges = activeEdges
    .map((e) => {
      const p1 = posOf(e.a);
      const p2 = posOf(e.b);
      const reciprocal = (outgoing.get(e.b) || []).includes(e.a);
      return { a: e.a, b: e.b, p1, p2, reciprocal };
    });

  function clipToCard(center: Pos, to: Pos): Pos {
    const dx = to.x - center.x;
    const dy = to.y - center.y;
    if (dx === 0 && dy === 0) return center;
    const sx = dx !== 0 ? HALF_W / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? HALF_H / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: center.x + dx * s, y: center.y + dy * s };
  }

  function edgePath(p1: Pos, p2: Pos, bowed: boolean) {
    const start = clipToCard(p1, p2);
    const end = clipToCard(p2, p1);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const ex = end.x - ux * 3;
    const ey = end.y - uy * 3;
    if (!bowed) return `M ${start.x} ${start.y} L ${ex} ${ey}`;
    const nx = -uy;
    const ny = ux;
    const bow = Math.min(34, len * 0.16);
    const mx = (start.x + ex) / 2 + nx * bow;
    const my = (start.y + ey) / 2 + ny * bow;
    return `M ${start.x} ${start.y} Q ${mx} ${my} ${ex} ${ey}`;
  }

  // ---- Dragging (SVG units == pixels because viewBox matches width/height) ----
  function onPointerDown(e: React.PointerEvent, id: string) {
    if (!canEdit) return;
    e.preventDefault();
    const cur = posOf(id);
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: cur.x,
      origY: cur.y,
      moved: false,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    const nx = Math.max(HALF_W, d.origX + dx);
    const ny = Math.max(HALF_H, d.origY + dy);
    setOverrides((prev) => ({ ...prev, [d.id]: { x: nx, y: ny } }));
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.moved) {
      setDirty(true);
      setStatus(null);
    }
    dragRef.current = null;
  }

  async function saveLayout() {
    setSaving(true);
    setStatus(null);
    try {
      // Persist only manually placed nodes — never the transient auto layout.
      const positions = Object.entries(overrides).map(([id, p]) => ({
        id,
        x: p.x,
        y: p.y,
      }));
      const res = await fetch("/app/admin/connections/positions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setDirty(false);
        setStatus({ kind: "ok", msg: "Layout saved." });
      } else {
        setStatus({
          kind: "err",
          msg:
            (json && json.error) ||
            "Could not save layout. The positions table may not exist yet (apply migration 006).",
        });
      }
    } catch {
      setStatus({ kind: "err", msg: "Could not save layout (network error)." });
    } finally {
      setSaving(false);
    }
  }

  async function resetLayout() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/app/admin/connections/positions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setOverrides({});
        setDirty(false);
        setStatus({ kind: "ok", msg: "Reset to automatic layout." });
      } else {
        setStatus({ kind: "err", msg: (json && json.error) || "Could not reset layout." });
      }
    } catch {
      setStatus({ kind: "err", msg: "Could not reset layout (network error)." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Focus
        </label>
        <select
          value={focusId}
          onChange={(e) => setFocusId(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="">Show all connections</option>
          {nodes
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {status && (
            <span
              className={[
                "text-xs",
                status.kind === "ok" ? "text-green-600" : "text-red-600",
              ].join(" ")}
            >
              {status.msg}
            </span>
          )}
          <button
            type="button"
            onClick={saveLayout}
            disabled={saving || !dirty || !canEdit}
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save layout"}
          </button>
          <button
            type="button"
            onClick={resetLayout}
            disabled={saving}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            Reset to auto
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {canEdit
          ? "Drag any box to reposition it, then Save layout. "
          : "Switch to “Show all connections” to drag boxes and save the layout. "}
        Arrows point upward to the connected authorisations — prerequisites at the
        top, roles below. Two arrows mean both are connected.
      </p>

      {layoutNodes.length === 0 ? (
        <div className="rounded-md border bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No connections to display yet.
        </div>
      ) : (
        <div className="max-h-[72vh] overflow-auto rounded-lg border bg-gradient-to-b from-gray-50 to-white">
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block touch-none select-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="9"
                markerHeight="9"
                refX="7"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L7,3 L0,6 Z" fill="#3b82f6" />
              </marker>
            </defs>

            {layoutEdges.map((e, i) => (
              <path
                key={`${e.a}-${e.b}-${i}`}
                d={edgePath(e.p1, e.p2, e.reciprocal)}
                fill="none"
                stroke="#93c5fd"
                strokeWidth={1.75}
                markerEnd="url(#arrowhead)"
              />
            ))}

            {layoutNodes.map((n) => {
              const isFocus = n.id === focusId;
              return (
                <foreignObject
                  key={n.id}
                  x={n.x - HALF_W}
                  y={n.y - HALF_H}
                  width={CARD_W}
                  height={CARD_H}
                  onPointerDown={(e) => onPointerDown(e, n.id)}
                  style={{ cursor: canEdit ? "grab" : "default" }}
                >
                  <div
                    className={[
                      "flex h-full w-full items-center justify-center rounded-lg border px-2 text-center text-[11px] font-medium leading-tight shadow-sm",
                      isFocus
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-blue-200 bg-white text-gray-800",
                    ].join(" ")}
                    title={n.title}
                  >
                    <span
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {n.title}
                    </span>
                  </div>
                </foreignObject>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
