import "stash-ui/dist/src/index.css";
import "stash-ui/dist/theme-variables.css";
import "./styles/globals.scss";
import "./helpers/renderDebugger";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";

import { ApolloProvider } from "@apollo/client";
import { getApolloClient } from "./hooks/getApolloClient";


createRoot(document.getElementById("app")!).render(
    <ApolloProvider client={getApolloClient()}>
        <App />
    </ApolloProvider>
);
