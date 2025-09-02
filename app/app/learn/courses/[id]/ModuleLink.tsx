
"use client";

import Link from "next/link";

type ModuleType =
  | "digital_training"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment";

const TYPE_LABEL: Record<ModuleType, string> = {
  digital_training: "Digital Training",
  digital_assessment_quiz: "Digital Quiz",
  onsite_training: "Onsite Training",
  onsite_assessment: "Onsite Assessment",
};

function typeIcon(t: ModuleType) {
  switch (t) {
    case "digital_training": return "📖";
    case "digital_assessment_quiz": return "📝";
    case "onsite_training": return "👥";
    case "onsite_assessment": return "✅";
    default: return "•";
  }
}

interface ModuleLinkProps {
  moduleId: string;
  courseId: string;
  isUnlocked: boolean;
  isCurrent: boolean;
  isCompleted: boolean;
  module: {
    id: string;
    title: string | null;
    type: ModuleType;
  };
}

export default function ModuleLink({
  moduleId,
  courseId,
  isUnlocked,
  isCurrent,
  isCompleted,
  module,
}: ModuleLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (!isUnlocked) {
      e.preventDefault();
    }
  };

  return (
    <Link
      href={`/app/learn/courses/${courseId}?module=${moduleId}`}
      className={`
        block p-3 rounded-lg border text-sm transition-all
        ${isCurrent 
          ? 'bg-blue-50 border-blue-200 text-blue-800 ring-2 ring-blue-200' 
          : isCompleted 
            ? 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100' 
            : isUnlocked 
              ? 'bg-white border-gray-200 hover:bg-gray-50' 
              : 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
        }
      `}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">
          {isCompleted ? '✅' : isCurrent ? '👁️' : typeIcon(module.type as ModuleType)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {module.title || TYPE_LABEL[module.type as ModuleType]}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {TYPE_LABEL[module.type as ModuleType]}
          </div>
          {!isUnlocked && (
            <div className="text-xs text-gray-400 mt-1">
              🔒 Complete previous modules to unlock
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
