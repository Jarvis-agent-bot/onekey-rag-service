import type { PaginatedResponse } from "./common";

/**
 * 反馈列表项
 */
export interface FeedbackListItem {
  id: number;
  app_id: string;
  conversation_id: string;
  message_id: string;
  rating: string;
  reason: string;
  comment: string;
  sources: Record<string, unknown>;
  status: string;
  attribution: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
}

/**
 * 反馈列表响应
 */
export type FeedbackResponse = PaginatedResponse<FeedbackListItem>;

/**
 * 反馈状态选项
 */
export type FeedbackStatus = "new" | "confirmed" | "fixed";

/**
 * 反馈归因选项
 */
export type FeedbackAttribution = "" | "retrieval" | "rerank" | "model" | "content" | "other";
