import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <div className="w-full rounded-xl border bg-card/80 p-8 shadow-card backdrop-blur-sm animate-fade-in">
          <h1 className="font-display text-4xl font-semibold tracking-tight">404</h1>
          <p className="mt-2 text-muted-foreground">This page doesn’t exist. Let’s get you back to safety.</p>
          <a href="/" className="mt-6 inline-flex text-primary underline underline-offset-4 hover:opacity-90">
            Return to Home
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
