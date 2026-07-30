import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useAuthStore } from './store/authStore';
import { api } from './utils/api';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { ProtectedRoute } from './components/ProtectedRoute';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        path: '',
        element: <MainLayout />,
        children: [
      {
        index: true,
        element: <DashboardPage />,
      },
          {
            path: 'settings',
            element: <SettingsPage />,
          },
        ],
      },
    ],
  },
]);

function App() {
  const { token, setUser, logout, setLoading } = useAuthStore();

  useEffect(() => {
    const hydrateSession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/api/auth/me');
        setUser(response.data.data.user);
      } catch {
        // Interceptor handles logout on 401, but we ensure it here too
        logout();
      } finally {
        setLoading(false);
      }
    };
    hydrateSession();
  }, [token, setUser, logout, setLoading]);

  return (
    <>
      <Toaster 
        theme="dark" 
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#18181b', // zinc-900
            border: '1px solid #27272a', // zinc-800
            color: '#d4d4d8', // zinc-300
          },
          className: 'shadow-none',
        }}
      />
      <RouterProvider router={router} />
    </>
  );
}

export default App;
