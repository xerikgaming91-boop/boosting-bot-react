import React from 'react'

export default function Admin(){
  const [user, setUser] = React.useState(null)
  const [raids, setRaids] = React.useState([])
  const [rid, setRid] = React.useState('')
  const [signups, setSignups] = React.useState([])

  React.useEffect(()=>{
    fetch('/api/whoami',{credentials:'include'}).then(r=>r.json()).then(d=>{
      setUser(d.user||null)
      if(d.user?.is_raidlead){
        fetch('/api/raids',{credentials:'include'}).then(r=>r.json()).then(j=>{
          setRaids(j.data||[])
          if(j.data?.[0]) setRid(j.data[0].id)
        })
      }
    })
  },[])

  React.useEffect(()=>{
    if(!rid) return
    fetch(`/api/raids/${rid}/signups`,{credentials:'include'})
      .then(r=>r.json()).then(j=>setSignups(j.data||[])).catch(()=>setSignups([]))
  },[rid])

  const togglePick = async (sid)=>{
    await fetch(`/api/signups/${sid}/toggle-picked`,{
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ raid_id: rid })
    })
    const j = await fetch(`/api/raids/${rid}/signups`,{credentials:'include'}).then(r=>r.json())
    setSignups(j.data||[])
  }

  const publish = async ()=>{
    await fetch(`/api/raids/${rid}/roster/publish`,{method:'POST',credentials:'include'})
  }

  if (!user) return <p>Bitte <a href="/login">einloggen</a>.</p>
  if (!user.is_raidlead) return <p>Keine Raidlead-Berechtigung.</p>

  return (
    <div>
      <h1>Admin</h1>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <span>Raid:</span>
        <select value={rid} onChange={e=>setRid(e.target.value)}>
          {raids.map(r => <option key={r.id} value={r.id}>{r.title} — {r.datetime}</option>)}
        </select>
        <button onClick={publish} disabled={!rid}>Roster veröffentlichen</button>
      </div>

      <table style={{marginTop:16, width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={{textAlign:'left'}}>User</th>
            <th style={{textAlign:'left'}}>Char</th>
            <th>Rolle</th>
            <th>Main/Alt</th>
            <th>Gepickt</th>
          </tr>
        </thead>
        <tbody>
          {signups.map(s=>(
            <tr key={s.id}>
              <td>{s.user_id}</td>
              <td>{s.char_name} {s.char_spec?`(${s.char_spec})`:''} {s.char_ilvl?`• ilvl ${s.char_ilvl}`:''}</td>
              <td>{s.slot?.toUpperCase()||'—'}</td>
              <td>{s.role||'—'}</td>
              <td>
                <input type="checkbox" checked={!!s.picked} onChange={()=>togglePick(s.id)} />
              </td>
            </tr>
          ))}
          {!signups.length && (
            <tr><td colSpan="5" style={{opacity:.7}}>Keine Anmeldungen.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
