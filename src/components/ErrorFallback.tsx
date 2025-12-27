import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
        </div>
        
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Something went wrong
        </h1>
        
        <p className="mb-6 text-muted-foreground">
          We encountered an unexpected error. Please try again.
        </p>
        
        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 rounded-lg bg-muted p-4 text-left">
            <summary className="cursor-pointer font-medium text-foreground">
              Error details
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
              {error.message}
              {error.stack && (
                <>
                  {'\n\n'}
                  {error.stack}
                </>
              )}
            </pre>
          </details>
        )}
        
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            onClick={resetErrorBoundary}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
        </div>
      </div>
    </div>
  );
}
