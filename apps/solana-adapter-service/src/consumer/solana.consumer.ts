import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, Worker } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUES, QueueJobMap } from '@argus/shared-types';
import { SolanaAdapter } from '../adapter/solana.adapter';

/**
 * BullMQ consumer for solana:fetch queue.
 * Processes scan jobs from the chain-indexer service.
 */
@Processor(QUEUES.SOLANA_FETCH)
export class SolanaConsumer extends WorkerHost {
  private readonly logger = new Logger(SolanaConsumer.name);

  constructor(private readonly solanaAdapter: SolanaAdapter) {
    super();
  }

  /**
   * Process a solana:fetch job.
   * Handles different monitor types: balance, transaction, token_account.
   */
  async process(
    job: Job<QueueJobMap[typeof QUEUES.SOLANA_FETCH]>,
  ): Promise<any> {
    const { walletId, address, monitorType } = job.data;

    this.logger.log(
      `Processing job ${job.id}: wallet=${walletId}, address=${address}, type=${monitorType}`,
    );

    try {
      switch (monitorType) {
        case 'balance':
          return await this.handleBalanceCheck(walletId, address);

        case 'transaction':
          return await this.handleTransactionCheck(walletId, address);

        case 'token_account':
          return await this.handleTokenCheck(walletId, address);

        default:
          this.logger.warn(`Unknown monitor type: ${monitorType}`);
          return { status: 'skipped', reason: `Unknown monitor type: ${monitorType}` };
      }
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // BullMQ will handle retry based on job options
    }
  }

  /**
   * Handle balance check — get native SOL balance.
   */
  private async handleBalanceCheck(
    walletId: string,
    address: string,
  ): Promise<any> {
    const balance = await this.solanaAdapter.getNativeBalance(address);
    return {
      walletId,
      address,
      monitorType: 'balance',
      data: {
        balance: balance.balance.toString(),
        decimals: balance.decimals,
        symbol: balance.symbol,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle transaction check — get recent transactions.
   */
  private async handleTransactionCheck(
    walletId: string,
    address: string,
  ): Promise<any> {
    const transactions = await this.solanaAdapter.getRecentTransactions(
      address,
      20,
    );
    return {
      walletId,
      address,
      monitorType: 'transaction',
      data: {
        transactions: transactions.map((tx) => ({
          signature: tx.signature,
          slot: tx.slot,
          timestamp: tx.timestamp,
          from: tx.from,
          to: tx.to,
          amount: tx.amount.toString(),
          fee: tx.fee.toString(),
          status: tx.status,
          type: tx.type,
        })),
        count: transactions.length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle token check — get SPL token balances.
   */
  private async handleTokenCheck(
    walletId: string,
    address: string,
  ): Promise<any> {
    const tokens = await this.solanaAdapter.getTokenBalances(address);
    return {
      walletId,
      address,
      monitorType: 'token_account',
      data: {
        tokens: tokens.map((t) => ({
          mint: t.mint,
          symbol: t.symbol,
          amount: t.amount.toString(),
          decimals: t.decimals,
          usdValue: t.usdValue,
        })),
        count: tokens.length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
