import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface TradeFormData {
  pair: string;
  side: 'buy' | 'sell';
  amount: string;
  price: string;
}

const RevolutXTrade: React.FC = () => {
  const { id: portfolioId } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<TradeFormData>({
    pair: 'DOGE-EUR',
    side: 'buy',
    amount: '',
    price: ''
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/orders/limit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to place order');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pairs = ['DOGE-EUR', 'BTC-EUR', 'PEPE-EUR', 'XRP-EUR', 'SOL-EUR', 'ONDO-EUR'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 shadow-2xl">
          <h1 className="text-3xl font-bold text-white mb-2">
            🚀 Revolut X Trading
          </h1>
          <p className="text-purple-200">
            Portfolio ID: <span className="font-mono text-yellow-300">{portfolioId}</span>
          </p>
        </div>

        {/* Trade Form */}
        <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
          {/* Pair Selection */}
          <div className="mb-6">
            <label className="block text-purple-200 font-semibold mb-2">
              Par de Negociação
            </label>
            <select
              value={formData.pair}
              onChange={(e) => setFormData({ ...formData, pair: e.target.value })}
              className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 border border-purple-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              {pairs.map(pair => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>

          {/* Side Selection */}
          <div className="mb-6">
            <label className="block text-purple-200 font-semibold mb-2">
              Tipo de Ordem
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, side: 'buy' })}
                className={`py-3 rounded-lg font-bold transition-all ${
                  formData.side === 'buy'
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'bg-slate-700 text-gray-300'
                }`}
              >
                🟢 COMPRAR
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, side: 'sell' })}
                className={`py-3 rounded-lg font-bold transition-all ${
                  formData.side === 'sell'
                    ? 'bg-red-600 text-white shadow-lg'
                    : 'bg-slate-700 text-gray-300'
                }`}
              >
                🔴 VENDER
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <label className="block text-purple-200 font-semibold mb-2">
              Quantidade
            </label>
            <input
              type="number"
              step="0.00000001"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00000000"
              className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 border border-purple-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              required
            />
          </div>

          {/* Price Input */}
          <div className="mb-8">
            <label className="block text-purple-200 font-semibold mb-2">
              Preço Limite (EUR)
            </label>
            <input
              type="number"
              step="0.00000001"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0.00000000"
              className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 border border-purple-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              required
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-4 rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
          >
            {loading ? '⏳ Processando...' : '✅ Colocar Ordem'}
          </button>
        </form>

        {/* Success Result */}
        {result && (
          <div className="mt-6 bg-green-500/20 border border-green-500 rounded-xl p-6 backdrop-blur-lg">
            <h3 className="text-green-300 font-bold text-lg mb-2">✅ Ordem Criada!</h3>
            <pre className="text-white text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-6 bg-red-500/20 border border-red-500 rounded-xl p-6 backdrop-blur-lg">
            <h3 className="text-red-300 font-bold text-lg">❌ Erro</h3>
            <p className="text-white">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RevolutXTrade;
