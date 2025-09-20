import React from 'react'
import useWhoAmI from '../hooks/useWhoAmI.js'
import { Link } from 'react-router-dom'

export default function Home(){
  const { user } = useWhoAmI()
  return (
    <div className="container">
      <div className="card">
        <h2>Willkommen {user ? user.username : ''}</h2>
        <ul>
          <li><Link to="/characters">Meine Charaktere</Link> – Auto-Import via Raider.IO</li>
          {user?.is_raidlead && <li><Link to="/admin/raids">Admin</Link> – Raids verwalten</li>}
          {!user && <li><a href="/login">Login mit Discord</a></li>}
        </ul>
      </div>
    </div>
  )
}
