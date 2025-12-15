import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio } from '../types';
import apiService, { UserStats } from '../services/api';
import '../styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('Loading dashboard data...');
      
      const [portfoliosData, statsData] = await Promise.all([
        apiService.getPortfolios(),
        apiService.getUserStats()
      ]);
      
      console.log('Portfolios loaded:', portfoliosData);
      console.log('User stats loaded:', statsData);
      
      setPortfolios(portfoliosData || []);
      setUserStats(statsData);
    } catch (err: any) {
      console.error('Error loading dashboard:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load dashboard';
      setError(errorMessage);
      setPortfolios([]);
      setUserStats(null);
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
      // Reload stats after refresh
      const statsData = await apiService.getUserStats();
      setUserStats(statsData);
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

  console.log('Dashboard render - loading:', loading, 'error:', error, 'portfolios:', portfolios.length);

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
            <button onClick={loadDashboardData} style={{ marginLeft: '10px' }}>Retry</button>
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
          {/* Total Fees Card */}
          {userStats && userStats.totalFees > 0 && (
            <div className="stat-card">
              <h3>💵 Total Fees</h3>
              <p className="stat-value negative">
                ${userStats.totalFees.toFixed(2)}
                <span className="stat-subtitle">{userStats.tradesCount} trades</span>
              </p>
            </div>
          )}
        </div>

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
