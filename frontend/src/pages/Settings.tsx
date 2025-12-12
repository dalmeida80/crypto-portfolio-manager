import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import apiService, { ApiKey } from '../services/api';
import '../styles/Settings.css';

const Settings: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    apiKey: '',
    apiSecret: '',
    label: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const response = await apiService.listApiKeys();
      setApiKeys(response.apiKeys);
    } catch (err: any) {
      setError('Failed to load API keys');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await apiService.addApiKey(
        formData.apiKey,
        formData.apiSecret,
        formData.label || undefined
      );
      
      setSuccess('API key added successfully!');
      setFormData({ apiKey: '', apiSecret: '', label: '' });
      setShowAddForm(false);
      await loadApiKeys();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) {
      return;
    }

    try {
      await apiService.deleteApiKey(id);
      setSuccess('API key deleted successfully');
      await loadApiKeys();
    } catch (err: any) {
      setError('Failed to delete API key');
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
      <div className="settings-page">
        <div className="page-header">
          <h1>Settings</h1>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="settings-section">
          <div className="section-header">
            <h2>Binance API Keys</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn btn-primary"
            >
              {showAddForm ? 'Cancel' : '+ Add API Key'}
            </button>
          </div>

          <p className="section-description">
            Connect your Binance account to automatically import trades. Your API keys are encrypted and stored securely.
          </p>

          {showAddForm && (
            <div className="api-key-form-card">
              <h3>Add Binance API Key</h3>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="label">Label (Optional)</label>
                  <input
                    type="text"
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="e.g., Main Account"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="apiKey">API Key *</label>
                  <input
                    type="text"
                    id="apiKey"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    required
                    placeholder="Your Binance API Key"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="apiSecret">API Secret *</label>
                  <input
                    type="password"
                    id="apiSecret"
                    value={formData.apiSecret}
                    onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                    required
                    placeholder="Your Binance API Secret"
                  />
                </div>

                <div className="help-text">
                  <strong>⚠️ Important:</strong>
                  <ul>
                    <li>Enable only "Read" permission (spot account)</li>
                    <li>Do NOT enable trading or withdrawal permissions</li>
                    <li>Your keys are encrypted with AES-256-GCM</li>
                  </ul>
                </div>

                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Testing & Adding...' : 'Add API Key'}
                </button>
              </form>
            </div>
          )}

          <div className="api-keys-list">
            {apiKeys.length === 0 ? (
              <div className="empty-state">
                <p>No API keys configured. Add your first Binance API key to start importing trades automatically.</p>
              </div>
            ) : (
              <div className="api-keys-grid">
                {apiKeys.map((key) => (
                  <div key={key.id} className="api-key-card">
                    <div className="api-key-header">
                      <div>
                        <h3>{key.label || key.exchange.toUpperCase()}</h3>
                        <span className={`status-badge ${key.isActive ? 'active' : 'inactive'}`}>
                          {key.isActive ? '✓ Active' : '✗ Inactive'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDelete(key.id)}
                        className="btn btn-danger btn-small"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="api-key-details">
                      <p><strong>Exchange:</strong> {key.exchange}</p>
                      <p><strong>Added:</strong> {new Date(key.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h2>How to Get Binance API Keys</h2>
          <ol className="instructions-list">
            <li>Log in to your <a href="https://www.binance.com" target="_blank" rel="noopener noreferrer">Binance account</a></li>
            <li>Go to <strong>Profile → API Management</strong></li>
            <li>Click <strong>Create API</strong></li>
            <li>Choose <strong>System generated</strong></li>
            <li>Enable only <strong>"Read" permission</strong> (Enable Spot & Margin Trading → Read)</li>
            <li>Complete 2FA verification</li>
            <li>Copy your API Key and Secret</li>
            <li>Paste them here</li>
          </ol>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
