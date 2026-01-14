/**
 * 反馈相关 API
 */

import { adminPath, get, patch, buildQuery } from "./client";
import type { FeedbackResponse, OkResponse } from "../types";

export interface ListFeedbackParams {
  page?: number;
  page_size?: number;
  app_id?: string;
  rating?: string;
  reason?: string;
  date_range?: string;
}

export function listFeedback(workspaceId: string, params: ListFeedbackParams = {}): Promise<FeedbackResponse> {
  const query = buildQuery({
    page: params.page,
    page_size: params.page_size,
    app_id: params.app_id,
    rating: params.rating,
    reason: params.reason,
    date_range: params.date_range,
  });
  return get(`${adminPath(workspaceId, "/feedback")}${query ? `?${query}` : ""}`);
}

export interface UpdateFeedbackPayload {
  status: string;
  attribution: string;
  tags: string[];
}

export function updateFeedback(workspaceId: string, feedbackId: number, payload: UpdateFeedbackPayload): Promise<OkResponse> {
  return patch(adminPath(workspaceId, `/feedback/${feedbackId}`), payload);
}
