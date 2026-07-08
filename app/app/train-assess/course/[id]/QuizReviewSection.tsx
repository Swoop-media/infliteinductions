// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, FileQuestion, MessageSquare } from "lucide-react";

type ReviewOption = {
  id: string;
  label: string;
  isCorrect: boolean;
};

type ReviewQuestion = {
  id: string;
  prompt: string;
  options: ReviewOption[];
  selectedOptionId: string | null;
};

type ExistingReview = {
  reviewerName: string;
  comments: string;
  updatedAt: string;
};

export type QuizReviewData = {
  quizId: string;
  quizTitle: string;
  attempt: {
    scorePct: number | null;
    passed: boolean | null;
    submittedAt: string | null;
  } | null;
  questions: ReviewQuestion[];
  reviews: ExistingReview[];
  myComment: string;
};

interface Props {
  quizzes: QuizReviewData[];
  onSaveComment: (quizId: string, comments: string) => Promise<void>;
}

export default function QuizReviewSection({ quizzes, onSaveComment }: Props) {
  if (!quizzes || quizzes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileQuestion className="h-5 w-5" />
          Quiz Review
        </CardTitle>
        <CardDescription>
          Review the learner&apos;s quiz answers and add your comments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {quizzes.map((quiz) => (
          <SingleQuizReview key={quiz.quizId} quiz={quiz} onSaveComment={onSaveComment} />
        ))}
      </CardContent>
    </Card>
  );
}

function SingleQuizReview({ quiz, onSaveComment }: { quiz: QuizReviewData; onSaveComment: Props["onSaveComment"] }) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState(quiz.myComment || "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await onSaveComment(quiz.quizId, comment.trim());
        setSaved(true);
      } catch (e: any) {
        setError("Could not save comment. Please try again.");
      }
    });
  };

  const answeredCount = quiz.questions.filter((q) => q.selectedOptionId).length;
  const correctCount = quiz.questions.filter((q) => {
    const sel = q.options.find((o) => o.id === q.selectedOptionId);
    return sel?.isCorrect;
  }).length;

  return (
    <div className="border rounded-lg">
      {/* Quiz header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b">
        <div>
          <h3 className="font-medium">{quiz.quizTitle}</h3>
          {quiz.attempt ? (
            <p className="text-sm text-muted-foreground">
              Latest attempt
              {quiz.attempt.submittedAt
                ? ` on ${new Date(quiz.attempt.submittedAt).toLocaleDateString()}`
                : ""}
              {quiz.attempt.scorePct != null ? ` — score ${quiz.attempt.scorePct}%` : ""}
              {quiz.questions.length > 0 ? ` (${correctCount}/${quiz.questions.length} correct)` : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">The learner has not attempted this quiz yet.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {quiz.attempt && quiz.attempt.passed != null && (
            <Badge
              variant="outline"
              className={quiz.attempt.passed ? "text-green-600 border-green-600" : "text-red-600 border-red-600"}
            >
              {quiz.attempt.passed ? "Passed" : "Not passed"}
            </Badge>
          )}
          {quiz.attempt && quiz.questions.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Hide answers" : `View answers (${answeredCount})`}
            </Button>
          )}
        </div>
      </div>

      {/* Answers */}
      {expanded && quiz.attempt && (
        <div className="p-4 space-y-4 border-b bg-gray-50/50">
          {quiz.questions.map((q, idx) => {
            const selected = q.options.find((o) => o.id === q.selectedOptionId);
            const isCorrect = !!selected?.isCorrect;
            return (
              <div key={q.id} className="rounded-md border bg-white p-3">
                <div className="flex items-start gap-2">
                  {selected ? (
                    isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    )
                  ) : (
                    <XCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  )}
                  <p className="text-sm font-medium">
                    {idx + 1}. {q.prompt}
                  </p>
                </div>
                <div className="mt-2 ml-6 space-y-1">
                  {q.options.map((o) => {
                    const isSelected = o.id === q.selectedOptionId;
                    return (
                      <div
                        key={o.id}
                        className={`text-sm rounded px-2 py-1 ${
                          isSelected && o.isCorrect
                            ? "bg-green-100 text-green-800"
                            : isSelected && !o.isCorrect
                            ? "bg-red-100 text-red-800"
                            : o.isCorrect
                            ? "bg-green-50 text-green-700"
                            : "text-gray-600"
                        }`}
                      >
                        {o.label}
                        {isSelected && <span className="ml-2 text-xs font-medium">(learner&apos;s answer)</span>}
                        {o.isCorrect && <span className="ml-2 text-xs font-medium">(correct)</span>}
                      </div>
                    );
                  })}
                  {!selected && (
                    <p className="text-xs text-gray-500 italic">No answer recorded for this question.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Existing reviews from others */}
      {quiz.reviews.length > 0 && (
        <div className="p-4 border-b space-y-2">
          <p className="text-sm font-medium flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            Review comments
          </p>
          {quiz.reviews.map((r, i) => (
            <div key={i} className="rounded-md bg-gray-50 p-2 text-sm">
              <p className="text-xs text-gray-500">
                {r.reviewerName} — {new Date(r.updatedAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{r.comments}</p>
            </div>
          ))}
        </div>
      )}

      {/* My comment box */}
      <div className="p-4 space-y-2">
        <label className="text-sm font-medium">Your review comments</label>
        <textarea
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="Add any comments on your review of this quiz…"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={handleSave} disabled={isPending || comment.trim().length === 0}>
            {isPending ? "Saving…" : "Save comment"}
          </Button>
          {saved && <span className="text-sm text-green-600">Comment saved.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}
