import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import { DataProvider } from './providers/DataProvider';
import { AppRoutes } from './router';

/**
 * Provider order matters. AuthProvider must be OUTSIDE DataProvider: the data
 * layer loads whatever the signed-in user is allowed to see, so it needs to
 * know who that is, and it reloads when they change.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <AppRoutes />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
