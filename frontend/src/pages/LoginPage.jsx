import React, { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import googleIcon from '../assets/google-icon.svg';

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  const [activeTab, setActiveTab] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);  
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  if (isAuthenticated) {
    return <Navigate to={redirect} replace />;
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await loginWithRedirect({
        appState: {
          returnTo: redirect,
        },
        authorizationParams: {
          login_hint: formData.email,
        },
      });
    } catch (error) {
      toast.error('Unable to continue to secure sign in');
    }
  };

  const handleRequestOTP = async (e) => {
    e.preventDefault();

    if (!formData.email) {
      toast.error('Please enter your email');
      return;
    }

    setOtpSent(true);
    toast.info('OTP login is not enabled yet. Please continue with Password sign in for now.');
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();

    if (!otp || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    toast.info('OTP login is not enabled yet. Please use Password sign in for now.');
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
              Welcome back! Sign in to your account.
            </p>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="password" data-testid="tab-password">Password</TabsTrigger>
                <TabsTrigger value="otp" data-testid="tab-otp">OTP</TabsTrigger>
              </TabsList>

              {/* Password Login */}
              <TabsContent value="password">
                <form onSubmit={handlePasswordLogin} className="space-y-6">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      className="mt-2"
                      data-testid="login-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <div className="relative mt-2">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Enter your password"
                        className="pr-10"
                        data-testid="login-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        data-testid="toggle-password"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={isLoading}
                    data-testid="login-submit"
                  >
                    {isLoading ? 'Redirecting...' : 'Sign In'}
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
                        appState: { returnTo: redirect },
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
                </form>
              </TabsContent>

              {/* OTP Login */}
              <TabsContent value="otp">
                {!otpSent ? (
                  <form onSubmit={handleRequestOTP} className="space-y-6">
                    <div>
                      <Label htmlFor="otp-email">Email</Label>
                      <Input
                        id="otp-email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        className="mt-2"
                        data-testid="otp-email"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="btn-primary w-full"
                      disabled={isLoading}
                      data-testid="request-otp"
                    >
                      {isLoading ? 'Redirecting...' : 'Continue'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOTP} className="space-y-6">
                    <div>
                      <Label>Enter OTP</Label>
                      <p className="text-sm text-muted-foreground mb-4">
                        We sent a code to {formData.email}
                      </p>
                      <InputOTP
                        maxLength={6}
                        value={otp}
                        onChange={setOtp}
                        data-testid="otp-input"
                      >
                        <InputOTPGroup className="gap-2">
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Button
                      type="submit"
                      className="btn-primary w-full"
                      disabled={isLoading}
                      data-testid="verify-otp"
                    >
                      Verify OTP
                    </Button>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
                      data-testid="resend-otp"
                    >
                      Didn't receive code? Try again
                    </button>
                  </form>
                )}
              </TabsContent>
            </Tabs>

            <p className="text-center text-muted-foreground mt-8">
              Don't have an account?{' '}
              <Link to={`/register?redirect=${redirect}`} className="text-foreground font-medium hover:underline" data-testid="go-to-register">
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
