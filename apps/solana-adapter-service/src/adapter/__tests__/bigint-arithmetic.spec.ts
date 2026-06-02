/**
 * BIGINT arithmetic tests for Solana lamport handling.
 *
 * Solana amounts are always stored as BIGINT (lamports), never as float.
 * This spec verifies that arithmetic operations stay in the integer domain.
 */

describe('BIGINT arithmetic (lamports)', () => {
  it('should add lamports without float conversion', () => {
    const balance = 1000000000n; // 1 SOL in lamports
    const incoming = 500000000n; // 0.5 SOL in lamports

    const result = balance + incoming;

    expect(result).toBe(1500000000n);
    expect(typeof result).toBe('bigint');
  });

  it('should subtract lamports without float conversion', () => {
    const balance = 2000000000n;
    const fee = 5000n;

    const result = balance - fee;

    expect(result).toBe(1999995000n);
    expect(typeof result).toBe('bigint');
  });

  it('should compare lamports correctly', () => {
    const threshold = 1000000000n;
    const balanceLow = 500000000n;
    const balanceEqual = 1000000000n;
    const balanceHigh = 1500000000n;

    expect(balanceLow < threshold).toBe(true);
    expect(balanceLow <= threshold).toBe(true);
    expect(balanceEqual >= threshold).toBe(true);
    expect(balanceHigh >= threshold).toBe(true);
    expect(balanceHigh > threshold).toBe(true);
  });

  it('should multiply lamports without float conversion', () => {
    const single = 1000000000n;
    const count = 3n;

    const result = single * count;

    expect(result).toBe(3000000000n);
    expect(typeof result).toBe('bigint');
  });

  it('should handle zero lamports', () => {
    const zero = 0n;
    const amount = 1000000000n;

    expect(zero + amount).toBe(1000000000n);
    expect(amount - amount).toBe(0n);
    expect(amount * zero).toBe(0n);
  });

  it('should never produce float from division when dividing evenly', () => {
    const total = 10000000000n;
    const parts = 5n;

    const result = total / parts;

    expect(result).toBe(2000000000n);
    expect(typeof result).toBe('bigint');
  });

  it('should truncate on uneven division (no rounding)', () => {
    const total = 10000000001n;
    const parts = 5n;

    const result = total / parts;

    // BigInt division truncates toward zero
    expect(result).toBe(2000000000n);
    expect(result * parts).not.toBe(total); // lost the remainder
  });
});
