import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiService from '../services/api';
import { Portfolio, Trade, Holding } from '../types';
import '../styles/PortfolioDetail.css';

// Helper function to safely format numbers
const formatNumber = (value: number | null | undefined, decimals: number = 2): string => {
  return (value ?? 0).toFixed(decimals);
};

const PortfolioDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
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

      const [portfolioData, holdingsData, tradesData] = await Promise.all([
        apiService.getPortfolio(id!),
        apiService.getPortfolioHoldings(id!),
        apiService.getTrades(id!),
      ]);

      setPortfolio(portfolioData);
      setHoldings(holdingsData);
      setTrades(tradesData);
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
      
      setSuccessMessage(
        `✅ Import completed!\n` +
        `Trades: ${result.tradesImported}\n` +
        `Deposits: ${result.depositsImported}\n` +
        `Withdrawals: ${result.withdrawalsImported}`
      );

      setShowImportForm(false);
      setImportForm({ startDate: '' });
      
      // Refresh data
      await fetchPortfolioData();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to import trades';
      setError(errorMsg);
    } finally {
      setImporting(false);
    }
  };

  const handleRefreshPrices = async () => {
    try {
      setError(null);
      await apiService.refreshPortfolio(id!);
      await fetchPortfolioData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to refresh prices');
    }
  };

  if (loading) {
    return <div className="portfolio-detail">Loading...</div>;
  }

  if (error) {
    return <div className="portfolio-detail error">{error}</div>;
  }

  if (!portfolio) {
    return <div className="portfolio-detail">Portfolio not found</div>;
  }

  const profitLossPercentage = portfolio.totalInvested > 0
    ? ((portfolio.profitLoss / portfolio.totalInvested) * 100)
    : 0;

  return (
    <div className="portfolio-detail">
      <button onClick={() => navigate('/dashboard')} className="btn-back">
        ← Back to Dashboard
      </button>

      <div className="page-header">
        <div>
          <h1>{portfolio.name}</h1>
          {portfolio.description && <p>{portfolio.description}</p>}
        </div>
        <div className="header-actions">
          <button onClick={() => setShowImportForm(!showImportForm)} className="btn-success">
            📥 Import from Binance
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

      {showImportForm && (
        <div className="trade-form-card import-form">
          <h2>📥 Import Trades from Binance</h2>
          <p className="form-description">
            Import your trading history from Binance automatically
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
                <li>✅ Spot trades (BUY/SELL)</li>
                <li>✅ Crypto deposits</li>
                <li>✅ Crypto withdrawals</li>
                <li>⚠️ Rate limit: ~1200 requests/minute</li>
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
          <p className="stat-value">${formatNumber(portfolio.totalInvested)}</p>
        </div>
        <div className="stat-card">
          <h3>Current Value</h3>
          <p className="stat-value">${formatNumber(portfolio.currentValue)}</p>
        </div>
        <div className="stat-card">
          <h3>Profit/Loss</h3>
          <p className={`stat-value ${portfolio.profitLoss >= 0 ? 'positive' : 'negative'}`}>
            ${formatNumber(portfolio.profitLoss)}
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
                    <td>${formatNumber(holding.averagePrice)}</td>
                    <td className="current-price">${formatNumber(holding.currentPrice)}</td>
                    <td>${formatNumber(holding.totalInvested)}</td>
                    <td>${formatNumber(holding.currentValue)}</td>
                    <td className={holding.profitLoss >= 0 ? 'positive' : 'negative'}>
                      ${formatNumber(holding.profitLoss)}
                    </td>
                    <td className={holding.profitLossPercentage >= 0 ? 'positive' : 'negative'}>
                      {holding.profitLossPercentage >= 0 ? '+' : ''}{formatNumber(holding.profitLossPercentage)}%
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
                    <td>${formatNumber(trade.price)}</td>
                    <td>${formatNumber(trade.fee)}</td>
                    <td>${formatNumber(trade.total)}</td>
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
  );
};

export default PortfolioDetail;
