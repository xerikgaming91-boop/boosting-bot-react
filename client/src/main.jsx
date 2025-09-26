// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import AppShell from "./components/AppShell.jsx";
import Raids from "./pages/Raids.jsx";
import MyRaids from "./pages/MyRaids.jsx";
import Users from "./pages/Users.jsx";
import RaidDetail from "./pages/RaidDetail.jsx";
import Chars from "./pages/Chars.jsx";

// 🔹 NEU: Seite zum Erstellen/Verwalten eigener Presets
import Presets from "./pages/Presets.jsx";

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Raids />} />
        <Route path="/myraids" element={<MyRaids />} />
        <Route path="/chars" element={<Chars />} />
        <Route path="/users" element={<Users />} />
        <Route path="/raids/:id" element={<RaidDetail />} />
        {/* 🔹 NEU: eigene Preset-Seite */}
        <Route path="/presets" element={<Presets />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
