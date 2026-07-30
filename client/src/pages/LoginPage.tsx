import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { isAxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import { LoadingOverlay } from '../components/LoadingOverlay';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { user, token } = response.data.data;
      login(user, token);
      toast.success('Welcome back!');
      navigate('/');
    } catch (error: unknown) {
      const message = isAxiosError(error) ? error.response?.data?.message : 'Login failed. Please try again.';
      toast.error(message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 font-sans">
      {isSubmitting && <LoadingOverlay label="Signing in..." />}
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-6 h-6 bg-accent rounded flex items-center justify-center text-xs text-zinc-950 font-bold">
            C
          </div>
          <span className="text-xl font-semibold text-zinc-200">CloudHub</span>
        </div>

        <h1 className="text-lg font-medium text-zinc-200 mb-1">Sign in</h1>
        <p className="text-sm text-zinc-500 mb-6">Enter your credentials to continue.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="login-email" className="block text-xs text-zinc-400 mb-1.5">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs text-zinc-400 mb-1.5">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-accent text-zinc-950 font-medium text-sm py-2 rounded-md hover:opacity-90 transition-opacity mt-2"
          >
            Sign in
          </button>
        </form>

        <p className="text-sm text-zinc-500 mt-6 text-center">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-accent hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
