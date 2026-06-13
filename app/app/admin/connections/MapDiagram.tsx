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

  // Only show authorisations that take part in at least one connection.
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
        (e) => neighbours.has(e.a) && neighbours.has(e.b) && (e.a === focusId || e.b === focusId)
      );
    }

    const count = activeNodes.length;
    const radius = Math.max(180, count * 34);
    const pad = 160;
    const size = radius * 2 + pad * 2;
    const cx = size / 2;
    const cy = size / 2;

    const pos = new Map<string, { x: number; y: number; angle: number }>();
    activeNodes.forEach((n, i) => {
      const angle = count <= 1 ? -Math.PI / 2 : (i / count) * Math.PI * 2 - Math.PI / 2;
      pos.set(n.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        angle,
      });
    });

    const laidOutNodes = activeNodes
      .map((n) => ({ ...n, ...pos.get(n.id)! }))
      .filter((n) => n.x !== undefined);

    const laidOutEdges = activeEdges
      .map((e) => {
        const p1 = pos.get(e.a);
        const p2 = pos.get(e.b);
        if (!p1 || !p2) return null;
        return { a: e.a, b: e.b, p1, p2 };
      })
      .filter(Boolean) as { a: string; b: string; p1: any; p2: any }[];

    return {
      layoutNodes: laidOutNodes,
      layoutEdges: laidOutEdges,
      width: size,
      height: size,
    };
  }, [nodes, edges, focusId]);

  const nodeR = 6;

  function edgePath(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // left-hand normal so A→B and B→A bow to opposite sides (two visible arrows).
    const nx = -uy;
    const ny = ux;
    // trim endpoints so the line starts/ends just outside the node dots.
    const trim = nodeR + 4;
    const sx = p1.x + ux * trim;
    const sy = p1.y + uy * trim;
    const ex = p2.x - ux * trim;
    const ey = p2.y - uy * trim;
    const bow = Math.min(60, len * 0.18);
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
          Arrows point from an authorisation to the ones connected to it. Two arrows mean both are connected to each other.
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
                d={edgePath(e.p1, e.p2)}
                fill="none"
                stroke="#2563eb"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
                opacity={0.8}
              />
            ))}

            {layoutNodes.map((n) => {
              const isFocus = n.id === focusId;
              // anchor label outward from the circle centre
              const labelOnLeft = Math.cos(n.angle) < -0.01;
              return (
                <g key={n.id}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={isFocus ? nodeR + 2 : nodeR}
                    fill={isFocus ? "#111827" : "#2563eb"}
                  />
                  <text
                    x={n.x + (labelOnLeft ? -10 : 10)}
                    y={n.y + 4}
                    textAnchor={labelOnLeft ? "end" : "start"}
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
