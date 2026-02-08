import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

const execFileAsync = promisify(execFile);

interface CpuCoreTimes {
  idle: number;
  total: number;
}

interface ProcessStat {
  pid: number;
  cpu: number;
  memory: number;
  command: string;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  async getOverview() {
    const [cpuUsage, memory, disk, topProcesses] = await Promise.all([
      this.getCpuUsagePercent(),
      Promise.resolve(this.getMemoryInfo()),
      this.getDiskUsage(),
      this.getTopProcesses(8)
    ]);

    return {
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      uptimeSeconds: os.uptime(),
      loadAverage: os.loadavg(),
      cpu: {
        cores: os.cpus().length,
        usagePercent: cpuUsage
      },
      memory,
      disk,
      nodeProcess: {
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
        rssBytes: process.memoryUsage().rss,
        heapUsedBytes: process.memoryUsage().heapUsed
      },
      topProcesses
    };
  }

  private getMemoryInfo() {
    const total = os.totalmem();
    const available = this.getAvailableMemoryBytes();
    const used = Math.max(0, total - available);
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: available,
      usagePercent: this.roundPercent((used / total) * 100)
    };
  }

  private getAvailableMemoryBytes() {
    if (os.platform() === 'linux') {
      try {
        const meminfo = readFileSync('/proc/meminfo', 'utf8');
        const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
        if (match) {
          return Number(match[1]) * 1024;
        }
      } catch (error) {
        this.logger.warn(`读取 MemAvailable 失败，回退到 os.freemem: ${(error as Error).message}`);
      }
    }
    return os.freemem();
  }

  private async getCpuUsagePercent() {
    const before = this.snapshotCpuTimes();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const after = this.snapshotCpuTimes();
    const idle = after.idle - before.idle;
    const total = after.total - before.total;
    if (total <= 0) {
      return 0;
    }
    return this.roundPercent((1 - idle / total) * 100);
  }

  private snapshotCpuTimes(): CpuCoreTimes {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      const times = cpu.times;
      idle += times.idle;
      total += times.user + times.nice + times.sys + times.irq + times.idle;
    }
    return { idle, total };
  }

  private async getDiskUsage() {
    try {
      const { stdout } = await execFileAsync('df', ['-kP', '/'], { timeout: 1500 });
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) {
        return null;
      }
      const cols = lines[1].trim().split(/\s+/);
      if (cols.length < 6) {
        return null;
      }
      const totalBytes = Number(cols[1]) * 1024;
      const usedBytes = Number(cols[2]) * 1024;
      const freeBytes = Number(cols[3]) * 1024;
      const usagePercent = Number(String(cols[4]).replace('%', ''));
      return {
        mountPoint: cols[5],
        totalBytes,
        usedBytes,
        freeBytes,
        usagePercent: this.roundPercent(usagePercent)
      };
    } catch (error) {
      this.logger.warn(`获取磁盘信息失败: ${(error as Error).message}`);
      return null;
    }
  }

  private async getTopProcesses(limit: number) {
    try {
      const count = Math.max(1, Math.min(limit, 20)) + 1;
      const { stdout } = await execFileAsync(
        'ps',
        ['-Ao', 'pid,pcpu,pmem,comm', '--sort=-pcpu'],
        { timeout: 1500 }
      );
      const lines = stdout.trim().split('\n').slice(1, count);
      return lines
        .map((line) => line.trim().split(/\s+/, 4))
        .map((cols): ProcessStat | null => {
          if (cols.length < 4) {
            return null;
          }
          return {
            pid: Number(cols[0]),
            cpu: this.roundPercent(Number(cols[1])),
            memory: this.roundPercent(Number(cols[2])),
            command: cols[3]
          };
        })
        .filter((item): item is ProcessStat => item !== null);
    } catch (error) {
      this.logger.warn(`获取进程信息失败: ${(error as Error).message}`);
      return [];
    }
  }

  private roundPercent(input: number) {
    return Number.isFinite(input) ? Number(input.toFixed(2)) : 0;
  }
}
