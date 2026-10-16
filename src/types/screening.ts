/**
 * Screening types and interfaces
 */

export type ScreeningFormat =
  | "35mm"
  | "70mm"
  | "70mm_imax"
  | "dcp"
  | "dcp_4k"
  | "imax"
  | "imax_laser"
  | "dolby_cinema"
  | "4dx"
  | "screenx"
  | "unknown";

export type EventType =
  | "q_and_a"
  | "intro"
  | "discussion"
  | "double_bill"
  | "marathon"
  | "singalong"
  | "quote_along"
  | "preview"
  | "premiere"
  | "restoration_premiere"
  | "anniversary"
  | "members_only"
  | "relaxed";
