import { get } from "./http";
import type { DashboardData } from "./types";

export const dashboardApi = {
  get: () => get<DashboardData>("/dashboard"),
};
