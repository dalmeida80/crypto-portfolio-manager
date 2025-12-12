import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio, CreatePortfolioDto } from '../types';
import apiService from '../services/api';
import '../styles/Portfolios.css';

const Portfolios: React.FC = () => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState<CreatePortfolioDto>({
    name: '',
    description: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadPortfolios();
  }, []);

  const loadPortfolios = async () => {
    try {
      setLoading(true);
      const data = await apiService.getPortfolios();
      setPortfolios(data);
    } catch (err: any) {
      setError('Failed to load portfolios');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      await apiService.createPortfolio(formData);
      setFormData({ name: '', description: '' });
      setShowCreateForm(false);
      await loadPortfolios();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create portfolio');
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    if (!confirm('Are you sure you want to delete this portfolio?')) {
      return;
    }

    try {
      await apiService.deletePortfolio(id);
      await loadPortfolios();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete portfolio');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="portfolios-page">
        <div className="page-header">
          <h1>My Portfolios</h1>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="btn btn-primary"
          >
            {showCreateForm ? 'Cancel' : 'Create Portfolio'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {showCreateForm && (
          <div className="create-form-card">
            <h2>Create New Portfolio</h2>
            <form onSubmit={handleCreatePortfolio}>
              <div className="form-group">
                <label htmlFor="name">Portfolio Name *</label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Main Portfolio"
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create Portfolio'}
              </button>
            </form>
          </div>
        )}

        <div className="portfolios-list">
          {portfolios.length === 0 ? (
            <div className="empty-state">
              <p>No portfolios found. Create your first portfolio to get started!</p>
            </div>
          ) : (
            <div className="portfolio-grid">
              {portfolios.map((portfolio) => (
                <div key={portfolio.id} className="portfolio-card">
                  <div className="portfolio-card-header">
                    <h3>{portfolio.name}</h3>
                    <button
                      onClick={() => handleDeletePortfolio(portfolio.id)}
                      className="btn btn-danger btn-small"
                    >
                      Delete
                    </button>
                  </div>
                  {portfolio.description && (
                    <p className="description">{portfolio.description}</p>
                  )}
                  <div className="portfolio-stats">
                    <div className="stat">
                      <span className="label">Total Invested</span>
                      <span className="value">${portfolio.totalInvested.toFixed(2)}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Current Value</span>
                      <span className="value">${portfolio.currentValue.toFixed(2)}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Profit/Loss</span>
                      <span className={`value ${portfolio.profitLoss >= 0 ? 'positive' : 'negative'}`}>
                        ${portfolio.profitLoss.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Link to={`/portfolios/${portfolio.id}`} className="btn btn-secondary btn-block">
                    View Details
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Portfolios;
