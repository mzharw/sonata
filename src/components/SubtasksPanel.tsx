import { useQuery } from "@tanstack/react-query";
import { native } from "../lib/native";
import type { DocumentSummary } from "../types/domain";
import { IconChevronRight, IconStatusDone, IconStatusProgress, IconStatusTodo } from "./icons";

function statusIcon(status: DocumentSummary["status"]) {
  if (status === "completed") return IconStatusDone;
  if (status === "in_progress") return IconStatusProgress;
  return IconStatusTodo;
}

/** A task's children are stored on the child; this makes their individual state visible in the parent's detail view. */
export function SubtasksPanel({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const children = useQuery({ queryKey: ["children", id], queryFn: () => native.children(id) });
  const items = children.data ?? [];
  const complete = items.filter((child) => child.status === "completed").length;

  if (children.isLoading || items.length === 0) return null;

  return (
    <section className="subtasks-panel" aria-label="Subtasks">
      <header>
        <div><span>Subtasks · progress</span><strong>{complete}/{items.length} complete</strong></div>
        <div className="subtasks-progress" aria-label={`${complete} of ${items.length} subtasks complete`}><i style={{ width: `${(complete / items.length) * 100}%` }} /></div>
        <small>Only subtasks created from this task count toward progress.</small>
      </header>
      <ul>
        {items.map((child) => {
          const StatusIcon = statusIcon(child.status);
          const childProgress = child.childCount ? `${child.completedChildCount}/${child.childCount}` : undefined;
          return (
            <li key={child.id}>
              <button type="button" onClick={() => onOpen(child.id)}>
                <StatusIcon size={15} />
                <span className={child.status === "completed" ? "is-completed" : undefined}>{child.title || "Untitled subtask"}</span>
                {childProgress && <small>{childProgress}</small>}
                <IconChevronRight size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
