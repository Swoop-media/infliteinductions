"use client";

import { useMemo, useState } from "react";

type Node = { id: string; title: string };
type Edge = { a: string; b: string };

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
}: {
  nodes: Node[];
  edges: Edge[];
}) {
  const [focusId, setFocusId] = useState<string>("");

  const { layoutNodes, layoutEdges, width, height } = useMemo(() => {
    const connectedIds = new Set<string>();
    edges.forEach((e) => {
      connectedIds.add(e.a);
      connectedIds.add(e.b);
    });

    let activeNodes = nodes.filter((n) => connectedIds.has(n.id));
    let activeEdges = edges;

    // Optional focus: show only the focused node and its direct connections.
    if (focusId) {
      const neighbours = new Set<string>([focusId]);
      edges.forEach((e) => {
        if (e.a === focusId) neighbours.add(e.b);
        if (e.b === focusId) neighbours.add(e.a);
      });
      activeNodes = nodes.filter((n) => neighbours.has(n.id));
      activeEdges = edges.filter(
        (e) =>
          neighbours.has(e.a) &&
          neighbours.has(e.b) &&
          (e.a === focusId || e.b === focusId)
      );
    }

    const activeIds = new Set(activeNodes.map((n) => n.id));
    activeEdges = activeEdges.filter((e) => activeIds.has(e.a) && activeIds.has(e.b));

    // Outgoing adjacency: an arrow points from an authorisation to the ones it
    // connects to (its prerequisites). Things nothing points away from (e.g.
    // INFLITE General Induction) sit at the top.
    const outgoing = new Map<string, string[]>();
    activeEdges.forEach((e) => {
      if (!outgoing.has(e.a)) outgoing.set(e.a, []);
      outgoing.get(e.a)!.push(e.b);
    });

    // Level = longest chain of outgoing edges from a node, with a cycle guard so
    // two-way connections don't loop forever. Level 0 = top (prerequisites).
    const memo = new Map<string, number>();
    const onStack = new Set<string>();
    const levelOf = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      onStack.add(id);
      let best = 0;
      for (const next of outgoing.get(id) || []) {
        if (onStack.has(next)) continue; // break cycle
        best = Math.max(best, 1 + levelOf(next));
      }
      onStack.delete(id);
      memo.set(id, best);
      return best;
    };

    const byLevel = new Map<number, Node[]>();
    activeNodes.forEach((n) => {
      const lvl = levelOf(n.id);
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl)!.push(n);
    });

    const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
    levels.forEach((l) => byLevel.get(l)!.sort((a, b) => a.title.localeCompare(b.title)));

    const maxRow = Math.max(1, ...levels.map((l) => byLevel.get(l)!.length));
    const w = Math.max(560, maxRow * SLOT + PAD_X * 2);
    const h = Math.max(320, (levels.length - 1) * LEVEL_GAP + PAD_Y * 2 + CARD_H);

    const pos = new Map<string, { x: number; y: number }>();
    levels.forEach((l, li) => {
      const row = byLevel.get(l)!;
      const n = row.length;
      row.forEach((node, i) => {
        const x = ((i + 1) / (n + 1)) * (w - PAD_X * 2) + PAD_X;
        const y = PAD_Y + HALF_H + li * LEVEL_GAP;
        pos.set(node.id, { x, y });
      });
    });

    const laidOutNodes = activeNodes
      .filter((n) => pos.has(n.id))
      .map((n) => ({ ...n, ...pos.get(n.id)! }));

    const laidOutEdges = activeEdges
      .map((e) => {
        const p1 = pos.get(e.a);
        const p2 = pos.get(e.b);
        if (!p1 || !p2) return null;
        const reciprocal = (outgoing.get(e.b) || []).includes(e.a);
        return { a: e.a, b: e.b, p1, p2, reciprocal };
      })
      .filter(Boolean) as {
      a: string;
      b: string;
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      reciprocal: boolean;
    }[];

    return { layoutNodes: laidOutNodes, layoutEdges: laidOutEdges, width: w, height: h };
  }, [nodes, edges, focusId]);

  // Clip a line from a card centre to the card's border in the direction of `to`.
  function clipToCard(
    center: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    const dx = to.x - center.x;
    const dy = to.y - center.y;
    if (dx === 0 && dy === 0) return center;
    const sx = dx !== 0 ? HALF_W / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? HALF_H / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: center.x + dx * s, y: center.y + dy * s };
  }

  function edgePath(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    bowed: boolean
  ) {
    const start = clipToCard(p1, p2);
    const end = clipToCard(p2, p1);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // pull the tip back a touch so the arrowhead doesn't sit on the border
    const ex = end.x - ux * 3;
    const ey = end.y - uy * 3;
    if (!bowed) {
      return `M ${start.x} ${start.y} L ${ex} ${ey}`;
    }
    const nx = -uy;
    const ny = ux;
    const bow = Math.min(34, len * 0.16);
    const mx = (start.x + ex) / 2 + nx * bow;
    const my = (start.y + ey) / 2 + ny * bow;
    return `M ${start.x} ${start.y} Q ${mx} ${my} ${ex} ${ey}`;
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
        <span className="text-xs text-gray-500">
          Arrows point upward to the connected authorisations. Prerequisites sit at
          the top; roles branch out below. Two arrows mean both are connected.
        </span>
      </div>

      {layoutNodes.length === 0 ? (
        <div className="rounded-md border bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No connections to display yet.
        </div>
      ) : (
        <div className="max-h-[72vh] overflow-auto rounded-lg border bg-gradient-to-b from-gray-50 to-white">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block"
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
