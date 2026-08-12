import { BlockchainService } from "./blockchain-service.js";

export class OracleWorker {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly service: BlockchainService,
    private readonly intervalMs: number,
    private readonly autoTrigger: boolean,
    private readonly log: (message: string) => void = console.log,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.scanOnce();
    }, this.intervalMs);
    this.log(`Oracle worker started; scan interval ${this.intervalMs}ms; autoTrigger=${this.autoTrigger}`);
  }

  async scanOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expiredVaults = await this.service.scanExpiredVaults();
      this.log(`Oracle scan found ${expiredVaults.length} expired active vault(s)`);
      if (this.autoTrigger) {
        for (const vault of expiredVaults) {
          try {
            const result = await this.service.triggerExpired(vault.id);
            this.log(`Triggered vault ${vault.id.toString()} in transaction ${result.hash}`);
          } catch (error) {
            this.log(`Failed to trigger vault ${vault.id.toString()}: ${String(error)}`);
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.log("Oracle worker stopped");
  }
}
