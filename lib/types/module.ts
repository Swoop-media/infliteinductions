/**
 * Shared types for course modules
 */

export type ModuleType =
  | "digital_training"
  | "digital_assessment_quiz"
  | "onsite_training"
  | "onsite_assessment"
  | "request_document";

export type BlockKind = 
  | "rich_text" 
  | "link" 
  | "video_embed" 
  | "file" 
  | "request_document" 
  | "quiz_questions";