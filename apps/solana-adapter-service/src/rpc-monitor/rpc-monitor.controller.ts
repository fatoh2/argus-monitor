import { Controller, Get, Param } from '@nestjs/common';
import { RpcMonitorService } from './rpc-monitor.service';

@Controller('rpc-monitor')
export class RpcMonitorController {
  constructor(private readonly rpcMonitorService: RpcMonitorService) {}

  @Get('health')
  getHealth() {
    const endpoints = this.rpcMonitorService.getMonitoredEndpoints();
    const snapshots = endpoints.map((ep) => ({
      endpoint: ep,
      latest: this.rpcMonitorService.getLatestSnapshot(ep),
    }));

    const allHealthy = snapshots.every(
      (s) => s.latest && s.latest.healthy,
    );

    return {
      status: allHealthy ? 'ok' : 'degraded',
      monitoredEndpoints: endpoints.length,
      endpoints: snapshots,
    };
  }

  @Get('health/:endpoint')
  getEndpointHealth(@Param('endpoint') endpoint: string) {
    const decoded = decodeURIComponent(endpoint);
    const snapshot = this.rpcMonitorService.getLatestSnapshot(decoded);
    if (!snapshot) {
      return {
        endpoint: decoded,
        healthy: false,
        error: 'No health data available yet',
      };
    }
    return snapshot;
  }
}
