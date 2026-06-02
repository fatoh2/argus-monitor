import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  walletsApi,
  balancesApi,
  transactionsApi,
  Wallet,
  WalletBalance,
  Transaction,
  TokenBalance,
} from '../services/api';

/** Format lamports to a human-readable SOL string */
function formatSol(lamports: string, decimals: number = 9): string {
  const value = Number(BigInt(lamports)) / 10 ** decimals;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals });
}

/** Truncate a long address for display */
function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Format a timestamp to a relative or absolute string */
function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Get a display color for a transaction type */
function txTypeColor(type: string): string {
  switch (type) {
    case 'receive': return 'text-green-600 bg-green-50';
    case 'send': return 'text-red-600 bg-red-50';
    case 'swap': return 'text-blue-600 bg-blue-50';
    default: return 'text-gray-600 bg-gray-50';
  }
}

/** Get a display color for a transaction status */
function txStatusColor(status: string): string {
  switch (status) {
    case 'confirmed': return 'text-green-700 bg-green-100';
    case 'pending': return 'text-yellow-700 bg-yellow-100';
    case 'failed': return 'text-red-700 bg-red-100';
    default: return 'text-gray-700 bg-gray-100';
  }
}

export default function WalletDashboard() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add wallet form
  const [newAddress, setNewAddress] = useState('');
  const [newChain, setNewChain] = useState('SOLANA');
  const [addingWallet, setAddingWallet] = useState(false);

  // Live update banner
  const [liveUpdate, setLiveUpdate] = useState<string | null>(null);

  // Socket.io connection
  const [socket, setSocket] = useState<Socket | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [walletsData, balancesData, txsData] = await Promise.all([
        walletsApi.findAll(),
        balancesApi.findAll().catch(() => [] as WalletBalance[]),
        transactionsApi.findAll().catch(() => [] as Transaction[]),
      ]);
      setWallets(walletsData);
      setBalances(balancesData);
      setTransactions(txsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Socket.io connection for live updates
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socketUrl = import.meta.env.VITE_WS_URL || '';
    // If no explicit WS URL, connect to the same host (Socket.io path /)
    const sio = io(socketUrl || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: Infinity,
    });

    sio.on('connect', () => {
      console.log('Socket.io connected');
    });

    sio.on('wallet_update', (data: { walletId: string; type: string }) => {
      setLiveUpdate(`Wallet ${truncateAddress(data.walletId)}: ${data.type}`);
      setTimeout(() => setLiveUpdate(null), 5000);
      fetchData();
    });

    sio.on('balance_update', (data: { walletId: string; solBalance: string }) => {
      setLiveUpdate(`Balance updated for wallet`);
      setTimeout(() => setLiveUpdate(null), 5000);
      // Optimistically update balances
      setBalances((prev) =>
        prev.map((b) =>
          b.walletId === data.walletId ? { ...b, solBalance: data.solBalance, updatedAt: new Date().toISOString() } : b
        )
      );
    });

    sio.on('new_transaction', (data: Transaction) => {
      setLiveUpdate(`New ${data.type} transaction: ${formatSol(data.amount)} ${data.symbol}`);
      setTimeout(() => setLiveUpdate(null), 5000);
      setTransactions((prev) => [data, ...prev]);
    });

    sio.on('disconnect', () => {
      console.log('Socket.io disconnected');
    });

    sio.on('connect_error', (err) => {
      console.log('Socket.io connection error (non-critical):', err.message);
    });

    setSocket(sio);

    return () => {
      sio.disconnect();
    };
  }, [fetchData]);

  const handleAddWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingWallet(true);
    setError('');
    try {
      await walletsApi.create(newAddress, newChain);
      setNewAddress('');
      setNewChain('SOLANA');
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingWallet(false);
    }
  };

  const handleDeleteWallet = async (id: string) => {
    try {
      await walletsApi.remove(id);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <h2 className="text-2xl font-bold text-gray-900" data-testid="dashboard-title">Wallet Dashboard</h2>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm" data-testid="dashboard-error">
          {error}
        </div>
      )}

      {liveUpdate && (
        <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm animate-pulse" data-testid="live-update">
          {liveUpdate}
        </div>
      )}

      {/* Add Wallet Form */}
      <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200" data-testid="add-wallet-section">
        <h3 className="text-lg font-semibold mb-4">Add Wallet</h3>
        <form onSubmit={handleAddWallet} className="flex gap-4 items-end" data-testid="add-wallet-form">
          <div className="flex-1">
            <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700">Address</label>
            <input
              id="walletAddress"
              type="text"
              required
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="Enter wallet address"
              data-testid="wallet-address-input"
            />
          </div>
          <div>
            <label htmlFor="walletChain" className="block text-sm font-medium text-gray-700">Chain</label>
            <select
              id="walletChain"
              value={newChain}
              onChange={(e) => setNewChain(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              data-testid="wallet-chain-select"
            >
              <option value="SOLANA">Solana</option>
              <option value="ETHEREUM">Ethereum</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={addingWallet}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            data-testid="add-wallet-submit"
          >
            {addingWallet ? 'Adding...' : 'Add Wallet'}
          </button>
        </form>
      </section>

      {/* Wallets List with Balances */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200" data-testid="wallets-section">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Wallets</h3>
        </div>

        {wallets.length === 0 ? (
          <div className="p-6 text-center text-gray-500" data-testid="no-wallets">
            No wallets added yet. Add one above.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {wallets.map((wallet) => {
              const balance = balances.find((b) => b.walletId === wallet.id);
              return (
                <div key={wallet.id} className="p-6" data-testid={`wallet-item-${wallet.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-mono font-medium text-gray-900">
                          {truncateAddress(wallet.address)}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {wallet.chain}
                        </span>
                      </div>

                      {/* SOL Balance */}
                      {balance && (
                        <div className="mb-3">
                          <div className="text-2xl font-bold text-gray-900">
                            ◎ {formatSol(balance.solBalance)}
                          </div>
                          <div className="text-xs text-gray-500">
                            SOL
                          </div>
                        </div>
                      )}

                      {/* SPL Token Balances */}
                      {balance && balance.tokens.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {balance.tokens.map((token: TokenBalance) => (
                            <div
                              key={token.mint}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-sm"
                              data-testid={`token-balance-${token.symbol}`}
                            >
                              <span className="font-medium text-gray-900">
                                {formatSol(token.amount, token.decimals)}
                              </span>
                              <span className="text-gray-500">{token.symbol}</span>
                              {token.usdValue && (
                                <span className="text-gray-400 text-xs">(${token.usdValue})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {!balance && (
                        <div className="text-sm text-gray-400 mb-3">Loading balances...</div>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteWallet(wallet.id)}
                      className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                      data-testid={`delete-wallet-${wallet.id}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Transactions Table */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200" data-testid="transactions-section">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
        </div>

        {transactions.length === 0 ? (
          <div className="p-6 text-center text-gray-500" data-testid="no-transactions">
            No transactions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="transactions-table">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Signature</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50" data-testid={`transaction-row-${tx.id}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${txTypeColor(tx.type)}`}>
                        {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-900">
                      {formatSol(tx.amount)} {tx.symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-500 max-w-[200px] truncate" title={tx.signature}>
                      {truncateAddress(tx.signature)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${txStatusColor(tx.status)}`}>
                        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">
                      {formatTime(tx.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
