import http from './http';

export interface DashboardOverview {
  hostname: string;
  platform: string;
  uptimeSeconds: number;
  loadAverage: number[];
  cpu: {
    cores: number;
    usagePercent: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  disk: {
    mountPoint: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  } | null;
  nodeProcess: {
    pid: number;
    uptimeSeconds: number;
    rssBytes: number;
    heapUsedBytes: number;
  };
  topProcesses: Array<{
    pid: number;
    cpu: number;
    memory: number;
    command: string;
  }>;
}

export const fetchDashboardOverview = () => http.get('/dashboard/overview') as Promise<DashboardOverview>;

