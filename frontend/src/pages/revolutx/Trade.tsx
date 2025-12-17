import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface TradeFormData {
  pair: string;
  side: 'buy' | 'sell';
  amount: string;
  price: string;
}

interface Order {
  id: string;
  pair: string;
  side: string;
  amount: number;
  price: number;
  status: string;
  createdAt: string;
}

const RevolutXTrade: React.FC = () => {
  const { id: portfolioId } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'create' | 'orders'>('create');
  const [formData, setFormData] = useState<TradeFormData>({
    pair: 'BTC-EUR',
    side: 'buy',
    amount: '',
    price: ''
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [availablePairs, setAvailablePairs] = useState<string[]>([]);

  // Comprehensive list of popular crypto pairs on Revolut X
  const DEFAULT_PAIRS = [
    'BTC-EUR',   // Bitcoin
    'ETH-EUR',   // Ethereum
    'DOGE-EUR',  // Dogecoin
    'XRP-EUR',   // Ripple
    'SOL-EUR',   // Solana
    'ADA-EUR',   // Cardano
    'AVAX-EUR',  // Avalanche
    'DOT-EUR',   // Polkadot
    'MATIC-EUR', // Polygon
    'LINK-EUR',  // Chainlink
    'UNI-EUR',   // Uniswap
    'LTC-EUR',   // Litecoin
    'ATOM-EUR',  // Cosmos
    'NEAR-EUR',  // Near
    'ALGO-EUR',  // Algorand
    'PEPE-EUR',  // Pepe
    'SHIB-EUR',  // Shiba Inu
    'ONDO-EUR',  // Ondo
    'APT-EUR',   // Aptos
    'ARB-EUR',   // Arbitrum
  ].sort();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Fetch portfolio holdings to get available pairs
  useEffect(() => {
    const fetchHoldings = async () => {
      try {
        const response = await fetch(`/api/portfolios/${portfolioId}/balances`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          // Extract pairs from holdings
          const holdingPairs = data.holdings?.map((h: any) => `${h.asset}-EUR`) || [];
          
          // Combine with default pairs and remove duplicates
          const allPairs = [...new Set([...DEFAULT_PAIRS, ...holdingPairs])].sort();
          setAvailablePairs(allPairs);
        } else {
          // Fallback to default pairs if fetch fails
          setAvailablePairs(DEFAULT_PAIRS);
        }
      } catch (err) {
        console.error('Failed to fetch holdings:', err);
        setAvailablePairs(DEFAULT_PAIRS);
      }
    };

    fetchHoldings();
  }, [portfolioId]);

  // Fetch open orders
  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/orders`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Load orders when tab changes
  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders();
    }
  }, [activeTab]);

  // Auto refresh orders every 10 seconds
  useEffect(() => {
    if (activeTab === 'orders') {
      const interval = setInterval(fetchOrders, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to place order');
      }

      const data = await response.json();
      setResult(data);
      
      // Refresh orders after creating new one
      if (activeTab === 'orders') {
        fetchOrders();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Tem certeza que deseja cancelar esta ordem?')) {
      return;
    }

    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel order');
      }

      // Refresh orders
      fetchOrders();
      alert('Ordem cancelada com sucesso!');
    } catch (err: any) {
      alert(`Erro ao cancelar ordem: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 shadow-2xl">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                🚀 Revolut X Trading
              </h1>
              <p className="text-purple-200">
                Portfolio ID: <span className="font-mono text-yellow-300">{portfolioId}</span>
              </p>
            </div>
            <button
              onClick={() => navigate(`/portfolios/${portfolioId}`)}
              className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-all"
            >
              ← Voltar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'create'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            📝 Criar Ordem
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              activeTab === 'orders'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            📊 Ordens Abertas {orders.length > 0 && `(${orders.length})`}
          </button>
        </div>

        {/* Create Order Tab */}
        {activeTab === 'create' && (
          <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
            {/* Pair Selection */}
            <div className="mb-6">
              <label className="block text-purple-200 font-semibold mb-2">
                Par de Negociação
                <span className="ml-2 text-sm text-purple-300">({availablePairs.length} pares disponíveis)</span>
              </label>
              <select
                value={formData.pair}
                onChange={(e) => setFormData({ ...formData, pair: e.target.value })}
                className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 border border-purple-500 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                {availablePairs.map(pair => (
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
          </form>
        )}

        {/* Open Orders Tab */}
        {activeTab === 'orders' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">📊 Ordens Abertas</h2>
              <button
                onClick={fetchOrders}
                disabled={loadingOrders}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all"
              >
                {loadingOrders ? '⏳' : '🔄'} Atualizar
              </button>
            </div>

            {loadingOrders && orders.length === 0 ? (
              <div className="text-center text-purple-200 py-8">
                <p>⏳ Carregando ordens...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center text-purple-200 py-8">
                <p>📭 Não há ordens abertas</p>
                <p className="text-sm mt-2 text-purple-300">
                  (Nota: Ordens reais da Revolut X aparecerão aqui quando a API estiver conectada)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/30 hover:border-purple-500 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">
                            {order.side === 'buy' ? '🟢' : '🔴'}
                          </span>
                          <span className="text-white font-bold text-lg">
                            {order.pair}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            order.side === 'buy' 
                              ? 'bg-green-600/30 text-green-300'
                              : 'bg-red-600/30 text-red-300'
                          }`}>
                            {order.side.toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-purple-300">Quantidade</p>
                            <p className="text-white font-mono">{order.amount}</p>
                          </div>
                          <div>
                            <p className="text-purple-300">Preço</p>
                            <p className="text-white font-mono">{order.price} EUR</p>
                          </div>
                          <div>
                            <p className="text-purple-300">Status</p>
                            <p className="text-yellow-300">{order.status}</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        className="ml-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-semibold"
                      >
                        ❌ Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RevolutXTrade;
