import { LocaleProvider } from "./i18n/context";
import { AuthGate } from "./auth/AuthGate";

export function App() {
  return (
    <LocaleProvider>
      <AuthGate />
    </LocaleProvider>
  );
}
