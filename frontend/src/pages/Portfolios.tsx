import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio } from '../types';
import apiService from '../services/api';


const Portfolios: React.FC = () => {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    description: '',
    exchange: '' as '' | 'binance' | 'revolutx' | 'trading212'
  });
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadPortfolios();
  }, []);

  const loadPortfolios = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiService.getPortfolios();
      setPortfolios(data || []);
    } catch (err: any) {
      setError('Failed to load portfolios');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (portfolio?: Portfolio) => {
    if (portfolio) {
      setEditingPortfolio(portfolio);
      setFormData({ 
        name: portfolio.name, 
        description: portfolio.description || '',
        exchange: (portfolio.exchange || '') as '' | 'binance' | 'revolutx' | 'trading212'
      });
    } else {
      setEditingPortfolio(null);
      setFormData({ name: '', description: '', exchange: '' });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPortfolio(null);
    setFormData({ name: '', description: '', exchange: '' });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        ...(formData.exchange && { exchange: formData.exchange })
      };

      if (editingPortfolio) {
        await apiService.updatePortfolio(editingPortfolio.id, payload);
        setSuccessMessage('Portfolio updated!');
      } else {
        await apiService.createPortfolio(payload);
        setSuccessMessage('Portfolio created!');
      }
      handleCloseModal();
      await loadPortfolios();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save portfolio');
    }
  };

  const handleDelete = async (portfolio: Portfolio) => {
    if (!window.confirm(`Delete "${portfolio.name}"?`)) return;
    try {
      await apiService.deletePortfolio(portfolio.id);
      setSuccessMessage('Portfolio deleted!');
      await loadPortfolios();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError('Failed to delete portfolio');
    }
  };

  const getExchangeBadge = (exchange?: string | null) => {
    if (!exchange) return null;
    const badges: Record<string, { label: string; color: string }> = {
      binance: { label: 'Binance', color: '#F3BA2F' },
      revolutx: { label: 'Revolut X', color: '#6366F1' },
      trading212: { label: 'Trading212', color: '#00C9FF' }
    };
    const badge = badges[exchange];
    if (!badge) return null;
    return (
      <span 
        style={{ 
          backgroundColor: badge.color, 
          color: 'white', 
          padding: '2px 8px', 
          borderRadius: '4px', 
          fontSize: '12px',
          fontWeight: 'bold',
          marginLeft: '8px'
        }}
      >
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return <Layout><div className="loading">Loading...</div></Layout>;
  }

  return (
    <Layout>
      <div className="portfolios-page">
        <div className="page-header">
          <div>
            <h1>Manage Portfolios</h1>
            <p>Create, edit, and manage your portfolios</p>
          </div>
          <button onClick={() => handleOpenModal()} className="btn-primary">+ Create Portfolio</button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}

        {portfolios.length === 0 ? (
          <div className="empty-state">
            <h2>No Portfolios Yet</h2>
            <p>Create your first portfolio to start tracking.</p>
            <button onClick={() => handleOpenModal()} className="btn-primary">Create Portfolio</button>
          </div>
        ) : (
          <div className="portfolios-list">
            {portfolios.map((p) => (
              <div key={p.id} className="portfolio-item">
                <div className="portfolio-info">
                  <h3>
                    {p.name}
                    {getExchangeBadge(p.exchange)}
                  </h3>
                  {p.description && <p>{p.description}</p>}
                  <div className="portfolio-stats-small">
                    <span>Invested: ${(p.totalInvested || 0).toFixed(2)}</span>
                    <span>Value: ${(p.currentValue || 0).toFixed(2)}</span>
                    <span className={(p.profitLoss || 0) >= 0 ? 'positive' : 'negative'}>
                      P/L: ${(p.profitLoss || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="portfolio-actions">
                  <button onClick={() => navigate(`/portfolios/${p.id}`)} className="btn-secondary">View</button>
                  <button onClick={() => handleOpenModal(p)} className="btn-secondary">Edit</button>
                  <button onClick={() => handleDelete(p)} className="btn-danger">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={handleCloseModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingPortfolio ? 'Edit' : 'Create'} Portfolio</h2>
                <button onClick={handleCloseModal} className="modal-close">&times;</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Portfolio Name *</label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                    placeholder="e.g., My Trading212 Account" 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>
                    Exchange (optional)
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      Select if this portfolio is linked to a specific exchange
                    </span>
                  </label>
                  <select 
                    value={formData.exchange} 
                    onChange={(e) => setFormData({ ...formData, exchange: e.target.value as '' | 'binance' | 'revolutx' | 'trading212' })}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                  >
                    <option value="">None (Manual Portfolio)</option>
                    <option value="binance">Binance</option>
                    <option value="revolutx">Revolut X</option>
                    <option value="trading212">Trading212</option>
                  </select>
                  {formData.exchange === 'trading212' && (
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      📊 You'll be able to import CSV files and track your stocks/ETFs
                    </p>
                  )}
                  {formData.exchange === 'revolutx' && (
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      🚀 You'll be able to trade directly from the app
                    </p>
                  )}
                  {formData.exchange === 'binance' && (
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      📥 You'll be able to import trades and sync with Binance API
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    rows={3} 
                    placeholder="Optional description for this portfolio"
                  />
                </div>

                {error && <div className="error-message">{error}</div>}
                <div className="modal-actions">
                  <button type="submit" className="btn-primary">{editingPortfolio ? 'Update' : 'Create'}</button>
                  <button type="button" onClick={handleCloseModal} className="btn-secondary">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Portfolios;
