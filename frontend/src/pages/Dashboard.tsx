import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio } from '../types';
import apiService, { PortfolioStats } from '../services/api';


interface AggregatedStats {
  totalDeposits: number;
  totalWithdrawals: number;
  totalFees: number;
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
}

const Dashboard: React.FC = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiService.getPortfolios();
      setPortfolios(data || []);

      // Load stats for each portfolio and aggregate
      if (data && data.length > 0) {
        const statsPromises = data.map(p => apiService.getPortfolioStats(p.id));
        const allStats = await Promise.all(statsPromises);
        
        const aggregated = allStats.reduce(
          (acc, stat) => ({
            totalDeposits: acc.totalDeposits + stat.totalDeposits,
            totalWithdrawals: acc.totalWithdrawals + stat.totalWithdrawals,
            totalFees: acc.totalFees + stat.totalFees,
            totalTrades: acc.totalTrades + stat.totalTrades,
            buyTrades: acc.buyTrades + stat.buyTrades,
            sellTrades: acc.sellTrades + stat.sellTrades,
          }),
          { totalDeposits: 0, totalWithdrawals: 0, totalFees: 0, totalTrades: 0, buyTrades: 0, sellTrades: 0 }
        );
        setStats(aggregated);
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Failed to load dashboard data');
      setPortfolios([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAll = async () => {
    try {
      setRefreshing(true);
      setError('');
      const result = await apiService.refreshAllPortfolios();
      setPortfolios(result.portfolios);
    } catch (err: any) {
      console.error('Error refreshing portfolios:', err);
      setError('Failed to refresh prices');
    } finally {
      setRefreshing(false);
    }
  };

  const calculateTotals = () => {
    return portfolios.reduce(
      (acc, portfolio) => ({
        totalInvested: acc.totalInvested + (portfolio.totalInvested || 0),
        currentValue: acc.currentValue + (portfolio.currentValue || 0),
        profitLoss: acc.profitLoss + (portfolio.profitLoss || 0),
      }),
      { totalInvested: 0, currentValue: 0, profitLoss: 0 }
    );
  };

  const totals = calculateTotals();
  const profitLossPercentage = totals.totalInvested > 0
    ? ((totals.profitLoss / totals.totalInvested) * 100).toFixed(2)
    : '0.00';

  // For now, link to first portfolio's transfers page
  const firstPortfolioId = portfolios.length > 0 ? portfolios[0].id : '';

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading dashboard...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
          <div className="header-actions">
            <button 
              onClick={handleRefreshAll} 
              className="btn btn-secondary"
              disabled={refreshing || portfolios.length === 0}
            >
              {refreshing ? '🔄 Refreshing...' : '🔄 Refresh All Prices'}
            </button>
            <Link to="/portfolios" className="btn btn-primary">Manage Portfolios</Link>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
            <button onClick={loadData} style={{ marginLeft: '10px' }}>Retry</button>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Invested</h3>
            <p className="stat-value">${totals.totalInvested.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Current Value</h3>
            <p className="stat-value">${totals.currentValue.toFixed(2)}</p>
          </div>
          <div className="stat-card">
            <h3>Profit/Loss</h3>
            <p className={`stat-value ${totals.profitLoss >= 0 ? 'positive' : 'negative'}`}>
              ${totals.profitLoss.toFixed(2)}
              <span className="percentage"> ({profitLossPercentage}%)</span>
            </p>
          </div>
          <div className="stat-card">
            <h3>Portfolios</h3>
            <p className="stat-value">{portfolios.length}</p>
          </div>
        </div>

        {stats && firstPortfolioId && (
          <div className="stats-grid secondary">
            <div className="stat-card">
              <h3>💰 Total Fees</h3>
              <p className="stat-value">${stats.totalFees.toFixed(2)}</p>
            </div>
            <Link to={`/portfolios/${firstPortfolioId}/transfers`} className="stat-card clickable">
              <h3>📥 Deposits</h3>
              <p className="stat-value">{stats.totalDeposits.toFixed(4)}</p>
              <span className="stat-hint">crypto units → View details</span>
            </Link>
            <Link to={`/portfolios/${firstPortfolioId}/transfers`} className="stat-card clickable">
              <h3>📤 Withdrawals</h3>
              <p className="stat-value">{stats.totalWithdrawals.toFixed(4)}</p>
              <span className="stat-hint">crypto units → View details</span>
            </Link>
            <div className="stat-card">
              <h3>📊 Trades</h3>
              <p className="stat-value">{stats.totalTrades}</p>
              <span className="stat-hint">{stats.buyTrades} buy / {stats.sellTrades} sell</span>
            </div>
          </div>
        )}

        <div className="portfolios-section">
          <h2>Your Portfolios</h2>
          {portfolios.length === 0 ? (
            <div className="empty-state">
              <p>You don't have any portfolios yet.</p>
              <Link to="/portfolios" className="btn btn-primary">Create Your First Portfolio</Link>
            </div>
          ) : (
            <div className="portfolio-grid">
              {portfolios.map((portfolio) => {
                const portfolioPL = portfolio.profitLoss || 0;
                const portfolioInvested = portfolio.totalInvested || 0;
                const portfolioPLPercent = portfolioInvested > 0 
                  ? ((portfolioPL / portfolioInvested) * 100).toFixed(2)
                  : '0.00';

                return (
                  <Link
                    key={portfolio.id}
                    to={`/portfolios/${portfolio.id}`}
                    className="portfolio-card"
                  >
                    <h3>{portfolio.name}</h3>
                    {portfolio.description && <p className="description">{portfolio.description}</p>}
                    <div className="portfolio-stats">
                      <div>
                        <span className="label">Invested:</span>
                        <span className="value">${portfolioInvested.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="label">Value:</span>
                        <span className="value">${(portfolio.currentValue || 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="label">P/L:</span>
                        <span className={`value ${portfolioPL >= 0 ? 'positive' : 'negative'}`}>
                          ${portfolioPL.toFixed(2)}
                          <span className="percentage-small"> ({portfolioPLPercent}%)</span>
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
