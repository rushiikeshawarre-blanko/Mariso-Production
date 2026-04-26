import React from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';

const RegisterPage = () => {
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get('redirect') || '/';
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  if (isAuthenticated) {
    return <Navigate to={redirect} replace />;
  }

  const handleSignup = async () => {
    try {
      await loginWithRedirect({
        appState: {
          returnTo: redirect || '/',
        },
        authorizationParams: {
          screen_hint: 'signup',
        },
      });
    } catch (error) {
      toast.error('Unable to continue to secure sign up');
    }
  };

  return (
    <Layout hideFooter>
      <div className="min-h-screen flex" data-testid="register-page">
        {/* Left Side - Image */}
        <div className="hidden lg:block lg:w-1/2 relative">
          <img
            src="https://images.unsplash.com/photo-1595515106886-43b1443a2e8b?crop=entropy&cs=srgb&fm=jpg&q=85"
            alt="Spa setting with candle"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-foreground/20" />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <h2 className="font-heading text-4xl mb-4">Join Mariso</h2>
            <p className="text-white/80">Create an account to enjoy exclusive offers and track your orders.</p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <Link to="/" className="font-heading text-3xl text-foreground mb-8 block">
              Mariso
            </Link>

            <h1 className="font-heading text-3xl mb-2">Create Account</h1>
            <p className="text-muted-foreground mb-8">
              Create your account through Mariso's secure sign up.
            </p>

            <Button
              type="button"
              className="btn-primary w-full"
              disabled={isLoading}
              onClick={handleSignup}
              data-testid="register-submit"
            >
              {isLoading ? 'Redirecting...' : 'Create account securely'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <p className="text-center text-muted-foreground mt-8">
              Already have an account?{' '}
              <Link to={`/login?redirect=${encodeURIComponent(redirect)}`} className="text-foreground font-medium hover:underline" data-testid="go-to-login">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default RegisterPage;
