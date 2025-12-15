import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Portfolio } from '../types';
import apiService from '../services/api';
import '../styles/Portfolios.css';

const Portfolios: React.FC = () => {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
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
      setFormData({ name: portfolio.name, description: portfolio.description || '' });
    } else {
      setEditingPortfolio(null);
      setFormData({ name: '', description: '' });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPortfolio(null);
    setFormData({ name: '', description: '' });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    try {
      if (editingPortfolio) {
        await apiService.updatePortfolio(editingPortfolio.id, formData);
        setSuccessMessage('Portfolio updated!');
      } else {
        await apiService.createPortfolio(formData);
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
                  <h3>{p.name}</h3>
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
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Binance" required />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
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
