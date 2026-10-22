import type { ServiceStatus } from './scene'

// Checks the services configured in each puesto every minute. Placeholder: nothing is checked yet.
export class ServiceMonitor {
  readonly status: Record<string, ServiceStatus> = {}

  constructor(private readonly onChange: () => void) {}

  start() {
    void this.onChange
  }

  dispose() {}
}
