import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import VyomOrb from "./VyomOrb";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex min-h-dvh items-center justify-center">
      <VyomOrb size={120} active />
    </div>
  );
  if (!user || !user.emailVerified) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};
