import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { AppLayout } from '@/components/layout/AppLayout';
import { Home } from '@/pages/Home';
import { BookletHub } from '@/pages/BookletHub';
import { PageEditor } from '@/pages/PageEditor';
import { ReorderPages } from '@/pages/ReorderPages';
import { ExportBooklet } from '@/pages/ExportBooklet';
import { StampsLibrary } from '@/pages/StampsLibrary';
import { BackupRestore } from '@/pages/BackupRestore';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/booklet/:id" component={BookletHub} />
        <Route path="/booklet/:bookletId/page/:pageId" component={PageEditor} />
        <Route path="/booklet/:id/order" component={ReorderPages} />
        <Route path="/booklet/:id/export" component={ExportBooklet} />
        <Route path="/stamps" component={StampsLibrary} />
        <Route path="/backup" component={BackupRestore} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;