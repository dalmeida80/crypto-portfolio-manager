import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import apiService from '../services/api';


interface Transfer {
  id: string;
  portfolioId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  asset: string;
  amount: number;
  fee: number;
  executedAt: string;
  source?: string;
  notes?: string;
}

const Transfers: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAsset, setFilterAsset] = useState<string>('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    fetchTransfers();
  }, [id, isAuthenticated, navigate]);

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || '/api'}/portfolios/${id}/transfers`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load transfers');
      }

      const data = await response.json();
      setTransfers(data);
    } catch (err: any) {
      console.error('Error fetching transfers:', err);
      setError(err.message || 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransfers = transfers.filter((transfer) => {
    if (filterType !== 'all' && transfer.type !== filterType) return false;
    if (filterAsset && !transfer.asset.toLowerCase().includes(filterAsset.toLowerCase()))
      return false;
    return true;
  });

  const formatNumber = (value: number | string, decimals: number = 8): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '0.00' : num.toFixed(decimals);
  };

  const stats = {
    totalDeposits: transfers
      .filter((t) => t.type === 'DEPOSIT')
      .reduce((sum, t) => sum + (typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount), 0),
    totalWithdrawals: transfers
      .filter((t) => t.type === 'WITHDRAWAL')
      .reduce((sum, t) => sum + (typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount), 0),
    totalFees: transfers.reduce(
      (sum, t) => sum + (typeof t.fee === 'string' ? parseFloat(t.fee) : t.fee || 0),
      0
    ),
  };

  if (loading) {
    return (
      <Layout>
        <div className="transfers-page">
          <div className="loading">Loading transfers...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="transfers-page">
          <div className="error">{error}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="transfers-page">
        <button onClick={() => navigate(`/portfolios/${id}`)} className="btn-back">
          ← Back to Portfolio
        </button>

        <div className="page-header">
          <h1>Deposits & Withdrawals</h1>
        </div>

        <div className="stats-row">
          <div className="stat-box">
            <span className="stat-label">📥 Total Deposits</span>
            <span className="stat-value">{formatNumber(stats.totalDeposits, 4)} units</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">📤 Total Withdrawals</span>
            <span className="stat-value">{formatNumber(stats.totalWithdrawals, 4)} units</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">💰 Total Fees</span>
            <span className="stat-value">{formatNumber(stats.totalFees, 4)} units</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">📊 Total Transfers</span>
            <span className="stat-value">{transfers.length}</span>
          </div>
        </div>

        <div className="filters">
          <div className="filter-group">
            <label>Type:</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All</option>
              <option value="DEPOSIT">Deposits</option>
              <option value="WITHDRAWAL">Withdrawals</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Asset:</label>
            <input
              type="text"
              placeholder="Search asset..."
              value={filterAsset}
              onChange={(e) => setFilterAsset(e.target.value)}
            />
          </div>
        </div>

        {filteredTransfers.length === 0 ? (
          <div className="empty-state">
            <p>No transfers found</p>
          </div>
        ) : (
          <div className="transfers-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Source</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td>{new Date(transfer.executedAt).toLocaleString()}</td>
                    <td>
                      <span className={`badge ${transfer.type.toLowerCase()}`}>
                        {transfer.type === 'DEPOSIT' ? '📥' : '📤'} {transfer.type}
                      </span>
                    </td>
                    <td>
                      <strong>{transfer.asset}</strong>
                    </td>
                    <td>{formatNumber(transfer.amount)}</td>
                    <td>{formatNumber(transfer.fee)}</td>
                    <td>{transfer.source || '-'}</td>
                    <td>{transfer.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Transfers;
