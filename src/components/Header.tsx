import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Header() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md border-b border-border">
      <Link to="/" className="font-display text-2xl tracking-wider gradient-text">
        VEOSYNC
      </Link>
      
      <div className="flex items-center gap-2">
        <Link to="/billing">
          <Button variant="ghost" size="sm">
            <CreditCard className="h-4 w-4" />
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
