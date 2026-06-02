import React, { useState, useEffect, useCallback } from 'react';
import { walletsApi, alertRulesApi, Wallet, AlertRule, CreateAlertRulePayload } from '../services/api';

export default function DashboardPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add wallet form
  const [newAddress, setNewAddress] = useState('');
  const [newChain, setNewChain] = useState('SOLANA');
  const [addingWallet, setAddingWallet] = useState(false);

  // Add alert rule form
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [ruleType, setRuleType] = useState('balance_low');
  const [ruleThreshold, setRuleThreshold] = useState('');
  const [addingRule, setAddingRule] = useState(false);

  // Live updates
  const [liveUpdate, setLiveUpdate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [walletsData, rulesData] = await Promise.all([
        walletsApi.findAll(),
        alertRulesApi.findAll(),
      ]);
      setWallets(walletsData);
      setAlertRules(rulesData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket connection for live updates
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      // Use native WebSocket for simplicity in E2E tests
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log('WebSocket connected');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'wallet_update' || data.event === 'wallet_update') {
              setLiveUpdate(`Wallet ${data.walletId}: balance updated`);
              setTimeout(() => setLiveUpdate(null), 5000);
              fetchData();
            }
          } catch {
            // Ignore parse errors
          }
        };

        socket.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      clearTimeout(reconnectTimer);
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

  const handleAddAlertRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWalletId) {
      setError('Please select a wallet');
      return;
    }
    setAddingRule(true);
    setError('');
    try {
      const payload: CreateAlertRulePayload = {
        walletId: selectedWalletId,
        chain: wallets.find((w) => w.id === selectedWalletId)?.chain || 'SOLANA',
        type: ruleType,
      };
      if (ruleThreshold) {
        payload.threshold = ruleThreshold;
      }
      await alertRulesApi.create(payload);
      setSelectedWalletId('');
      setRuleType('balance_low');
      setRuleThreshold('');
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingRule(false);
    }
  };

  const handleDeleteAlertRule = async (id: string) => {
    try {
      await alertRulesApi.remove(id);
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
      <h2 className="text-2xl font-bold text-gray-900" data-testid="dashboard-title">Dashboard</h2>

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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="wallet-address-input"
            />
          </div>
          <div>
            <label htmlFor="walletChain" className="block text-sm font-medium text-gray-700">Chain</label>
            <select
              id="walletChain"
              value={newChain}
              onChange={(e) => setNewChain(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="wallet-chain-select"
            >
              <option value="SOLANA">Solana</option>
              <option value="ETHEREUM">Ethereum</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={addingWallet}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            data-testid="add-wallet-submit"
          >
            {addingWallet ? 'Adding...' : 'Add Wallet'}
          </button>
        </form>
      </section>

      {/* Wallets List */}
      <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200" data-testid="wallets-section">
        <h3 className="text-lg font-semibold mb-4">Wallets ({wallets.length})</h3>
        {wallets.length === 0 ? (
          <p className="text-gray-500" data-testid="no-wallets">No wallets added yet.</p>
        ) : (
          <div className="space-y-3" data-testid="wallets-list">
            {wallets.map((wallet) => (
              <div key={wallet.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md" data-testid={`wallet-item-${wallet.id}`}>
                <div>
                  <p className="font-mono text-sm" data-testid={`wallet-address-${wallet.id}`}>{wallet.address}</p>
                  <p className="text-xs text-gray-500" data-testid={`wallet-chain-${wallet.id}`}>{wallet.chain}</p>
                </div>
                <button
                  onClick={() => handleDeleteWallet(wallet.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                  data-testid={`delete-wallet-${wallet.id}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Alert Rule Form */}
      <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200" data-testid="add-alert-rule-section">
        <h3 className="text-lg font-semibold mb-4">Add Alert Rule</h3>
        <form onSubmit={handleAddAlertRule} className="flex gap-4 items-end flex-wrap" data-testid="add-alert-rule-form">
          <div>
            <label htmlFor="ruleWallet" className="block text-sm font-medium text-gray-700">Wallet</label>
            <select
              id="ruleWallet"
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="alert-rule-wallet-select"
            >
              <option value="">Select a wallet</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.address.slice(0, 8)}... ({w.chain})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ruleType" className="block text-sm font-medium text-gray-700">Type</label>
            <select
              id="ruleType"
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="alert-rule-type-select"
            >
              <option value="balance_low">Balance Low</option>
              <option value="balance_high">Balance High</option>
              <option value="transaction_from">Transaction From</option>
              <option value="transaction_to">Transaction To</option>
            </select>
          </div>
          <div>
            <label htmlFor="ruleThreshold" className="block text-sm font-medium text-gray-700">Threshold (optional)</label>
            <input
              id="ruleThreshold"
              type="text"
              value={ruleThreshold}
              onChange={(e) => setRuleThreshold(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="alert-rule-threshold-input"
            />
          </div>
          <button
            type="submit"
            disabled={addingRule}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            data-testid="add-alert-rule-submit"
          >
            {addingRule ? 'Adding...' : 'Add Rule'}
          </button>
        </form>
      </section>

      {/* Alert Rules List */}
      <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200" data-testid="alert-rules-section">
        <h3 className="text-lg font-semibold mb-4">Alert Rules ({alertRules.length})</h3>
        {alertRules.length === 0 ? (
          <p className="text-gray-500" data-testid="no-alert-rules">No alert rules configured.</p>
        ) : (
          <div className="space-y-3" data-testid="alert-rules-list">
            {alertRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md" data-testid={`alert-rule-item-${rule.id}`}>
                <div>
                  <p className="text-sm" data-testid={`alert-rule-type-${rule.id}`}>
                    {rule.type.replace(/_/g, ' ')} — {rule.chain}
                  </p>
                  {rule.threshold && (
                    <p className="text-xs text-gray-500" data-testid={`alert-rule-threshold-${rule.id}`}>
                      Threshold: {rule.threshold}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteAlertRule(rule.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                  data-testid={`delete-alert-rule-${rule.id}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
