import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio, Trade, CreateTradeDto, TradeType } from '../types';
import apiService, { Holding } from '../services/api';
import '../styles/PortfolioDetail.css';

const PortfolioDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [showHoldings, setShowHoldings] = useState(true);
  const [formData, setFormData] = useState<CreateTradeDto>({
    portfolioId: '',
    symbol: '',
    type: 'BUY',
    quantity: 0,
    price: 0,
    fee: 0,
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (id) {
      loadPortfolioData(id);
    }
  }, [id]);

  const loadPortfolioData = async (portfolioId: string) => {
    try {
      setLoading(true);
      const [portfolioData, tradesData] = await Promise.all([
        apiService.getPortfolio(portfolioId),
        apiService.getTrades(portfolioId),
      ]);
      setPortfolio(portfolioData);
      setTrades(tradesData);
      setFormData((prev) => ({ ...prev, portfolioId }));
      
      // Load holdings if there are trades
      if (tradesData.length > 0) {
        loadHoldings(portfolioId);
      }
    } catch (err: any) {
      setError('Failed to load portfolio data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadHoldings = async (portfolioId: string) => {
    try {
      const holdingsData = await apiService.getPortfolioHoldings(portfolioId);
      setHoldings(holdingsData);
    } catch (err: any) {
      console.error('Failed to load holdings:', err);
    }
  };

  const handleRefreshPrices = async () => {
    if (!id) return;
    
    try {
      setRefreshing(true);
      setError('');
      const updatedPortfolio = await apiService.refreshPortfolio(id);
      setPortfolio(updatedPortfolio);
      
      // Reload holdings with new prices
      await loadHoldings(id);
      
      // Success message
      setError('');
    } catch (err: any) {
      setError('Failed to refresh prices');
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      await apiService.createTrade(formData);
      setFormData({
        portfolioId: id!,
        symbol: '',
        type: 'BUY',
        quantity: 0,
        price: 0,
        fee: 0,
      });
      setShowTradeForm(false);
      await loadPortfolioData(id!);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create trade');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTrade = async (tradeId: number) => {
    if (!confirm('Are you sure you want to delete this trade?')) {
      return;
    }

    try {
      await apiService.deleteTrade(tradeId);
      await loadPortfolioData(id!);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete trade');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading...</div>
      </Layout>
    );
  }

  if (!portfolio) {
    return (
      <Layout>
        <div className="error-message">Portfolio not found</div>
      </Layout>
    );
  }

  const profitLossPercentage = portfolio.totalInvested > 0 
    ? (portfolio.profitLoss / portfolio.totalInvested) * 100 
    : 0;

  return (
    <Layout>
      <div className="portfolio-detail">
        <div className="page-header">
          <div>
            <button onClick={() => navigate('/portfolios')} className="btn btn-back">
              ← Back
            </button>
            <h1>{portfolio.name}</h1>
            {portfolio.description && <p className="description">{portfolio.description}</p>}
          </div>
          <div className="header-actions">
            <button
              onClick={handleRefreshPrices}
              className="btn btn-secondary"
              disabled={refreshing}
            >
              {refreshing ? '🔄 Refreshing...' : '🔄 Refresh Prices'}
            </button>
            <button
              onClick={() => setShowTradeForm(!showTradeForm)}
              className="btn btn-primary"
            >
              {showTradeForm ? 'Cancel' : '+ Add Trade'}
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Invested</h3>
            <p className="stat-value">${portfolio.totalInvested.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Current Value</h3>
            <p className="stat-value">${portfolio.currentValue.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Profit/Loss</h3>
            <p className={`stat-value ${portfolio.profitLoss >= 0 ? 'positive' : 'negative'}`}>
              ${portfolio.profitLoss.toFixed(2)}
              <span className="percentage">
                ({profitLossPercentage >= 0 ? '+' : ''}{profitLossPercentage.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>

        {showTradeForm && (
          <div className="trade-form-card">
            <h2>Add New Trade</h2>
            <form onSubmit={handleCreateTrade}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="symbol">Symbol *</label>
                  <input
                    type="text"
                    id="symbol"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    required
                    placeholder="BTC, ETH, etc."
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="type">Type *</label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as TradeType })}
                    required
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="quantity">Quantity *</label>
                  <input
                    type="number"
                    id="quantity"
                    step="0.00000001"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="price">Price *</label>
                  <input
                    type="number"
                    id="price"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fee">Fee</label>
                  <input
                    type="number"
                    id="fee"
                    step="0.01"
                    value={formData.fee}
                    onChange={(e) => setFormData({ ...formData, fee: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Adding...' : 'Add Trade'}
              </button>
            </form>
          </div>
        )}

        {holdings.length > 0 && (
          <div className="holdings-section">
            <div className="section-header">
              <h2>Current Holdings</h2>
              <button 
                onClick={() => setShowHoldings(!showHoldings)} 
                className="btn btn-small"
              >
                {showHoldings ? 'Hide' : 'Show'}
              </button>
            </div>
            {showHoldings && (
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
                      <th>P/L</th>
                      <th>P/L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((holding) => (
                      <tr key={holding.symbol}>
                        <td><strong>{holding.symbol}</strong></td>
                        <td>{holding.quantity.toFixed(8)}</td>
                        <td>${holding.averagePrice.toFixed(2)}</td>
                        <td className="current-price">${holding.currentPrice.toFixed(2)}</td>
                        <td>${holding.totalInvested.toFixed(2)}</td>
                        <td>${holding.currentValue.toFixed(2)}</td>
                        <td className={holding.profitLoss >= 0 ? 'positive' : 'negative'}>
                          ${holding.profitLoss.toFixed(2)}
                        </td>
                        <td className={holding.profitLossPercentage >= 0 ? 'positive' : 'negative'}>
                          {holding.profitLossPercentage >= 0 ? '+' : ''}{holding.profitLossPercentage.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="trades-section">
          <h2>Trade History</h2>
          {trades.length === 0 ? (
            <div className="empty-state">
              <p>No trades yet. Add your first trade to get started!</p>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id}>
                      <td>{new Date(trade.executedAt).toLocaleDateString()}</td>
                      <td><strong>{trade.symbol}</strong></td>
                      <td>
                        <span className={`badge ${trade.type === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
                          {trade.type}
                        </span>
                      </td>
                      <td>{trade.quantity}</td>
                      <td>${trade.price.toFixed(2)}</td>
                      <td>${trade.fee.toFixed(2)}</td>
                      <td>${trade.total.toFixed(2)}</td>
                      <td>
                        <button
                          onClick={() => handleDeleteTrade(trade.id)}
                          className="btn btn-danger btn-small"
                        >
                          Delete
                        </button>
                      </td>
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
