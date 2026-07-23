import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import DesktopApp from "./app/DesktopApp.tsx";
import "./styles/index.css";

// Wide screens get the desktop layout; phones keep the mobile mockup.
function Root() {
  const [wide, setWide] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 900 : true,
  );
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return wide ? <DesktopApp /> : <App />;
}

createRoot(document.getElementById("root")!).render(<Root />);
