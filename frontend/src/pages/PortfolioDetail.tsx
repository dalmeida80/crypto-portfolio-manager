import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import apiService, { BalanceResponse, SimpleHolding, Trading212Holding, Trading212Totals } from '../services/api';
import { Portfolio, Trade, Holding } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

// Color palette for pie chart
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658', '#ff7c7c'];

// Helper function to safely format numbers
const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
  const num = value ?? 0;
  return typeof num === 'number' ? num.toFixed(decimals) : '0.00';
};

// Smart price formatting based on value magnitude
const formatPrice = (value: number | null | undefined): string => {
  const num = value ?? 0;
  if (typeof num !== 'number' || isNaN(num)) return '0.00';
  
  if (num < 0.01) {
    return num.toFixed(8);
  }
  if (num < 1) {
    return num.toFixed(4);
  }
  return num.toFixed(2);
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, currencySymbol }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-medium)',
        borderRadius: '8px',
        padding: '12px',
        color: 'var(--text-primary)'
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
          {payload[0].name}
        </p>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
          {currencySymbol}{formatNumber(payload[0].value)}
        </p>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          {payload[0].payload.percentage}%
        </p>
      </div>
    );
  }
  return null;
};

interface Trading212Summary {
  totalDeposits: number;
  totalWithdrawals: number;
  netDeposits: number;
  interestOnCash: number;
  cashback: number;
  cardDebits: number;
  currentBalance: number;
  transactionsCount: number;
}

interface Trading212Transaction {
  id: string;
  action: string;
  time: string;
  ticker?: string;
  name?: string;
  shares?: number;
  pricePerShare?: number;
  totalAmount?: number;
  totalCurrency?: string;
  notes?: string;
}

const PortfolioDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [simpleBalances, setSimpleBalances] = useState<BalanceResponse | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [trading212Summary, setTrading212Summary] = useState<Trading212Summary | null>(null);
  const [trading212Transactions, setTrading212Transactions] = useState<Trading212Transaction[]>([]);
  const [trading212Holdings, setTrading212Holdings] = useState<Trading212Holding[]>([]);
  const [trading212Totals, setTrading212Totals] = useState<Trading212Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tradeForm, setTradeForm] = useState({
    symbol: '',
    type: 'BUY' as 'BUY' | 'SELL',
    quantity: '',
    price: '',
    fee: '0',
    executedAt: new Date().toISOString().slice(0, 16),
    notes: '',
  });
  const [importForm, setImportForm] = useState({
    startDate: '',
  });
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isSimpleBalanceView = portfolio?.exchange === 'revolutx';
  const isTrading212 = portfolio?.exchange === 'trading212';

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    fetchPortfolioData();
  }, [id, isAuthenticated, navigate]);

  const fetchPortfolioData = async () => {
    try {
      setLoading(true);
      setError(null);

      const portfolioData = await apiService.getPortfolio(id!);
      setPortfolio(portfolioData);

      if (portfolioData.exchange === 'revolutx') {
        const balancesData = await apiService.getPortfolioBalances(id!);
        setSimpleBalances(balancesData);
      } else if (portfolioData.exchange === 'trading212') {
        const [summaryData, transactionsData, holdingsData, totalsData] = await Promise.all([
          apiService.getTrading212Summary(id!),
          apiService.getTrading212Transactions(id!, 50, 0),
          apiService.getTrading212Holdings(id!),
          apiService.getTrading212Totals(id!)
        ]);
        setTrading212Summary(summaryData);
        setTrading212Transactions(transactionsData.transactions);
        setTrading212Holdings(holdingsData);
        setTrading212Totals(totalsData);
      } else {
        const [holdingsData, tradesData] = await Promise.all([
          apiService.getPortfolioHoldings(id!),
          apiService.getAllTrades(id!),
        ]);
        setHoldings(holdingsData);
        setTrades(tradesData);
      }
    } catch (err: any) {
      console.error('Error fetching portfolio:', err);
      setError(err.response?.data?.message || 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  const handleTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createTrade({portfolioId: id!,
        ...tradeForm,
        quantity: parseFloat(tradeForm.quantity),
        price: parseFloat(tradeForm.price),
        fee: parseFloat(tradeForm.fee),
      });

      setShowTradeForm(false);
      setTradeForm({
        symbol: '',
        type: 'BUY',
        quantity: '',
        price: '',
        fee: '0',
        executedAt: new Date().toISOString().slice(0, 16),
        notes: '',
      });

      await fetchPortfolioData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create trade');
    }
  };

  const handleImportTrades = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await apiService.importAllTrades(id!, importForm.startDate || undefined);
      
      const depositsInfo = result.depositsImported ? `Deposits found: ${result.depositsImported} (informational)\n` : '';
      const withdrawalsInfo = result.withdrawalsImported ? `Withdrawals found: ${result.withdrawalsImported} (informational)` : '';
      
      setSuccessMessage(
        `✅ Import completed!\n` +
        `Trades imported: ${result.imported}\n` +
        depositsInfo +
        withdrawalsInfo
      );

      setShowImportForm(false);
      setImportForm({ startDate: '' });
      
      await fetchPortfolioData();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to import trades';
      setError(errorMsg);
    } finally {
      setImporting(false);
    }
  };

  const handleSyncHoldings = async () => {
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await apiService.syncBinanceHoldings(id!);
      setSuccessMessage(
        `✅ Holdings synced!\n` +
        `Synced ${result.synced} assets from Binance (Spot + Earn + Savings)\n` +
        `Assets: ${result.assets.join(', ')}`
      );
      
      // Auto-refresh prices after sync
      await apiService.refreshPortfolio(id!);
      await fetchPortfolioData();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to sync holdings';
      setError(errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  const handleTrading212Import = async (file: File) => {
    setImporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await apiService.importTrading212CSV(id!, file);
      setSuccessMessage(
        `✅ Import successful!\n` +
        `Imported: ${result.imported}\n` +
        `Updated: ${result.updated}\n` +
        `Duplicates: ${result.duplicates}`
      );
      await fetchPortfolioData();
    } catch (err: any) {
      const errorMsg = err.message || 'Import failed. Please check the CSV format.';
      setError(errorMsg);
    } finally {
      setImporting(false);
    }
  };

  const handleRefreshPrices = async () => {
    try {
      setError(null);
      setSuccessMessage(null);
      
      if (isSimpleBalanceView || isTrading212) {
        await fetchPortfolioData();
      } else {
        await apiService.refreshPortfolio(id!);
        await fetchPortfolioData();
      }
      
      setSuccessMessage('✅ Prices refreshed successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to refresh prices');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-PT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('Deposit')) return 'positive';
    if (action.includes('Withdrawal') || action.includes('Card debit')) return 'negative';
    if (action.includes('Interest') || action.includes('cashback')) return 'info';
    if (action.includes('buy')) return 'positive';
    if (action.includes('sell')) return 'negative';
    return '';
  };

  if (loading) {
    return (
      <Layout>
        <div className="portfolio-detail">
          <div className="loading">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="portfolio-detail error">{error}</div>
      </Layout>
    );
  }

  if (!portfolio) {
    return (
      <Layout>
        <div className="portfolio-detail">Portfolio not found</div>
      </Layout>
    );
  }

  const currencySymbol = portfolio.exchange === 'revolutx' || portfolio.exchange === 'trading212' ? '€' : '€';

  // TRADING212 VIEW
  if (isTrading212 && trading212Summary && trading212Totals) {
    return (
      <Layout>
        <div className="portfolio-detail">
          <div className="page-header">
            <div>
              <h1>{portfolio.name}</h1>
              {portfolio.description && <p>{portfolio.description}</p>}
              <span className="badge-info">Trading212 Account</span>
            </div>
            <div className="header-actions">
              <label className="btn-primary" style={{ cursor: 'pointer' }}>
                📥 Import CSV
                <input
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && handleTrading212Import(e.target.files[0])}
                  disabled={importing}
                />
              </label>
              <button onClick={handleRefreshPrices} className="btn-secondary">
                🔄 Refresh Prices
              </button>
            </div>
          </div>

          {successMessage && (
            <div className="success-message">{successMessage}</div>
          )}

          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="holdings-section">
            <div className="section-header">
              <h2>Current Holdings</h2>
            </div>

            {trading212Holdings.length === 0 ? (
              <div className="holdings-table">
                <p style={{ padding: '20px', textAlign: 'center' }}>No holdings yet</p>
              </div>
            ) : (
              <div className="holdings-table">
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Shares</th>
                      <th>Avg Buy Price</th>
                      <th>Current Price</th>
                      <th>Invested</th>
                      <th>Current Value</th>
                      <th>Profit/Loss</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trading212Holdings.map((holding) => (
                      <tr key={holding.ticker}>
                        <td>
                          <strong>{holding.ticker}</strong>
                          <br />
                          <small style={{ color: 'var(--text-secondary)' }}>{holding.name}</small>
                        </td>
                        <td>{formatNumber(holding.shares, 4)}</td>
                        <td>{currencySymbol}{formatPrice(holding.averageBuyPrice)}</td>
                        <td className="current-price">
                          {holding.currentPrice ? currencySymbol + formatPrice(holding.currentPrice) : '-'}
                        </td>
                        <td>{currencySymbol}{formatNumber(holding.totalInvested)}</td>
                        <td>
                          {holding.currentValue ? (
                            <strong>{currencySymbol}{formatNumber(holding.currentValue)}</strong>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className={(holding.profitLoss ?? 0) >= 0 ? 'positive' : 'negative'}>
                          {holding.profitLoss !== undefined ? currencySymbol + formatNumber(holding.profitLoss) : '-'}
                        </td>
                        <td className={(holding.profitLossPercentage ?? 0) >= 0 ? 'positive' : 'negative'}>
                          {holding.profitLossPercentage !== undefined 
                            ? `${holding.profitLossPercentage >= 0 ? '+' : ''}${formatNumber(holding.profitLossPercentage)}%` 
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Cash Summary</h2>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card">
              <h3>Cash Balance</h3>
              <p className="stat-value">{currencySymbol}{formatNumber(trading212Summary.currentBalance)}</p>
              <p className="stat-hint">Available cash</p>
            </div>
            <div className="stat-card">
              <h3>Net Deposits</h3>
              <p className="stat-value">{currencySymbol}{formatNumber(trading212Summary.netDeposits)}</p>
              <p className="stat-hint">Total deposits - withdrawals</p>
            </div>
            <div className="stat-card">
              <h3>Interest + Cashback</h3>
              <p className="stat-value positive">
                {currencySymbol}{formatNumber(trading212Summary.interestOnCash + trading212Summary.cashback)}
              </p>
              <p className="stat-hint">Earnings from interest and cashback</p>
            </div>
          </div>

          <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Holdings Performance</h2>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card">
              <h3>Total Invested</h3>
              <p className="stat-value">{currencySymbol}{formatNumber(trading212Totals.totalInvested)}</p>
              <p className="stat-hint">{trading212Totals.holdingsCount} positions</p>
            </div>
            <div className="stat-card">
              <h3>Current Value</h3>
              <p className="stat-value">{currencySymbol}{formatNumber(trading212Totals.totalCurrentValue)}</p>
              <p className="stat-hint">{trading212Totals.holdingsWithPrices} with live prices</p>
            </div>
            <div className="stat-card">
              <h3>Profit/Loss</h3>
              <p className={`stat-value ${trading212Totals.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                {currencySymbol}{formatNumber(trading212Totals.profitLoss)}
                <span className="percentage">
                  ({trading212Totals.profitLossPercentage >= 0 ? '+' : ''}{formatNumber(trading212Totals.profitLossPercentage)}%)
                </span>
              </p>
            </div>
          </div>

          <div className="trades-section">
            <h2>Recent Transactions</h2>
            {trading212Transactions.length === 0 ? (
              <div className="trades-table">
                <p style={{ padding: '20px', textAlign: 'center' }}>No transactions yet. Import your Trading212 CSV to get started.</p>
              </div>
            ) : (
              <div className="trades-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Asset</th>
                      <th>Shares</th>
                      <th>Price</th>
                      <th>Total</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trading212Transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{formatDate(tx.time)}</td>
                        <td className={getActionColor(tx.action)}>
                          <strong>{tx.action}</strong>
                        </td>
                        <td>
                          {tx.ticker ? (
                            <div>
                              <strong>{tx.ticker}</strong>
                              <br />
                              <small style={{ color: 'var(--text-secondary)' }}>{tx.name}</small>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{tx.shares ? tx.shares.toFixed(4) : '-'}</td>
                        <td>{tx.pricePerShare ? currencySymbol + formatNumber(tx.pricePerShare) : '-'}</td>
                        <td><strong>{currencySymbol}{formatNumber(tx.totalAmount)}</strong></td>
                        <td><small>{tx.notes || '-'}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // SIMPLE BALANCE VIEW (for Revolut X)
  if (isSimpleBalanceView && simpleBalances) {
    const chartData = simpleBalances.holdings.map((holding, index) => ({
      name: holding.asset,
      value: holding.currentValue,
      percentage: ((holding.currentValue / simpleBalances.totalValue) * 100).toFixed(2)
    }));

    return (
      <Layout>
        <div className="portfolio-detail">
          <div className="page-header">
            <div>
              <h1>{portfolio.name}</h1>
              {portfolio.description && <p>{portfolio.description}</p>}
              <span className="badge-info">Simple Balance View (No P/L Tracking)</span>
            </div>
            <div className="header-actions">
              <button 
                onClick={() => navigate(`/portfolios/${id}/trade`)} 
                className="btn-primary"
                style={{ marginRight: '10px' }}
              >
                🚀 Trade
              </button>
              <button onClick={handleRefreshPrices} className="btn-secondary">
                🔄 Refresh Balances
              </button>
            </div>
          </div>

          {successMessage && (
            <div className="success-message">{successMessage}</div>
          )}

          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Value</h3>
              <p className="stat-value">{currencySymbol}{formatNumber(simpleBalances.totalValue)}</p>
              <p className="stat-hint">Live balance from exchange</p>
            </div>
            <div className="stat-card">
              <h3>Assets</h3>
              <p className="stat-value">{simpleBalances.holdings.length}</p>
              <p className="stat-hint">Different cryptocurrencies</p>
            </div>
            <div className="stat-card">
              <h3>Last Updated</h3>
              <p className="stat-value">
                {new Date(simpleBalances.updatedAt).toLocaleTimeString()}
              </p>
              <p className="stat-hint">{new Date(simpleBalances.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="chart-section" style={{ 
            marginBottom: '2rem', 
            background: 'var(--bg-card)', 
            padding: '2rem', 
            borderRadius: '12px', 
            border: '1px solid var(--border-light)'
          }}>
            <h2 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Portfolio Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name} (${entry.percentage}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} />} />
                <Legend 
                  wrapperStyle={{ color: 'var(--text-primary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="holdings-section">
            <div className="section-header">
              <h2>Current Holdings</h2>
            </div>

            {simpleBalances.holdings.length === 0 ? (
              <div className="holdings-table">
                <p style={{ padding: '20px', textAlign: 'center' }}>No holdings</p>
              </div>
            ) : (
              <div className="holdings-table">
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Quantity</th>
                      <th>Current Price</th>
                      <th>Current Value</th>
                      <th>% of Portfolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simpleBalances.holdings.map((holding: SimpleHolding) => {
                      const percentage = (holding.currentValue / simpleBalances.totalValue) * 100;
                      return (
                        <tr key={holding.symbol}>
                          <td><strong>{holding.asset}</strong></td>
                          <td>{formatNumber(holding.quantity, 8)}</td>
                          <td>{currencySymbol}{formatPrice(holding.currentPrice)}</td>
                          <td><strong>{currencySymbol}{formatNumber(holding.currentValue)}</strong></td>
                          <td>{formatNumber(percentage)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // FULL VIEW (Binance and other portfolios) - SEMPRE MOSTRA SYNC HOLDINGS
  const profitLoss = portfolio.profitLoss ?? 0;
  const totalInvested = portfolio.totalInvested ?? 0;
  const profitLossPercentage = totalInvested > 0
    ? ((profitLoss / totalInvested) * 100)
    : 0;

  return (
    <Layout>
      <div className="portfolio-detail">
        <div className="page-header">
          <div>
            <h1>{portfolio.name}</h1>
            {portfolio.description && <p>{portfolio.description}</p>}
          </div>
          <div className="header-actions">
            <button 
              onClick={handleSyncHoldings} 
              className="btn-info"
              disabled={syncing}
            >
              {syncing ? '⏳ Syncing...' : '🔄 Sync Holdings'}
            </button>
            <button onClick={() => setShowImportForm(!showImportForm)} className="btn-success">
              📥 Import Trades
            </button>
            <button onClick={handleRefreshPrices} className="btn-secondary">
              🔄 Refresh Prices
            </button>
            <button onClick={() => setShowTradeForm(!showTradeForm)} className="btn-primary">
              + Add Trade
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}

        {error && (
          <div className="error-message">{error}</div>
        )}

        {showImportForm && (
          <div className="trade-form-card import-form">
            <h2>📥 Import Trades from Exchange</h2>
            <p className="form-description">
              Import your trading history from all connected exchanges (Binance, Revolut X, etc.)
            </p>

            <form onSubmit={handleImportTrades}>
              <div className="form-row">
                <div className="form-group">
                  <label>
                    Start Date (optional)
                    <span className="hint">Leave empty to import all trades</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={importForm.startDate}
                    onChange={(e) => setImportForm({ ...importForm, startDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="import-info">
                <h3>ℹ️ What will be imported:</h3>
                <ul>
                  <li>✅ Spot trades (BUY/SELL) from all active API keys</li>
                  <li>📊 Deposits detected (Binance only, informational)</li>
                  <li>📊 Withdrawals detected (Binance only, informational)</li>
                  <li>⚠️ Rate limit: ~1200 requests/minute (Binance)</li>
                </ul>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-success" disabled={importing}>
                  {importing ? '⏳ Importing...' : '🚀 Start Import'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowImportForm(false)}
                  disabled={importing}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {showTradeForm && (
          <div className="trade-form-card">
            <h2>Add New Trade</h2>
            <form onSubmit={handleTradeSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Symbol</label>
                  <input
                    type="text"
                    value={tradeForm.symbol}
                    onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value.toUpperCase() })}
                    placeholder="BTCUSDT"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={tradeForm.type}
                    onChange={(e) => setTradeForm({ ...tradeForm, type: e.target.value as 'BUY' | 'SELL' })}
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={tradeForm.quantity}
                    onChange={(e) => setTradeForm({ ...tradeForm, quantity: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Price</label>
                  <input
                    type="number"
                    step="any"
                    value={tradeForm.price}
                    onChange={(e) => setTradeForm({ ...tradeForm, price: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Fee</label>
                  <input
                    type="number"
                    step="any"
                    value={tradeForm.fee}
                    onChange={(e) => setTradeForm({ ...tradeForm, fee: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Executed At</label>
                  <input
                    type="datetime-local"
                    value={tradeForm.executedAt}
                    onChange={(e) => setTradeForm({ ...tradeForm, executedAt: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  value={tradeForm.notes}
                  onChange={(e) => setTradeForm({ ...tradeForm, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary">Create Trade</button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowTradeForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Invested</h3>
            <p className="stat-value">{currencySymbol}{formatNumber(portfolio.totalInvested)}</p>
          </div>
          <div className="stat-card">
            <h3>Current Value</h3>
            <p className="stat-value">{currencySymbol}{formatNumber(portfolio.currentValue)}</p>
          </div>
          <div className="stat-card">
            <h3>Profit/Loss</h3>
            <p className={`stat-value ${profitLoss >= 0 ? 'positive' : 'negative'}`}>
              {currencySymbol}{formatNumber(profitLoss)}
              <span className="percentage">
                ({profitLossPercentage >= 0 ? '+' : ''}{formatNumber(profitLossPercentage)}%)
              </span>
            </p>
          </div>
        </div>

        <div className="holdings-section">
          <div className="section-header">
            <h2>Holdings</h2>
          </div>

          {holdings.length === 0 ? (
            <div className="holdings-table">
              <p style={{ padding: '20px', textAlign: 'center' }}>No holdings yet</p>
            </div>
          ) : (
            <div className="holdings-table">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Quantity</th>
                    <th>Avg Price</th>
                    <th>Current Price</th>
                    <th>Invested</th>
                    <th>Current Value</th>
                    <th>Profit/Loss</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.symbol}>
                      <td><strong>{holding.symbol}</strong></td>
                      <td>{formatNumber(holding.quantity, 8)}</td>
                      <td>{currencySymbol}{formatPrice(holding.averagePrice)}</td>
                      <td className="current-price">{currencySymbol}{formatPrice(holding.currentPrice)}</td>
                      <td>{currencySymbol}{formatNumber(holding.totalInvested)}</td>
                      <td>{currencySymbol}{formatNumber(holding.currentValue)}</td>
                      <td className={(holding.profitLoss ?? 0) >= 0 ? 'positive' : 'negative'}>
                        {currencySymbol}{formatNumber(holding.profitLoss)}
                      </td>
                      <td className={(holding.profitLossPercentage ?? 0) >= 0 ? 'positive' : 'negative'}>
                        {(holding.profitLossPercentage ?? 0) >= 0 ? '+' : ''}{formatNumber(holding.profitLossPercentage)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="trades-section">
          <h2>Trade History</h2>

          {trades.length === 0 ? (
            <div className="trades-table">
              <p style={{ padding: '20px', textAlign: 'center' }}>No trades yet</p>
            </div>
          ) : (
            <div className="trades-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Fee</th>
                    <th>Total</th>
                    <th>Source</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id}>
                      <td>{new Date(trade.executedAt).toLocaleString()}</td>
                      <td><strong>{trade.symbol}</strong></td>
                      <td className={trade.type === 'BUY' ? 'positive' : 'negative'}>
                        {trade.type}
                      </td>
                      <td>{formatNumber(trade.quantity, 8)}</td>
                      <td>{currencySymbol}{formatPrice(trade.price)}</td>
                      <td>{currencySymbol}{formatNumber(trade.fee, 4)}</td>
                      <td>{currencySymbol}{formatNumber(trade.total)}</td>
                      <td>
                        {trade.source && (
                          <span className="badge-info">{trade.source}</span>
                        )}
                      </td>
                      <td>{trade.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default PortfolioDetail;
