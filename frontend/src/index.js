import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { Auth0Provider } from "@auth0/auth0-react";

const auth0Domain = process.env.REACT_APP_AUTH0_DOMAIN;
const auth0ClientId = process.env.REACT_APP_AUTH0_CLIENT_ID;
const auth0Audience = process.env.REACT_APP_AUTH0_AUDIENCE;

if (!auth0Domain || !auth0ClientId) {
  throw new Error(
    "Missing Auth0 frontend environment variables. Please set REACT_APP_AUTH0_DOMAIN and REACT_APP_AUTH0_CLIENT_ID."
  );
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    })
    .catch((error) => {
      console.warn("Service worker cleanup failed:", error);
    });
}

if ("caches" in window) {
  caches
    .keys()
    .then((cacheNames) => {
      cacheNames.forEach((cacheName) => caches.delete(cacheName));
    })
    .catch((error) => {
      console.warn("Cache storage cleanup failed:", error);
    });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(auth0Audience ? { audience: auth0Audience } : {}),
      }}
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>,
);
