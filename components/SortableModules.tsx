"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ModuleType } from "@/lib/types/module";

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function DraggableRow({
  item,
  index,
  draggingIndex,
  setDraggingIndex,
  onReorder,
}: {
  item: { id: string; title: string; order_index: number };
  index: number;
  draggingIndex: number | null;
  setDraggingIndex: (i: number | null) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const ref = useRef<HTMLLIElement | null>(null);

  return (
    <li
      ref={ref}
      draggable
      onDragStart={() => setDraggingIndex(index)}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggingIndex === null || draggingIndex === index) return;
        onReorder(draggingIndex, index);
        setDraggingIndex(index);
      }}
      onDragEnd={() => setDraggingIndex(null)}
      className={classNames(
        "flex items-center justify-between p-2 rounded border",
        draggingIndex === index ? "bg-gray-100 border-gray-400" : "bg-white border-transparent"
      )}
      title="Drag to reorder"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="cursor-grab select-none text-gray-400">⋮⋮</span>
        <div className="truncate">
          <div className="font-medium truncate">{item.title}</div>
          <div className="text-xs text-gray-500">Order: {index}</div>
        </div>
      </div>
    </li>
  );
}

export default function SortableModules({
  initialItems,
  courseId,
  type,
  reorderAction,
}: {
  initialItems: { id: string; title: string; order_index: number; type: string; created_at: string | null }[];
  courseId: string;
  type: ModuleType;
  reorderAction: (formData: FormData) => Promise<void>;
}) {
  const [items, setItems] = useState(initialItems);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const orderedIds = useMemo(() => items.map((x) => x.id), [items]);

  function onReorder(from: number, to: number) {
    setItems((prev) => arrayMove(prev, from, to));
  }

  async function handleSave() {
    const fd = new FormData();
    fd.append("course_id", courseId);
    fd.append("type", type);
    fd.append("ordered_ids", JSON.stringify(orderedIds));
    startTransition(async () => {
      await reorderAction(fd);
    });
  }

  if (items.length <= 1) {
    return null; // nothing to reorder
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Reorder modules (drag rows)</h3>
        <button
          onClick={handleSave}
          disabled={isPending}
          className={classNames(
            "rounded-md px-3 py-1 text-sm",
            isPending ? "bg-gray-300 cursor-wait" : "bg-black text-white"
          )}
        >
          {isPending ? "Saving..." : "Save order"}
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((item, idx) => (
          <DraggableRow
            key={item.id}
            item={item}
            index={idx}
            draggingIndex={draggingIndex}
            setDraggingIndex={setDraggingIndex}
            onReorder={onReorder}
          />
        ))}
      </ul>
    </div>
  );
}
