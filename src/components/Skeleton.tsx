import { cn } from "@/lib/utils";
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-xl bg-white/5", className)} />
);
export default Skeleton;
