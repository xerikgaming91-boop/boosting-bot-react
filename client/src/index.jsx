import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles.css";

import Raids from "./pages/Raids";
import RaidDetail from "./pages/RaidDetail";
import MyRaids from "./pages/MyRaids";
import Chars from "./pages/Chars";
import Users from "./pages/Users";
import LoginRequired from "./pages/LoginRequired";

function NotFound() {
  return (
    <div className="page-wrap">
      <div className="card" style={{maxWidth:680, margin:"40px auto"}}>
        <h2>Seite nicht gefunden</h2>
        <a className="btn" href="/raids">Zurück zu Raids</a>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/raids" replace />} />
        <Route path="/raids" element={<Raids />} />
        <Route path="/raids/:id" element={<RaidDetail />} />
        <Route path="/myraids" element={<MyRaids />} />
        <Route path="/chars" element={<Chars />} />
        <Route path="/users" element={<Users />} />
        <Route path="/please-login" element={<LoginRequired />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
