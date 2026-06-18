import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Note: this app has its own ThemeContext (src/context/ThemeContext.tsx) and
// is dark-by-default; we don't use next-themes here, so we read the app's
// own theme class on <html> instead of pulling in an extra dependency just
// to ask "system" every time (next-themes' useTheme() was never wired to a
// provider in this app, so it always returned the default anyway).
const Toaster = ({ ...props }: ToasterProps) => {
  const isLight = typeof document !== "undefined" && document.documentElement.classList.contains("light-mode");

  return (
    <Sonner
      theme={isLight ? "light" : "dark"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
