import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio } from '../types';
import apiService from '../services/api';
import '../styles/Dashboard.css';

const Dashboard: React.FC = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPortfolios();
  }, []);

  const loadPortfolios = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('Loading portfolios...');
      const data = await apiService.getPortfolios();
      console.log('Portfolios loaded:', data);
      setPortfolios(data || []);
    } catch (err: any) {
      console.error('Error loading portfolios:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load portfolios';
      setError(errorMessage);
      setPortfolios([]);
    } finally {
      setLoading(false);
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
          <Link to="/portfolios" className="btn btn-primary">Manage Portfolios</Link>
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
            <button onClick={loadPortfolios} style={{ marginLeft: '10px' }}>Retry</button>
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

        <div className="portfolios-section">
          <h2>Your Portfolios</h2>
          {portfolios.length === 0 ? (
            <div className="empty-state">
              <p>You don't have any portfolios yet.</p>
              <Link to="/portfolios" className="btn btn-primary">Create Your First Portfolio</Link>
            </div>
          ) : (
            <div className="portfolio-grid">
              {portfolios.map((portfolio) => (
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
                      <span className="value">${(portfolio.totalInvested || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="label">Value:</span>
                      <span className="value">${(portfolio.currentValue || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="label">P/L:</span>
                      <span className={`value ${(portfolio.profitLoss || 0) >= 0 ? 'positive' : 'negative'}`}>
                        ${(portfolio.profitLoss || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
