// @ts-nocheck
import { ModuleType } from "@/lib/types/module";

export function moduleEditHref(type: ModuleType, id: string): string {
  if (type === "onsite_training" || type === "onsite_assessment") return `/app/creator/modules/${id}/onsite`;
  if (type === "digital_assessment_quiz") return `/app/creator/modules/${id}/quiz`;
  return `/app/creator/modules/${id}`; // default editor
}