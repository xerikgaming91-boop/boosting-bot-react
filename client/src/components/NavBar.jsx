import React from "react";
import { Link, NavLink } from "react-router-dom";
import useWhoAmI from "../hooks/useWhoAmI.js";

const linkBase =
  "px-3 py-2 rounded-md text-sm transition-colors hover:text-white hover:bg-slate-700/50";
const linkActive = "bg-slate-700/60 text-white";

export default function NavBar() {
  const { user, loading } = useWhoAmI();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-semibold tracking-wide">
          Lizzard Raidbot
        </Link>

        <nav className="flex items-center gap-1 text-slate-300">
          <NavLink to="/" end className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ""}`}>
            Raids
          </NavLink>
          <NavLink to="/myraids" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ""}`}>
            Meine Raids
          </NavLink>
          <NavLink to="/chars" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ""}`}>
            Chars
          </NavLink>
          <NavLink to="/users" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : ""}`}>
            Benutzer
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="text-slate-400 text-sm">…</div>
          ) : user ? (
            <>
              <span className="hidden sm:block text-slate-300 text-sm">@{user.username}</span>
              <a href="/logout" className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm">
                Logout
              </a>
            </>
          ) : (
            <a href="/login" className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-sm">
              Login
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
