export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Question =
  | { type: "choice"; instructions: Json; criteria: Record<string, Json> }
  | { type: "noul"; instructions: Json; criteria?: { true: Json; false: Json } }
  | { type: "score"; instructions: Json; criteria: Json[] };

export interface EvaluationRequest {
  model: string;
  state: Json;
  questions: Record<string, Question>;
}

export type Answer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; legend: Record<string, Json>; probabilities: Record<string, number>; confidence: number };

export interface EvaluationResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface EvaluationRecord {
  key: string;
  request: EvaluationRequest;
  response: EvaluationResponse;
  elapsedMs: number;
  attempts: number;
  costUsd: number;
  cached: boolean;
}

export type Split = "development" | "holdout";
export type Variant = "v1" | "v2";
export const MODEL = "jev-1.13.0";
