import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Portfolios from './pages/Portfolios';
import PortfolioDetail from './pages/PortfolioDetail';
import Transfers from './pages/Transfers';
import Settings from './pages/Settings';
import ApiKeysPage from "./pages/ApiKeys";
import { TestShadcn } from './pages/TestShadcn';
import RevolutXTrade from './pages/revolutx/Trade';
import Trading212Account from './pages/trading212/Account';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/portfolios" element={<Portfolios />} />
              <Route path="/portfolios/:id" element={<PortfolioDetail />} />
              <Route path="/portfolios/:id/transfers" element={<Transfers />} />
              <Route path="/portfolios/:id/trade" element={<RevolutXTrade />} />
              <Route path="/portfolios/:id/trading212" element={<Trading212Account />} />
              <Route path="/settings" element={<Settings />} />
	      <Route path="/api-keys" element={<ApiKeysPage />} />
              <Route path="/test-shadcn" element={<TestShadcn />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
