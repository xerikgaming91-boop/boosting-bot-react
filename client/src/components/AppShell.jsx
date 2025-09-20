import React from "react";
import NavBar from "./NavBar.jsx";

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
