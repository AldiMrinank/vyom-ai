import { Component, ReactNode, useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/context/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { loadSettings, applyFontSize } from "@/lib/settings";
import { runAutoClear } from "@/lib/autoClear";
import AppShell from "./components/AppShell";
import OfflineIndicator from "./components/OfflineIndicator";
import InstallPrompt from "./components/InstallPrompt";
import Onboarding from "./components/Onboarding";
import Skeleton from "./components/Skeleton";

// Lazy-loaded routes
const Home     = lazy(() => import("./pages/Home"));
const Explore  = lazy(() => import("./pages/Explore"));
const Chat     = lazy(() => import("./pages/Chat"));
const History  = lazy(() => import("./pages/History"));
const Profile  = lazy(() => import("./pages/Profile"));
const Voice    = lazy(() => import("./pages/Voice"));
const Auth     = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Library  = lazy(() => import("./pages/Library"));
const Research = lazy(() => import("./pages/Research"));

const PageLoader = () => (
  <div className="px-5 pt-5 space-y-4 min-h-dvh bg-[#080810]">
    <Skeleton className="h-12 w-full rounded-2xl" />
    <Skeleton className="h-40 w-full rounded-3xl" />
    <Skeleton className="h-20 w-full rounded-2xl" />
    <Skeleton className="h-20 w-full rounded-2xl" />
  </div>
);

// Per-route error boundary — catches React error #300 and other render errors
// without crashing the entire app. Shows a recovery UI with Retry.
class RouteErrorBoundary extends Component<
  { children: ReactNode; routeName?: string },
  { err: string | null; key: number }
> {
  state = { err: null as string | null, key: 0 };

  static getDerivedStateFromError(e: Error) {
    return { err: e.message };
  }

  componentDidCatch(e: Error, info: any) {
    console.error("[RouteErrorBoundary]", e, info);
  }

  retry = () => {
    // Increment key to remount the child subtree cleanly, resetting all hook state
    this.setState(s => ({ err: null, key: s.key + 1 }));
  };

  render() {
    if (this.state.err) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#080810] text-white px-6 text-center gap-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-white/40 text-sm max-w-xs">{this.state.err}</p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={this.retry}
              className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-medium active:scale-95 transition"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = "/"}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium active:scale-95 transition"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }
    return (
      <Suspense key={this.state.key} fallback={<PageLoader />}>
        {this.props.children}
      </Suspense>
    );
  }
}

// Top-level error boundary — last resort fallback
class AppErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    if (this.state.err) return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#080810] text-white px-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold mb-2">App crashed</h1>
        <p className="text-white/50 text-sm mb-6">{this.state.err}</p>
        <button onClick={() => window.location.reload()}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-2.5 text-sm font-medium">
          Reload
        </button>
      </div>
    );
    return this.props.children;
  }
}

const NAV_ORDER = ["/", "/explore", "/history", "/library", "/profile"];
const SwipeNavigator = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [touchX, setTouchX] = useState(0);
  useKeyboardShortcuts();

  const handleSwipe = (endX: number) => {
    const diff = touchX - endX;
    if (Math.abs(diff) < 60) return;
    const idx = NAV_ORDER.indexOf(location.pathname);
    if (idx === -1) return;
    const next = diff > 0 ? NAV_ORDER[idx + 1] : NAV_ORDER[idx - 1];
    if (next) navigate(next);
  };

  return (
    <div onTouchStart={e => setTouchX(e.touches[0].clientX)}
      onTouchEnd={e => handleSwipe(e.changedTouches[0].clientX)}>
      {children}
    </div>
  );
};

const AppInner = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    applyFontSize(loadSettings().fontSize);
    if (!localStorage.getItem("onboarded")) {
      const t = setTimeout(() => setShowOnboarding(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (user) runAutoClear(user.uid);
  }, [user]);

  return (
    <>
      {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
      <SwipeNavigator>
        <Routes>
          <Route path="/auth" element={
            <RouteErrorBoundary routeName="Auth"><Auth /></RouteErrorBoundary>
          } />
          <Route element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }>
            <Route path="/"         element={<RouteErrorBoundary routeName="Home"><Home /></RouteErrorBoundary>} />
            <Route path="/explore"  element={<RouteErrorBoundary routeName="Explore"><Explore /></RouteErrorBoundary>} />
            <Route path="/chat"     element={<RouteErrorBoundary routeName="Chat"><Chat /></RouteErrorBoundary>} />
            <Route path="/history"  element={<RouteErrorBoundary routeName="History"><History /></RouteErrorBoundary>} />
            <Route path="/profile"  element={<RouteErrorBoundary routeName="Profile"><Profile /></RouteErrorBoundary>} />
            <Route path="/library"  element={<RouteErrorBoundary routeName="Library"><Library /></RouteErrorBoundary>} />
            <Route path="/research" element={<RouteErrorBoundary routeName="Research"><Research /></RouteErrorBoundary>} />
          </Route>
          <Route path="/voice" element={
            <ProtectedRoute>
              <RouteErrorBoundary routeName="Voice"><Voice /></RouteErrorBoundary>
            </ProtectedRoute>
          } />
          <Route path="*" element={
            <RouteErrorBoundary routeName="NotFound"><NotFound /></RouteErrorBoundary>
          } />
        </Routes>
      </SwipeNavigator>
      <OfflineIndicator />
      <InstallPrompt />
    </>
  );
};

const App = () => (
  <AppErrorBoundary>
    <ThemeProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </AppErrorBoundary>
);

export default App;
