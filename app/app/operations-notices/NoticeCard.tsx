"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Check, Clock } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";

type NoticeCardProps = {
  notice: {
    id: string;
    title: string;
    description: string | null;
    department: string | null;
    tags: string[] | null;
    require_acknowledgement: boolean;
    responsiblePersonName: string | null;
    expiryDate: Date | null;
    assignedAt: string | null;
    acknowledgedAt: string | null;
  };
  userId: string;
  isAssigned: boolean;
  acknowledgeAction: (formData: FormData) => Promise<void>;
};

export default function NoticeCard({
  notice,
  userId,
  isAssigned,
  acknowledgeAction,
}: NoticeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sanitizedDescription = useMemo(() => {
    if (!notice.description) return "";
    return DOMPurify.sanitize(notice.description, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'a', 'img', 'span', 'div'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style'],
      ALLOW_DATA_ATTR: false,
    });
  }, [notice.description]);

  const needsAcknowledgement =
    notice.require_acknowledgement && isAssigned && !notice.acknowledgedAt;
  const isAcknowledged = !!notice.acknowledgedAt;

  const handleAcknowledge = async () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.set("notice_id", notice.id);
    formData.set("user_id", userId);
    try {
      await acknowledgeAction(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        isAssigned
          ? needsAcknowledgement
            ? "border-orange-300 bg-orange-50"
            : "border-green-300 bg-green-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-inset rounded-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{notice.title}</h3>
            {notice.department && (
              <span className="inline-block mt-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {notice.department}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAssigned && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium flex items-center gap-1 ${
                  isAcknowledged
                    ? "bg-green-200 text-green-800"
                    : "bg-orange-200 text-orange-800"
                }`}
              >
                {isAcknowledged ? (
                  <>
                    <Check className="h-3 w-3" />
                    Acknowledged
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3" />
                    Pending
                  </>
                )}
              </span>
            )}
            {notice.require_acknowledgement && !isAssigned && (
              <span className="text-xs text-gray-500">Requires acknowledgement</span>
            )}
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>

        {!expanded && notice.description && (
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">
            {notice.description.replace(/<[^>]*>/g, '')}
          </p>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          {sanitizedDescription ? (
            <div 
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
            />
          ) : (
            <p className="text-sm text-gray-500 italic">No description provided.</p>
          )}

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
            {notice.responsiblePersonName && (
              <span className="flex items-center gap-1">
                <span className="font-medium">Responsible:</span> {notice.responsiblePersonName}
              </span>
            )}
            {notice.expiryDate && (
              <span className="flex items-center gap-1">
                <span className="font-medium">Expires:</span>{" "}
                {new Date(notice.expiryDate).toLocaleDateString()}
              </span>
            )}
          </div>

          {notice.tags && notice.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {notice.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {isAssigned && notice.assignedAt && (
            <p className="mt-3 text-xs text-gray-500">
              Assigned: {new Date(notice.assignedAt).toLocaleDateString()}
              {isAcknowledged &&
                notice.acknowledgedAt &&
                ` | Acknowledged: ${new Date(notice.acknowledgedAt).toLocaleDateString()}`}
            </p>
          )}

          {needsAcknowledgement && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={isSubmitting}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Acknowledging...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Acknowledge Notice
                  </>
                )}
              </button>
            </div>
          )}

          {isAcknowledged && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <Check className="h-4 w-4" />
                <span>You have acknowledged this notice</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
