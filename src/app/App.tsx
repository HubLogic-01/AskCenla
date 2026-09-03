import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './providers/AuthProvider';
import { DataProvider } from './providers/DataProvider';
import { AppRoutes } from './router';

/**
 * Provider order matters: DataProvider holds marketplace records, AuthProvider
 * decides who is looking at them, and the router renders the right screen.
 */
export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </DataProvider>
    </BrowserRouter>
  );
}
