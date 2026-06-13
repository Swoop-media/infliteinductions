"use client";

import { useMemo, useState } from "react";

type Node = { id: string; title: string };
type Edge = { a: string; b: string };

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

    const slot = 220;
    const levelGap = 130;
    const padX = 60;
    const padY = 70;
    const maxRow = Math.max(1, ...levels.map((l) => byLevel.get(l)!.length));
    const w = Math.max(640, maxRow * slot + padX * 2);
    const h = Math.max(360, (levels.length - 1) * levelGap + padY * 2);

    const pos = new Map<string, { x: number; y: number }>();
    levels.forEach((l, li) => {
      const row = byLevel.get(l)!;
      const n = row.length;
      row.forEach((node, i) => {
        const x = ((i + 1) / (n + 1)) * (w - padX * 2) + padX;
        const y = padY + li * levelGap;
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
        // Detect a reciprocal pair so we can bow the two arrows apart.
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

  const nodeR = 6;

  function edgePath(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    bowed: boolean
  ) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const trim = nodeR + 5;
    const sx = p1.x + ux * trim;
    const sy = p1.y + uy * trim;
    const ex = p2.x - ux * trim;
    const ey = p2.y - uy * trim;
    if (!bowed) {
      return `M ${sx} ${sy} L ${ex} ${ey}`;
    }
    // left-hand normal so A→B and B→A bow to opposite sides (two visible arrows).
    const nx = -uy;
    const ny = ux;
    const bow = Math.min(36, len * 0.16);
    const mx = (sx + ex) / 2 + nx * bow;
    const my = (sy + ey) / 2 + ny * bow;
    return `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`;
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
          Arrows point upward from an authorisation to the ones connected to it.
          Prerequisites sit at the top; roles branch out below. Two arrows mean both
          are connected to each other.
        </span>
      </div>

      {layoutNodes.length === 0 ? (
        <div className="rounded-md border bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No connections to display yet.
        </div>
      ) : (
        <div className="max-h-[72vh] overflow-auto rounded-md border bg-gray-50">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block"
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,3 L0,6 Z" fill="#2563eb" />
              </marker>
            </defs>

            {layoutEdges.map((e, i) => (
              <path
                key={`${e.a}-${e.b}-${i}`}
                d={edgePath(e.p1, e.p2, e.reciprocal)}
                fill="none"
                stroke="#2563eb"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
                opacity={0.75}
              />
            ))}

            {layoutNodes.map((n) => {
              const isFocus = n.id === focusId;
              return (
                <g key={n.id}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={isFocus ? nodeR + 2 : nodeR}
                    fill={isFocus ? "#111827" : "#2563eb"}
                  />
                  <text
                    x={n.x}
                    y={n.y - 12}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#111827"
                  >
                    {n.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
