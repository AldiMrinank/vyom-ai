import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import VyomOrb from "./VyomOrb";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="flex min-h-dvh items-center justify-center bg-[#080810]">
      <VyomOrb size={100} active />
    </div>
  );

  // Removed emailVerified check — it was blocking email/password users
  // who hadn't verified email but are legitimately signed in.
  if (!user) return <Navigate to="/auth" replace />;

  return <>{children}</>;
};
