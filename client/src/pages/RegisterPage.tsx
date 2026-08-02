import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../utils/api';
import { isAxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import { LoadingOverlay } from '../components/LoadingOverlay';

const RegisterPage = () => {
  const [name, setName] = useState('');
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
    if (!name || !email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/api/auth/register', { name, email, password });
      const { user, token } = response.data.data;
      login(user, token);
      toast.success('Account created successfully!');
      navigate('/');
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const message = error.response?.data?.message || 'Registration failed. Please try again.';
        // Handle Zod validation errors format from backend
        if (error.response?.data?.errors) {
          const firstError = error.response.data.errors[0];
          toast.error(`${firstError.field}: ${firstError.message}`);
        } else {
          toast.error(message);
        }
      } else {
        toast.error('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 font-sans">
      {isSubmitting && <LoadingOverlay label="Creating account..." />}
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-6 h-6 bg-accent rounded flex items-center justify-center text-xs text-zinc-950 font-bold">
            C
          </div>
          <span className="text-xl font-semibold text-zinc-200">CloudHub</span>
        </div>

        <h1 className="text-lg font-medium text-zinc-200 mb-1">Create account</h1>
        <p className="text-sm text-zinc-500 mb-6">Get started with CloudHub.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="register-name" className="block text-xs text-zinc-400 mb-1.5">Name</label>
            <input
              id="register-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="block text-xs text-zinc-400 mb-1.5">Email</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="register-password" className="block text-xs text-zinc-400 mb-1.5">Password</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-accent text-zinc-950 font-medium text-sm py-2 rounded-md hover:opacity-90 transition-opacity mt-2"
          >
            Create account
          </button>
        </form>

        <p className="text-sm text-zinc-500 mt-6 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">Sign in</Link>
        </p>

        <div className="mt-12 text-center">
          <Link to="/privacy" className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors uppercase tracking-widest">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
