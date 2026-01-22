import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio } from '../types';
import apiService, { BalanceResponse, Trading212Totals } from '../services/api';
import '../styles/modern-dashboard.css';

interface PortfolioWithBalance extends Portfolio {
  balanceData?: BalanceResponse;
  trading212Totals?: Trading212Totals;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<PortfolioWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiService.getPortfolios();
      
      const portfoliosWithBalances = await Promise.all(
        (data || []).map(async (portfolio) => {
          if (portfolio.exchange === 'revolutx') {
            try {
              const balanceData = await apiService.getPortfolioBalances(portfolio.id);
              return {
                ...portfolio,
                balanceData,
                currentValue: balanceData.totalValue,
                totalInvested: 0,
                profitLoss: 0
              };
            } catch (err) {
              console.error(`Failed to load balance for ${portfolio.name}:`, err);
              return portfolio;
            }
          } else if (portfolio.exchange === 'trading212') {
            try {
              const trading212Totals = await apiService.getTrading212Totals(portfolio.id);
              return {
                ...portfolio,
                trading212Totals,
                currentValue: trading212Totals.totalCurrentValue,
                totalInvested: trading212Totals.totalInvested,
                profitLoss: trading212Totals.profitLoss
              };
            } catch (err) {
              console.error(`Failed to load Trading212 totals for ${portfolio.name}:`, err);
              return portfolio;
            }
          }
          return portfolio;
        })
      );
      
      setPortfolios(portfoliosWithBalances);
    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Failed to load portfolios');
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

  const hasEurPortfolio = portfolios.some(p => p.exchange === 'revolutx' || p.exchange === 'trading212');
  const currencySymbol = hasEurPortfolio ? '€' : '$';

  if (loading) {
    return (
      <Layout>
        <div className="modern-dashboard">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading your portfolios...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="modern-dashboard">
        {/* Hero Section */}
        <div className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">
              <span className="gradient-text">Your Personal</span>
              <br />
              Portfolio
            </h1>
            <p className="hero-subtitle">
              Track, manage, and trade your digital assets in one place
            </p>
          </div>
          
          {/* Total Value Card */}
          <div className="glass-card total-value-card">
            <div className="card-label">Total Portfolio Value</div>
            <div className="total-value">
              {currencySymbol}{totals.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {totals.profitLoss !== 0 && (
              <div className={`profit-loss ${totals.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                <span className="pl-amount">
                  {totals.profitLoss >= 0 ? '+' : ''}{currencySymbol}{Math.abs(totals.profitLoss).toFixed(2)}
                </span>
                <span className="pl-percentage">
                  ({profitLossPercentage}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="error-banner glass-card">
            <span>⚠️ {error}</span>
            <button onClick={loadData} className="retry-btn">Retry</button>
          </div>
        )}

        {/* Portfolios Grid */}
        <div className="portfolios-section">
          <h2 className="section-title">Your Portfolios</h2>
          
          {portfolios.length === 0 ? (
            <div className="empty-state glass-card">
              <div className="empty-icon">📊</div>
              <h3>No Portfolios Yet</h3>
              <p>Create your first portfolio to start tracking your investments</p>
              <button onClick={() => navigate('/portfolios')} className="create-btn">
                <span>+</span> Create Portfolio
              </button>
            </div>
          ) : (
            <div className="portfolios-grid">
              {portfolios.map((portfolio) => {
                const isSimpleView = portfolio.exchange === 'revolutx';
                const isTrading212 = portfolio.exchange === 'trading212';
                const portfolioCurrency = (isSimpleView || isTrading212) ? '€' : '$';
                const portfolioPL = portfolio.profitLoss || 0;
                const portfolioInvested = portfolio.totalInvested || 0;
                const portfolioPLPercent = portfolioInvested > 0 
                  ? ((portfolioPL / portfolioInvested) * 100).toFixed(2)
                  : '0.00';

                let exchangeLabel = '🌐 ' + portfolio.exchange;
                if (portfolio.exchange === 'revolutx') exchangeLabel = '🇪🇺 Revolut X';
                if (portfolio.exchange === 'trading212') exchangeLabel = '📈 Trading212';

                return (
                  <div key={portfolio.id} className="portfolio-card glass-card">
                    {/* Card Header */}
                    <div className="card-header">
                      <div className="portfolio-info">
                        <h3 className="portfolio-name">{portfolio.name}</h3>
                        {portfolio.description && (
                          <p className="portfolio-description">{portfolio.description}</p>
                        )}
                        <div className="exchange-badge">
                          {exchangeLabel}
                        </div>
                      </div>
                    </div>

                    {/* Card Stats */}
                    <div className="card-stats">
                      <div className="stat-item">
                        <div className="stat-label">Current Value</div>
                        <div className="stat-value main">
                          {portfolioCurrency}{(portfolio.currentValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      {!isSimpleView && portfolioInvested > 0 && (
                        <div className="stat-item">
                          <div className="stat-label">Profit/Loss</div>
                          <div className={`stat-value ${portfolioPL >= 0 ? 'positive' : 'negative'}`}>
                            {portfolioPL >= 0 ? '+' : ''}{portfolioCurrency}{Math.abs(portfolioPL).toFixed(2)}
                            <span className="stat-percent"> ({portfolioPLPercent}%)</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Actions - Same for all portfolios */}
                    <div className="card-actions">
                      <button 
                        onClick={() => navigate(`/portfolios/${portfolio.id}`)} 
                        className="view-btn"
                      >
                        View Details →
                      </button>
                    </div>
                  </div>
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
