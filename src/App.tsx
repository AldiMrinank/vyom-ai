import { Component, ReactNode, useState, useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
const Create   = lazy(() => import("./pages/Create"));
const Voice    = lazy(() => import("./pages/Voice"));
const Auth     = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="px-5 pt-5 space-y-4">
    <Skeleton className="h-12 w-full rounded-2xl" />
    <Skeleton className="h-40 w-full rounded-3xl" />
    <Skeleton className="h-20 w-full rounded-2xl" />
    <Skeleton className="h-20 w-full rounded-2xl" />
  </div>
);

class ErrorBoundary extends Component<{children:ReactNode},{err:string|null}> {
  state={err:null};
  static getDerivedStateFromError(e:Error){return{err:e.message};}
  render(){
    if(this.state.err) return(
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#080810] text-white px-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-white/50 text-sm mb-6">{this.state.err}</p>
        <button onClick={()=>window.location.reload()} className="rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-6 py-2.5 text-sm font-medium">Reload</button>
      </div>
    );
    return this.props.children;
  }
}

// Swipe between tabs
const NAV_ORDER = ["/","/explore","/create","/history","/profile"];
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
    const next = diff > 0 ? NAV_ORDER[idx+1] : NAV_ORDER[idx-1];
    // navigate() keeps React Router's internal state in sync immediately,
    // so anything reading useLocation() (like the active tab indicator)
    // updates on the same render instead of lagging a frame behind.
    if (next) navigate(next);
  };

  return (
    <div onTouchStart={e=>setTouchX(e.touches[0].clientX)} onTouchEnd={e=>handleSwipe(e.changedTouches[0].clientX)}>
      {children}
    </div>
  );
};

const queryClient = new QueryClient();

const AppInner = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Apply saved font size on load
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
      <Suspense fallback={<PageLoader />}>
        <SwipeNavigator>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/history" element={<History />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/create" element={<Create />} />
            </Route>
            <Route path="/voice" element={<ProtectedRoute><Voice /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SwipeNavigator>
      </Suspense>
      <OfflineIndicator />
      <InstallPrompt />
    </>
  );
};

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppInner />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
