import { AuthProvider } from "@/store/auth";
import { AppProvider } from "@/store/app";
import { AppRouter } from "@/router";
import { ErrorBoundary } from "@/components/business";

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
      </AppProvider>
    </AuthProvider>
  );
}
