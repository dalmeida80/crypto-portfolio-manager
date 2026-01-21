import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

interface Summary {
  totalDeposits: number;
  totalWithdrawals: number;
  netDeposits: number;
  interestOnCash: number;
  cashback: number;
  cardDebits: number;
  currentBalance: number;
  transactionsCount: number;
}

interface Transaction {
  id: string;
  action: string;
  time: string;
  ticker?: string;
  name?: string;
  shares?: number;
  pricePerShare?: number;
  totalAmount?: number;
  totalCurrency?: string;
  notes?: string;
}

export default function Trading212Account() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchData();
  }, [id, token]);

  const fetchData = async () => {
    try {
      const [summaryRes, transactionsRes] = await Promise.all([
        api.get(`/portfolios/${id}/trading212/summary`),
        api.get(`/portfolios/${id}/trading212/transactions?limit=50`)
      ]);
      setSummary(summaryRes.data);
      setTransactions(transactionsRes.data.transactions);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await api.post(`/portfolios/${id}/trading212/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(`✅ Import successful!\nImported: ${response.data.imported}\nUpdated: ${response.data.updated}\nDuplicates: ${response.data.duplicates}`);
      setSelectedFile(null);
      fetchData();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('❌ Import failed. Please check the CSV format.');
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (value: number | undefined, currency = '€') => {
    if (value === undefined || value === null) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ${currency}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-PT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('Deposit')) return 'text-green-600';
    if (action.includes('Withdrawal') || action.includes('Card debit')) return 'text-red-600';
    if (action.includes('Interest') || action.includes('cashback')) return 'text-blue-600';
    if (action.includes('buy')) return 'text-green-500';
    if (action.includes('sell')) return 'text-red-500';
    return 'text-gray-700';
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate(`/portfolios/${id}`)}
          className="mb-6 text-blue-600 hover:text-blue-800 flex items-center gap-2"
        >
          ← Voltar ao Portfolio
        </button>

        <h1 className="text-3xl font-bold mb-8">Trading212 Account</h1>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm text-gray-500">Current Balance</h3>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(summary.currentBalance)}
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm text-gray-500">Net Deposits</h3>
              <p className="text-2xl font-bold text-gray-700">
                {formatCurrency(summary.netDeposits)}
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm text-gray-500">Interest on Cash</h3>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(summary.interestOnCash)}
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm text-gray-500">Cashback</h3>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.cashback)}
              </p>
            </div>
          </div>
        )}

        {/* Upload CSV */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4">📥 Import CSV</h2>
          <form onSubmit={handleUpload} className="flex gap-4">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="flex-1 border border-gray-300 rounded px-3 py-2"
              required
            />
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {uploading ? 'Importing...' : 'Import'}
            </button>
          </form>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-lg shadow">
          <h2 className="text-xl font-bold p-6 border-b">Recent Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4 font-semibold">Date</th>
                  <th className="text-left p-4 font-semibold">Action</th>
                  <th className="text-left p-4 font-semibold">Asset</th>
                  <th className="text-right p-4 font-semibold">Shares</th>
                  <th className="text-right p-4 font-semibold">Price</th>
                  <th className="text-right p-4 font-semibold">Total</th>
                  <th className="text-left p-4 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t hover:bg-gray-50">
                    <td className="p-4 text-sm text-gray-600">{formatDate(tx.time)}</td>
                    <td className={`p-4 text-sm font-medium ${getActionColor(tx.action)}`}>
                      {tx.action}
                    </td>
                    <td className="p-4 text-sm">
                      {tx.ticker ? (
                        <div>
                          <div className="font-semibold">{tx.ticker}</div>
                          <div className="text-xs text-gray-500">{tx.name}</div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-4 text-sm text-right">
                      {tx.shares ? tx.shares.toFixed(4) : '-'}
                    </td>
                    <td className="p-4 text-sm text-right">
                      {tx.pricePerShare ? formatCurrency(tx.pricePerShare) : '-'}
                    </td>
                    <td className="p-4 text-sm text-right font-semibold">
                      {formatCurrency(tx.totalAmount, tx.totalCurrency || '€')}
                    </td>
                    <td className="p-4 text-xs text-gray-500">{tx.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
