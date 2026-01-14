/**
 * 仪表板/概览相关 API
 */

import { adminPath, get } from "./client";
import type {
  SummaryResponse,
  AlertsResponse,
  ObsSummaryResponse,
  SystemResponse,
  StorageResponse,
} from "../types";

export function getSummary(workspaceId: string): Promise<SummaryResponse> {
  return get(adminPath(workspaceId, "/summary"));
}

export function getAlerts(workspaceId: string): Promise<AlertsResponse> {
  return get(adminPath(workspaceId, "/alerts"));
}

export function getObsSummary(workspaceId: string, dateRange: string = "24h"): Promise<ObsSummaryResponse> {
  return get(adminPath(workspaceId, `/obs-summary?date_range=${dateRange}`));
}

export function getSystemInfo(workspaceId: string): Promise<SystemResponse> {
  return get(adminPath(workspaceId, "/system"));
}

export function getStorageInfo(workspaceId: string): Promise<StorageResponse> {
  return get(adminPath(workspaceId, "/storage"));
}
