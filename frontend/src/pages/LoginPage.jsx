import React from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import googleIcon from '../assets/google-icon.svg';

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get('redirect') || '/';
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  if (isAuthenticated) {
    return <Navigate to={redirect} replace />;
  }

  const handleLogin = async () => {
    try {
      await loginWithRedirect({
        appState: {
          returnTo: redirect || '/',
        },
      });
    } catch (error) {
      toast.error('Unable to continue to secure sign in');
    }
  };

  return (
    <Layout hideFooter>
      <div className="min-h-screen flex" data-testid="login-page">
        {/* Left Side - Image */}
        <div className="hidden lg:block lg:w-1/2 relative">
          <img
            src="https://images.unsplash.com/photo-1766393030567-2204662b0be2?crop=entropy&cs=srgb&fm=jpg&q=85"
            alt="Candle lifestyle"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-foreground/20" />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <h2 className="font-heading text-4xl mb-4">Welcome to Mariso</h2>
            <p className="text-white/80">Handcrafted candles & homewares designed to elevate everyday living.</p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <Link to="/" className="font-heading text-3xl text-foreground mb-8 block">
              Mariso
            </Link>

            <h1 className="font-heading text-3xl mb-2">Sign In</h1>
            <p className="text-muted-foreground mb-8">
              Welcome back. Continue through Mariso's secure sign in.
            </p>

            <div className="space-y-4">
              <Button
                type="button"
                className="btn-primary w-full"
                disabled={isLoading}
                onClick={handleLogin}
                data-testid="login-submit"
              >
                {isLoading ? 'Redirecting...' : 'Continue to secure sign in'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <div className="flex items-center my-4">
                <div className="flex-grow border-t" />
                <span className="mx-3 text-sm text-muted-foreground">OR</span>
                <div className="flex-grow border-t" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  loginWithRedirect({
                    appState: { returnTo: redirect || '/' },
                    authorizationParams: {
                      connection: 'google-oauth2'
                    }
                  })
                }
              >
                <img
                  src={googleIcon}
                  alt="Google"
                  className="h-5 w-5 mr-2"
                />
                Continue with Google
              </Button>
            </div>

            <p className="text-center text-muted-foreground mt-8">
              Don't have an account?{' '}
              <Link to={`/register?redirect=${encodeURIComponent(redirect)}`} className="text-foreground font-medium hover:underline" data-testid="go-to-register">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LoginPage;
