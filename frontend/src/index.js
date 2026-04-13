import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { Auth0Provider } from "@auth0/auth0-react";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Auth0Provider
      domain="dev-w5j37yv1j86kbn4x.us.auth0.com"
      clientId="WRdUax7wXbSmnvA48mky8Bh5FF7GU3Cd"
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: "https://mariso-api",
      }}
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>,
);
