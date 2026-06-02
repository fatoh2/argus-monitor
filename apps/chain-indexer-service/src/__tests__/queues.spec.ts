import { QUEUES } from '@argus/shared-types';

describe('Queue names (chain-indexer-service)', () => {
  it('should have CHAIN_INDEXER queue defined', () => {
    expect(QUEUES.CHAIN_INDEXER).toBe('chain:indexer');
  });

  it('should have SOLANA_FETCH queue defined', () => {
    expect(QUEUES.SOLANA_FETCH).toBe('solana:fetch');
  });

  it('should have ALERT_EVALUATION queue defined', () => {
    expect(QUEUES.ALERT_EVALUATION).toBe('alert:evaluation');
  });

  it('should have NOTIFICATION_DISPATCH queue defined', () => {
    expect(QUEUES.NOTIFICATION_DISPATCH).toBe('notification:dispatch');
  });

  it('should have all queue names as const strings', () => {
    const queueNames = Object.values(QUEUES);
    expect(queueNames).toHaveLength(4);
    queueNames.forEach((name) => {
      expect(typeof name).toBe('string');
      expect(name).toMatch(/^[a-z]+:[a-z]+$/);
    });
  });
});
