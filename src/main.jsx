import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import Library from './pages/Library';
import StudioManager from './pages/StudioManager';
import './styles/main.css';

function AppRouter() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // development-only studio manager window on #/manage or #/admin
  if (import.meta.env.DEV && (route.startsWith('#/manage') || route.startsWith('#/admin'))) {
    return <StudioManager />;
  }

  // pure, clean visitor site
  return <Library />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
