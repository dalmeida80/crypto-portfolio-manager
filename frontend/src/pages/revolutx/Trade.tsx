import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Layout from '../../components/Layout';
import '../../styles/trade.css';

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

interface Ticker {
  bid: number;
  ask: number;
  mid: number;
}

interface Holding {
  asset: string;
  quantity: number;
  currentPrice: number;
  currentValue: number;
  symbol: string;
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
  const [holdings, setHoldings] = useState<Holding[]>([]);
  
  const [currentPrice, setCurrentPrice] = useState<Ticker | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const DEFAULT_PAIRS = [
    'BTC-EUR', 'ETH-EUR', 'DOGE-EUR', 'XRP-EUR', 'SOL-EUR', 'ADA-EUR',
    'AVAX-EUR', 'DOT-EUR', 'MATIC-EUR', 'LINK-EUR', 'UNI-EUR', 'LTC-EUR',
    'ATOM-EUR', 'NEAR-EUR', 'ALGO-EUR', 'PEPE-EUR', 'SHIB-EUR', 'ONDO-EUR',
    'APT-EUR', 'ARB-EUR',
  ].sort();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const fetchHoldings = async () => {
      try {
        const response = await fetch(`/api/portfolios/${portfolioId}/balances`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
        });

        if (response.ok) {
          const data = await response.json();
          setHoldings(data.holdings || []);
          const holdingPairs = data.holdings?.map((h: any) => `${h.asset}-EUR`) || [];
          const allPairs = [...new Set([...DEFAULT_PAIRS, ...holdingPairs])].sort();
          setAvailablePairs(allPairs);
        } else {
          setAvailablePairs(DEFAULT_PAIRS);
        }
      } catch (err) {
        console.error('Failed to fetch holdings:', err);
        setAvailablePairs(DEFAULT_PAIRS);
      }
    };

    fetchHoldings();
  }, [portfolioId]);

  // Get available balance for selected pair
  const getAvailableBalance = () => {
    const asset = formData.pair.split('-')[0]; // Extract asset from pair (e.g., BTC from BTC-EUR)
    const holding = holdings.find(h => h.asset === asset);
    return holding ? holding.quantity : 0;
  };

  const fetchCurrentPrice = async (pair: string) => {
    setLoadingPrice(true);
    setPriceError(null);
    
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/ticker/${pair}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentPrice(data.ticker);
        
        if (!formData.price && data.ticker.mid) {
          setFormData(prev => ({ ...prev, price: data.ticker.mid.toFixed(8) }));
        }
      } else {
        const errorData = await response.json();
        setPriceError(errorData.message || 'Failed to fetch price');
      }
    } catch (err: any) {
      console.error('Failed to fetch price:', err);
      setPriceError(err.message || 'Network error');
    } finally {
      setLoadingPrice(false);
    }
  };

  useEffect(() => {
    if (formData.pair && activeTab === 'create') {
      fetchCurrentPrice(formData.pair);
    }
  }, [formData.pair, activeTab]);

  useEffect(() => {
    if (activeTab === 'create' && formData.pair) {
      const interval = setInterval(() => fetchCurrentPrice(formData.pair), 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab, formData.pair]);

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/orders`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
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

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders();
    }
  }, [activeTab]);

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
        throw new Error(errorData.error || errorData.message || 'Failed to place order');
      }

      const data = await response.json();
      setResult(data);
      
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
    if (!confirm('Are you sure you want to cancel this order?')) {
      return;
    }

    try {
      const response = await fetch(`/api/portfolios/${portfolioId}/orders/${orderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel order');
      }

      fetchOrders();
      alert('Order cancelled successfully!');
    } catch (err: any) {
      alert(`Error cancelling order: ${err.message}`);
    }
  };

  const fillPriceWithBid = () => {
    if (currentPrice?.bid) {
      setFormData(prev => ({ ...prev, price: currentPrice.bid.toFixed(8) }));
    }
  };

  const fillPriceWithAsk = () => {
    if (currentPrice?.ask) {
      setFormData(prev => ({ ...prev, price: currentPrice.ask.toFixed(8) }));
    }
  };

  const fillPriceWithMid = () => {
    if (currentPrice?.mid) {
      setFormData(prev => ({ ...prev, price: currentPrice.mid.toFixed(8) }));
    }
  };

  const fillMaxAmount = () => {
    const available = getAvailableBalance();
    if (available > 0) {
      setFormData(prev => ({ ...prev, amount: available.toFixed(8) }));
    }
  };

  const availableBalance = getAvailableBalance();
  const asset = formData.pair.split('-')[0];

  return (
    <Layout>
      <div className="trade-page">
        {/* Header */}
        <div className="trade-header">
          <div>
            <h1>🚀 Revolut X Trading</h1>
            <p className="portfolio-id">Portfolio ID: {portfolioId}</p>
          </div>
          <button onClick={() => navigate(`/portfolios/${portfolioId}`)} className="btn-back">
            ← Back
          </button>
        </div>

        {/* Tabs */}
        <div className="trade-tabs">
          <button
            onClick={() => setActiveTab('create')}
            className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
          >
            📝 Create Order
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          >
            📊 Open Orders {orders.length > 0 && `(${orders.length})`}
          </button>
        </div>

        {/* Create Order Tab */}
        {activeTab === 'create' && (
          <form onSubmit={handleSubmit} className="trade-form">
            {/* Pair Selection */}
            <div className="form-group">
              <label>
                Trading Pair
                <span className="hint">({availablePairs.length} pairs available)</span>
              </label>
              <select
                value={formData.pair}
                onChange={(e) => setFormData({ ...formData, pair: e.target.value })}
              >
                {availablePairs.map(pair => (
                  <option key={pair} value={pair}>{pair}</option>
                ))}
              </select>
            </div>

            {/* Available Balance Display */}
            {formData.side === 'sell' && (
              <div className="balance-info">
                <div className="balance-card">
                  <div className="balance-label">💰 Available {asset}</div>
                  <div className="balance-value">
                    {availableBalance.toFixed(8)} {asset}
                  </div>
                  {availableBalance > 0 && (
                    <button 
                      type="button" 
                      onClick={fillMaxAmount} 
                      className="max-btn"
                    >
                      Use Max
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Current Price Display */}
            {loadingPrice ? (
              <div className="price-box loading">
                <p>⏳ Loading current price...</p>
              </div>
            ) : priceError ? (
              <div className="price-box error">
                <p>⚠️ {priceError}</p>
              </div>
            ) : currentPrice ? (
              <div className="price-box">
                <div className="price-header">
                  <h3>💹 Current Price ({formData.pair})</h3>
                  <button type="button" onClick={() => fetchCurrentPrice(formData.pair)} className="refresh-btn">
                    🔄 Refresh
                  </button>
                </div>
                <div className="price-grid">
                  <div className="price-item">
                    <p className="price-label">Buy (Bid)</p>
                    <p className="price-value">€{currentPrice.bid.toFixed(8)}</p>
                    <button type="button" onClick={fillPriceWithBid} className="use-price-btn">Use this price</button>
                  </div>
                  <div className="price-item">
                    <p className="price-label">Mid</p>
                    <p className="price-value">€{currentPrice.mid.toFixed(8)}</p>
                    <button type="button" onClick={fillPriceWithMid} className="use-price-btn">Use this price</button>
                  </div>
                  <div className="price-item">
                    <p className="price-label">Sell (Ask)</p>
                    <p className="price-value">€{currentPrice.ask.toFixed(8)}</p>
                    <button type="button" onClick={fillPriceWithAsk} className="use-price-btn">Use this price</button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Side Selection */}
            <div className="form-group">
              <label>Order Type</label>
              <div className="side-buttons">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, side: 'buy' })}
                  className={`side-btn buy ${formData.side === 'buy' ? 'active' : ''}`}
                >
                  🟢 BUY
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, side: 'sell' })}
                  className={`side-btn sell ${formData.side === 'sell' ? 'active' : ''}`}
                >
                  🔴 SELL
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="form-group">
              <label>Amount</label>
              <input
                type="number"
                step="0.00000001"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00000000"
                required
              />
            </div>

            {/* Price Input */}
            <div className="form-group">
              <label>Limit Price (EUR)</label>
              <input
                type="number"
                step="0.00000001"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00000000"
                required
              />
              {formData.amount && formData.price && (
                <p className="total-value">
                  💰 Total value: €{(parseFloat(formData.amount) * parseFloat(formData.price)).toFixed(2)}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? '⏳ Processing...' : `✅ ${formData.side === 'buy' ? 'Buy' : 'Sell'} ${formData.pair}`}
            </button>

            {/* Success Result */}
            {result && (
              <div className="result-box success">
                <h3>✅ Order Created!</h3>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="result-box error">
                <h3>❌ Error</h3>
                <p>{error}</p>
              </div>
            )}
          </form>
        )}

        {/* Open Orders Tab */}
        {activeTab === 'orders' && (
          <div className="orders-section">
            <div className="orders-header">
              <h2>📊 Open Orders</h2>
              <button onClick={fetchOrders} disabled={loadingOrders} className="btn-secondary">
                {loadingOrders ? '⏳' : '🔄'} Refresh
              </button>
            </div>

            {loadingOrders && orders.length === 0 ? (
              <div className="empty-state">
                <p>⏳ Loading orders...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                <p>📭 No open orders</p>
              </div>
            ) : (
              <div className="orders-list">
                {orders.map(order => (
                  <div key={order.id} className="order-card">
                    <div className="order-info">
                      <div className="order-header">
                        <span className="order-icon">{order.side === 'buy' ? '🟢' : '🔴'}</span>
                        <span className="order-pair">{order.pair}</span>
                        <span className={`order-badge ${order.side}`}>{order.side.toUpperCase()}</span>
                      </div>
                      <div className="order-details">
                        <div>
                          <p className="detail-label">Amount</p>
                          <p className="detail-value">{order.amount}</p>
                        </div>
                        <div>
                          <p className="detail-label">Price</p>
                          <p className="detail-value">{order.price} EUR</p>
                        </div>
                        <div>
                          <p className="detail-label">Status</p>
                          <p className="detail-value status">{order.status}</p>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleCancelOrder(order.id)} className="cancel-btn">
                      ❌ Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RevolutXTrade;
