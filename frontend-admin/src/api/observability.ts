/**
 * 观测相关 API
 */

import { adminPath, get, buildQuery } from "./client";
import type { RetrievalEventsResponse, RetrievalEventDetail, MetricsResponse } from "../types";

export interface ListRetrievalEventsParams {
  page?: number;
  page_size?: number;
  app_id?: string;
  kb_id?: string;
  conversation_id?: string;
  message_id?: string;
  request_id?: string;
  error_code?: string;
  has_error?: boolean;
  date_range?: string;
}

export function listRetrievalEvents(workspaceId: string, params: ListRetrievalEventsParams = {}): Promise<RetrievalEventsResponse> {
  const query = buildQuery({
    page: params.page,
    page_size: params.page_size,
    app_id: params.app_id,
    kb_id: params.kb_id,
    conversation_id: params.conversation_id,
    message_id: params.message_id,
    request_id: params.request_id,
    error_code: params.error_code,
    has_error: params.has_error,
    date_range: params.date_range,
  });
  return get(`${adminPath(workspaceId, "/retrieval-events")}${query ? `?${query}` : ""}`);
}

export function getRetrievalEvent(workspaceId: string, eventId: number): Promise<RetrievalEventDetail> {
  return get(adminPath(workspaceId, `/retrieval-events/${eventId}`));
}

export function getMetrics(workspaceId: string, dateRange: string = "24h"): Promise<MetricsResponse> {
  return get(adminPath(workspaceId, `/metrics?date_range=${dateRange}`));
}
