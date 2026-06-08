'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword as _createUserWithEmailAndPassword
} from 'firebase/auth';
import { getAuth as _getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import {
  collection, query, where, getDocs, doc, setDoc,
  onSnapshot, updateDoc, orderBy, addDoc, getDoc
} from 'firebase/firestore';
import styles from './admin.module.css';
import {
  Settings, BarChart3, Users, Clock, AlertTriangle,
  Download, LogOut, Building2, UserPlus, ArrowLeft, Plus, Link2, Eye
} from 'lucide-react';
import UserDirectory from '@/components/UserDirectory';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GERENTE_EMAIL   = 'b.alarconatenas@gmail.com';
const ADMIN_EMAIL     = 'contacto@asesoriapublica.cl';
const FUNC_EMAILS     = ['sanappchile@gmail.com', 'cvappchile@gmail.com'];

function getRoleForEmail(email: string): string | null {
  const e = email.toLowerCase();
  if (e === GERENTE_EMAIL) return 'gerente';
  if (e === ADMIN_EMAIL)   return 'admin';
  if (FUNC_EMAILS.includes(e)) return 'funcionario';
  return null;
}

function getNameForRole(role: string): string {
  if (role === 'gerente') return 'Gerente General';
  if (role === 'admin')   return 'Administrador Principal';
  return 'Funcionario';
}

/** Create a Firebase user WITHOUT signing out the current user.
 *  Uses a temporary secondary Firebase app instance. */
async function createUserSecondary(email: string, password: string) {
  const SECONDARY = 'filapp-secondary';
  const firebaseConfig = {
    apiKey: 'AIzaSyDFIOBb_k-WbutDSXyrcz4-MhEiZx0pmUE',
    authDomain: 'filapp-f5682.firebaseapp.com',
    projectId: 'filapp-f5682',
    storageBucket: 'filapp-f5682.firebasestorage.app',
    messagingSenderId: '913826262699',
    appId: '1:913826262699:web:35c51f954bf801c65bd1ee',
  };
  const secondaryApp = getApps().find(a => a.name === SECONDARY)
    || initializeApp(firebaseConfig, SECONDARY);
  const secondaryAuth = _getAuth(secondaryApp);
  const cred = await _createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;
  await signOut(secondaryAuth); // sign out from secondary only
  return uid;
}

function exportToCSV(filename: string, rows: any[]) {
  if (!rows?.length) { alert('No hay datos para exportar'); return; }
  const sep = ';';
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(sep),
    ...rows.map(row => keys.map(k => {
      let v = row[k] == null ? '' : String(row[k]).replace(/"/g, '""');
      if (/[";,\n]/.test(v)) v = `"${v}"`;
      return v;
    }).join(sep))
  ].join('\n');
  const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();

  // Auth
  const [session, setSession]           = useState<any>(null);
  const [userProfile, setUserProfile]   = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [authError, setAuthError]       = useState('');
  const [loginEmail, setLoginEmail]     = useState('');
  const [loginPass, setLoginPass]       = useState('');

  // View
  const [view, setView]                 = useState<'dashboard'|'detail'>('dashboard');

  // Dashboard data
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [allAdmins, setAllAdmins]       = useState<any[]>([]);

  // New institution form
  const [showInstForm, setShowInstForm] = useState(false);
  const [newInstName, setNewInstName]   = useState('');
  const [instSaving, setInstSaving]     = useState(false);

  // Institution detail
  const [institutionId,   setInstitutionId]   = useState<string|null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [tvName,          setTvName]          = useState('');
  const [logoUrl,         setLogoUrl]         = useState('');
  const [tvColor,         setTvColor]         = useState('#3b82f6');
  const [tvBg,            setTvBg]            = useState('');
  const [mensajeDia,      setMensajeDia]      = useState('');
  const [deptosStr,       setDeptosStr]       = useState('OIRS, Atención General');
  const [oirsDpto,        setOirsDpto]        = useState('OIRS');
  const [webhookUrl,      setWebhookUrl]      = useState('');
  const [resetLogs,       setResetLogs]       = useState<any[]>([]);
  const [savingConfig,    setSavingConfig]    = useState(false);
  const [stats, setStats] = useState({ enEspera:0, atendidosHoy:0, tEspera:0, tAtencion:0 });
  const [funcionarios,    setFuncionarios]    = useState<any[]>([]);

  // New user form
  const [funcEmail,   setFuncEmail]   = useState('');
  const [funcPass,    setFuncPass]    = useState('');
  const [funcNombre,  setFuncNombre]  = useState('');
  const [funcDepto,   setFuncDepto]   = useState('');
  const [funcCargo,   setFuncCargo]   = useState('');
  const [funcLetra,   setFuncLetra]   = useState('');
  const [funcMsg,     setFuncMsg]     = useState('');
  const [funcLoading, setFuncLoading] = useState(false);

  // ── Auth effect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setSession(user);
      if (!user) { setLoading(false); setUserProfile(null); return; }

      try {
        const email = user.email?.toLowerCase() ?? '';
        const forcedRole = getRoleForEmail(email);

        // Load or create Firestore profile
        const q    = query(collection(db, 'especialistas'), where('user_id', '==', user.uid));
        const snap = await getDocs(q);

        let profile: any = null;

        if (snap.empty) {
          // No profile yet — create one
          const role   = forcedRole ?? 'admin';
          const nombre = forcedRole ? getNameForRole(forcedRole) : 'Administrador';
          profile = { user_id: user.uid, role, nombre, email: user.email, estado_funcionario: 'activo' };
          await setDoc(doc(db, 'especialistas', user.uid), profile);
          profile.id = user.uid;
        } else {
          profile = { id: snap.docs[0].id, ...snap.docs[0].data() };

          // Enforce immutable roles for known emails
          if (forcedRole) {
            const expectedName = getNameForRole(forcedRole);
            if (profile.role !== forcedRole || profile.nombre !== expectedName) {
              await updateDoc(doc(db, 'especialistas', profile.id), { role: forcedRole, nombre: expectedName });
              profile.role   = forcedRole;
              profile.nombre = expectedName;
            }
          }
        }

        // Block funcionarios from this panel
        if (!['admin', 'gerente'].includes(profile.role)) {
          setAuthError('Acceso denegado. Este panel es solo para Administradores y Gerente.');
          await signOut(auth);
          setLoading(false);
          return;
        }

        setUserProfile(profile);
        await loadDashboard(user.uid, profile.role);
      } catch (err) {
        console.error(err);
        setAuthError('Error al cargar perfil. Intenta de nuevo.');
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Data loaders ─────────────────────────────────────────────────────────────
  const loadDashboard = async (uid: string, role: string) => {
    const adminSnap = await getDocs(query(collection(db, 'especialistas'), where('role', '==', 'admin')));
    setAllAdmins(adminSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    if (role === 'gerente') {
      const snap = await getDocs(collection(db, 'institutions'));
      setInstitutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } else {
      // Admin sees only their own institutions
      const snap = await getDocs(query(collection(db, 'institutions'), where('owner_id', '==', uid)));
      setInstitutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  };

  const loadFuncionarios = async (instId: string) => {
    const snap = await getDocs(query(collection(db, 'especialistas'), where('institution_id', '==', instId)));
    setFuncionarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  // Live stats when in detail view
  useEffect(() => {
    if (view !== 'detail' || !institutionId) return;
    const unsub = onSnapshot(collection(db, 'turnos'), () => fetchStats());
    fetchStats();
    return () => unsub();
  }, [view, institutionId]);

  const fetchStats = async () => {
    if (!institutionId) return;
    const [waitSnap, attSnap] = await Promise.all([
      getDocs(query(collection(db, 'turnos'), where('estado','==','espera'), where('institution_id','==',institutionId))),
      getDocs(query(collection(db, 'turnos'), where('estado','==','atendido'), where('institution_id','==',institutionId)))
    ]);
    let tE = 0, tA = 0, n = 0;
    attSnap.forEach(d => {
      const t = d.data();
      if (t.called_at && t.created_at)  tE += (new Date(t.called_at).getTime() - new Date(t.created_at).getTime()) / 60000;
      if (t.finished_at && t.called_at) tA += (new Date(t.finished_at).getTime() - new Date(t.called_at).getTime()) / 60000;
      n++;
    });
    setStats({ enEspera: waitSnap.size, atendidosHoy: attSnap.size, tEspera: n ? Math.round(tE/n) : 0, tAtencion: n ? Math.round(tA/n) : 0 });
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setAuthError('');
    try { await signInWithEmailAndPassword(auth, loginEmail, loginPass); }
    catch (err: any) { setAuthError('Credenciales incorrectas. Verifica tu correo y contraseña.'); setLoading(false); }
  };

  const handleLogout = async () => { await signOut(auth); router.push('/'); };

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstName.trim() || !userProfile) return;
    setInstSaving(true);
    try {
      const ref = await addDoc(collection(db, 'institutions'), {
        name: newInstName.trim(),
        owner_id: userProfile.user_id,
        owner_email: session.email,
        created_at: new Date().toISOString(),
        currentTurno: 0,
        config: { tv_name: newInstName.trim(), departamentos: ['OIRS','Atención General'], tv_primary_color: '#3b82f6' }
      });
      setNewInstName(''); setShowInstForm(false);
      await loadDashboard(userProfile.user_id, userProfile.role);
      alert(`✅ Institución creada con éxito.\nID: ${ref.id}`);
    } catch { alert('Error al crear institución'); }
    setInstSaving(false);
  };

  const openDetail = async (instId: string) => {
    setLoading(true);
    const snap = await getDoc(doc(db, 'institutions', instId));
    if (snap.exists()) {
      const d = snap.data();
      setInstitutionId(instId);
      setInstitutionName(d.name || '');
      setTvName(d.config?.tv_name || d.name || '');
      setLogoUrl(d.config?.logo_url || '');
      setTvColor(d.config?.tv_primary_color || '#3b82f6');
      setTvBg(d.config?.tv_background_url || '');
      setMensajeDia(d.config?.mensaje_dia || '');
      setDeptosStr((d.config?.departamentos || ['OIRS','Atención General']).join(', '));
      setOirsDpto(d.config?.oirs_departamento || 'OIRS');
      setWebhookUrl(d.config?.n8n_webhook_url || '');
      setResetLogs(d.reset_logs || []);
      await loadFuncionarios(instId);
      setView('detail');
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    if (!institutionId) return;
    setSavingConfig(true);
    await updateDoc(doc(db, 'institutions', institutionId), {
      config: {
        tv_name: tvName.trim() || institutionName,
        logo_url: logoUrl.trim(),
        tv_primary_color: tvColor,
        tv_background_url: tvBg.trim(),
        mensaje_dia: mensajeDia,
        departamentos: deptosStr.split(',').map(s => s.trim()).filter(Boolean),
        oirs_departamento: oirsDpto.trim(),
        n8n_webhook_url: webhookUrl.trim(),
      }
    });
    alert('✅ Configuración guardada');
    setSavingConfig(false);
  };

  const handleReiniciarConteo = async () => {
    if (!institutionId || !userProfile) return;
    if (!confirm('¿Reiniciar el conteo de tickets a 0?')) return;
    const ref = doc(db, 'institutions', institutionId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const logs = snap.data().reset_logs || [];
      const newLog = { nombre: userProfile.nombre, fecha: new Date().toISOString() };
      const updated = [newLog, ...logs].slice(0, 3);
      await updateDoc(ref, { currentTurno: 0, ultimo_reinicio: new Date().toISOString(), reset_logs: updated });
      setResetLogs(updated);
      alert('✅ Conteo reiniciado.');
    }
  };

  /** Register a new admin or funcionario WITHOUT losing current session */
  const handleRegisterUser = async (e: React.FormEvent, role: 'admin'|'funcionario') => {
    e.preventDefault();
    setFuncLoading(true); setFuncMsg('');
    try {
      // Create Firebase Auth user in secondary app (keeps current session alive)
      const newUid = await createUserSecondary(funcEmail, funcPass);

      await setDoc(doc(db, 'especialistas', newUid), {
        user_id: newUid,
        institution_id: role === 'funcionario' ? (institutionId || '') : '',
        role,
        nombre: funcNombre || (role === 'admin' ? 'Administrador' : 'Funcionario'),
        departamento: role === 'funcionario' ? funcDepto : 'Administración',
        cargo: funcCargo || (role === 'admin' ? 'Administrador' : 'Funcionario'),
        estado_funcionario: 'inactivo',
        avatar_url: '',
        letra_atencion: funcLetra || funcEmail.split('@')[0].substring(0,2).toUpperCase(),
        whatsapp_phone: '',
        whatsapp_apikey: '',
        email: funcEmail,
      });

      setFuncMsg(`✅ ${role === 'admin' ? 'Administrador' : 'Funcionario'} "${funcNombre}" registrado.`);
      setFuncEmail(''); setFuncPass(''); setFuncNombre(''); setFuncDepto(''); setFuncCargo(''); setFuncLetra('');

      if (role === 'funcionario' && institutionId) await loadFuncionarios(institutionId);
      else await loadDashboard(userProfile.user_id, userProfile.role);
    } catch (err: any) {
      setFuncMsg(`Error: ${err.message}`);
    }
    setFuncLoading(false);
  };

  const updateFuncionario = async (id: string, field: string, value: string) => {
    await updateDoc(doc(db, 'especialistas', id), { [field]: value });
    setFuncionarios(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  // ── Export helpers ───────────────────────────────────────────────────────────
  const exportUsuarios = async () => {
    if (!institutionId) return;
    const snap = await getDocs(query(collection(db, 'usuarios'), where('institution_id','==',institutionId)));
    exportToCSV(`usuarios_${institutionName}.csv`, snap.docs.map(d => ({ RUT: d.id, ...d.data() })));
  };

  const exportTurnos = async () => {
    if (!institutionId) return;
    const snap = await getDocs(query(collection(db,'turnos'), where('institution_id','==',institutionId), orderBy('created_at','desc')));
    exportToCSV(`turnos_${institutionName}.csv`, snap.docs.map(d => {
      const t = d.data();
      return { ID: d.id, Estado: t.estado, RUT: t.rut_usuario||'', Departamento: t.departamento_solicitado||'',
        Funcionario: t.nombre_funcionario||'', Modulo: t.letra_especialista||'',
        Creado: t.created_at ? new Date(t.created_at).toLocaleString() : '',
        Llamado: t.called_at ? new Date(t.called_at).toLocaleString() : '',
        Finalizado: t.finished_at ? new Date(t.finished_at).toLocaleString() : '' };
    }));
  };

  const exportFuncionarios = () => {
    exportToCSV(`funcionarios_${institutionName}.csv`, funcionarios.map(f => ({
      Nombre: f.nombre||'', Rol: f.role||'', Departamento: f.departamento||'',
      Cargo: f.cargo||'', Modulo: f.letra_atencion||'', Estado: f.estado_funcionario||'inactivo', Email: f.email||''
    })));
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading && !session) return <div className={styles.centerLoad}>Cargando entorno...</div>;

  if (!session) {
    return (
      <main className={styles.authContainer}>
        <form onSubmit={handleLogin} className={styles.authCard}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <Settings size={40} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
            <h2>Acceso al Panel</h2>
            <p>Ingresa con tus credenciales de Gerente o Administrador.</p>
          </div>
          {authError && <div className={styles.errorBanner}>{authError}</div>}
          <div className={styles.inputGroup}>
            <label>Correo Electrónico</label>
            <input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required autoFocus />
          </div>
          <div className={styles.inputGroup}>
            <label>Contraseña</label>
            <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required />
          </div>
          <button type="submit" className={styles.primaryBtn} disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </main>
    );
  }

  if (authError) {
    return (
      <div className={styles.centerLoad} style={{ flexDirection: 'column', gap: '1rem' }}>
        <AlertTriangle size={40} color="var(--destructive)" />
        <p>{authError}</p>
        <button className={styles.primaryBtn} onClick={() => { setAuthError(''); setSession(null); router.push('/admin'); }}>Volver al Login</button>
      </div>
    );
  }

  if (loading) return <div className={styles.centerLoad}>Cargando...</div>;

  const deptosList = deptosStr.split(',').map(s => s.trim()).filter(Boolean);

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className={styles.adminContainer}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Settings size={26} />
          <div>
            <h1>{userProfile?.role === 'gerente' ? '🏛️ Panel Gerencial' : '⚙️ Panel de Administración'}</h1>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {userProfile?.nombre} · {session?.email}
            </span>
          </div>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </header>

      <main className={styles.content}>

        {/* ─── DASHBOARD ─────────────────────────────────────────────────────── */}
        {view === 'dashboard' && (
          <div>
            {/* Institutions */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <h2>Mis Instituciones ({institutions.length}{userProfile?.role !== 'gerente' ? '/50' : ''})</h2>
              {(userProfile?.role === 'gerente' || institutions.length < 50) && (
                <button className={styles.primaryBtn} onClick={() => setShowInstForm(!showInstForm)} style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                  <Plus size={16} /> Nueva Institución
                </button>
              )}
            </div>

            {showInstForm && (
              <form onSubmit={handleCreateInstitution} className={styles.configSection} style={{ marginBottom:'1.5rem', display:'flex', gap:'1rem', alignItems:'flex-end' }}>
                <div className={styles.formGroup} style={{ flex:1, margin:0 }}>
                  <label>Nombre de la Institución</label>
                  <input type="text" value={newInstName} onChange={e=>setNewInstName(e.target.value)} placeholder="Ej: CESFAM Norte" required autoFocus />
                </div>
                <button type="submit" className={styles.primaryBtn} disabled={instSaving}>
                  {instSaving ? 'Creando...' : 'Guardar'}
                </button>
                <button type="button" className={styles.logoutBtn} onClick={() => setShowInstForm(false)}>Cancelar</button>
              </form>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:'1.5rem', marginBottom:'3rem' }}>
              {institutions.length === 0 ? (
                <p style={{ color:'var(--text-secondary)', gridColumn:'1/-1' }}>
                  No hay instituciones creadas aún. Usa el botón de arriba para crear la primera.
                </p>
              ) : institutions.map(inst => (
                <div key={inst.id} className={styles.configSection} style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1.5rem', cursor:'default' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
                    <Building2 size={32} color={inst.config?.tv_primary_color || 'var(--primary)'} />
                    <div>
                      <h3 style={{ margin:0, fontSize:'1.15rem' }}>{inst.name}</h3>
                      <small style={{ color:'var(--text-secondary)' }}>
                        {inst.config?.departamentos?.length || 0} categorías
                      </small>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                    <button onClick={() => openDetail(inst.id)} className={styles.primaryBtn} style={{ flex:1, padding:'0.5rem', fontSize:'0.85rem', display:'flex', gap:'0.4rem', alignItems:'center', justifyContent:'center' }}>
                      <Settings size={14} /> Gestionar
                    </button>
                    <button onClick={() => window.open(`/tv?institution=${inst.id}`, '_blank')} className={styles.primaryBtn} style={{ padding:'0.5rem 0.8rem', fontSize:'0.85rem', background:'#059669', display:'flex', gap:'0.4rem', alignItems:'center' }}>
                      <Eye size={14} /> TV
                    </button>
                    <button onClick={async() => {
                      const snap = await getDocs(query(collection(db,'usuarios'), where('institution_id','==',inst.id)));
                      exportToCSV(`bd_${inst.name}.csv`, snap.docs.map(d=>({ RUT:d.id, ...d.data() })));
                    }} className={styles.exportBtn} style={{ padding:'0.5rem 0.8rem', fontSize:'0.85rem', display:'flex', gap:'0.4rem', alignItems:'center' }}>
                      <Download size={14} /> BD
                    </button>
                  </div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <Link2 size={12} />
                    <span style={{ fontFamily:'monospace', wordBreak:'break-all' }}>/tv?institution={inst.id}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Create Admin section — only for Gerente */}
            {userProfile?.role === 'gerente' && (
              <section className={styles.configSection}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1rem' }}>
                  <UserPlus size={20} />
                  <h2 style={{ margin:0 }}>Registrar Nuevo Administrador</h2>
                </div>
                <p style={{ color:'var(--text-secondary)', marginBottom:'1.5rem', fontSize:'0.9rem' }}>
                  Los administradores podrán crear sus propias instituciones y gestionar sus funcionarios.
                </p>
                <form onSubmit={e => handleRegisterUser(e, 'admin')} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                  {funcMsg && <div className={funcMsg.startsWith('Error') ? styles.errorBanner : styles.successBanner}>{funcMsg}</div>}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                    <div className={styles.formGroup}>
                      <label>Nombre Completo</label>
                      <input type="text" value={funcNombre} onChange={e=>setFuncNombre(e.target.value)} placeholder="Ej: Juan Pérez" required />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Correo Electrónico</label>
                      <input type="email" value={funcEmail} onChange={e=>setFuncEmail(e.target.value)} placeholder="admin@municipio.cl" required />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Contraseña Temporal</label>
                      <input type="password" value={funcPass} onChange={e=>setFuncPass(e.target.value)} minLength={6} required />
                    </div>
                  </div>
                  <button type="submit" className={styles.primaryBtn} disabled={funcLoading}>
                    {funcLoading ? 'Registrando...' : 'Registrar Administrador'}
                  </button>
                </form>

                <h3 style={{ marginTop:'2rem', marginBottom:'1rem', fontSize:'1rem' }}>Administradores Registrados</h3>
                <table className={styles.table}>
                  <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th></tr></thead>
                  <tbody>
                    {allAdmins.map(a => (
                      <tr key={a.id}>
                        <td>{a.nombre}</td>
                        <td>{a.email || '—'}</td>
                        <td><span className={styles.roleChip} data-role={a.role}>{a.role}</span></td>
                      </tr>
                    ))}
                    {allAdmins.length === 0 && <tr><td colSpan={3} style={{ color:'var(--text-secondary)' }}>Sin administradores registrados.</td></tr>}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

        {/* ─── DETAIL VIEW ───────────────────────────────────────────────────── */}
        {view === 'detail' && (
          <div>
            <button className={styles.exportBtn} onClick={() => setView('dashboard')} style={{ marginBottom:'1.5rem', border:'none', background:'transparent', padding:0, color:'var(--primary)', display:'flex', gap:'0.4rem', alignItems:'center' }}>
              <ArrowLeft size={16} /> Volver al Dashboard
            </button>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem' }}>
              <h1 style={{ fontSize:'2rem' }}>{institutionName}</h1>
              <div style={{ display:'flex', gap:'0.75rem' }}>
                <button onClick={() => window.open(`/tv?institution=${institutionId}`, '_blank')} className={styles.primaryBtn} style={{ background:'#059669', display:'flex', gap:'0.4rem', alignItems:'center' }}>
                  <Eye size={16} /> Ver Pantalla TV
                </button>
                <button onClick={() => navigator.clipboard.writeText(`${location.origin}/tv?institution=${institutionId}`)} className={styles.exportBtn} style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
                  <Link2 size={16} /> Copiar URL TV
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <section className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}><span>En Espera</span><Users color="var(--primary)" /></div>
                <div className={styles.kpiValue}>{stats.enEspera}</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}><span>Atendidos Hoy</span><BarChart3 color="var(--success)" /></div>
                <div className={styles.kpiValue}>{stats.atendidosHoy}</div>
              </div>
              <div className={`${styles.kpiCard} ${stats.tEspera > 15 ? styles.kpiWarning : ''}`}>
                <div className={styles.kpiHeader}><span>T. Espera Promedio (SLA)</span><Clock /></div>
                <div className={styles.kpiValue}>{stats.tEspera} min</div>
                {stats.tEspera > 15 && <div className={styles.warningAlert}><AlertTriangle size={14}/> SLA Excedido</div>}
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}><span>T. Atención Promedio</span><Clock color="var(--accent)" /></div>
                <div className={styles.kpiValue}>{stats.tAtencion} min</div>
              </div>
            </section>

            {/* Reset counter */}
            <div style={{ background:'rgba(220,38,38,.05)', border:'1px solid rgba(220,38,38,.2)', padding:'1.5rem', borderRadius:'16px', marginBottom:'2rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <h3 style={{ color:'var(--destructive)', display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.5rem' }}><AlertTriangle size={20}/> Reinicio Manual de Conteo</h3>
                <p style={{ color:'var(--text-secondary)', fontSize:'0.9rem', margin:0 }}>Pone el contador de tickets en 0. Úsalo solo en errores de apertura.</p>
                {resetLogs.length > 0 && (
                  <ul style={{ margin:'0.5rem 0 0 1.2rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>
                    {resetLogs.map((l,i) => <li key={i}>{l.nombre} — {new Date(l.fecha).toLocaleString()}</li>)}
                  </ul>
                )}
              </div>
              <button onClick={handleReiniciarConteo} style={{ background:'var(--destructive)', color:'white', padding:'0.6rem 1.2rem', borderRadius:'8px', border:'none', cursor:'pointer', fontWeight:'bold', whiteSpace:'nowrap' }}>
                Reiniciar a 0
              </button>
            </div>

            <div className={styles.bottomGrid}>
              {/* Config */}
              <section className={styles.configSection}>
                <h2>⚙️ Configuración de Pantalla TV</h2>
                <div className={styles.formGroup}>
                  <label>Nombre en TV</label>
                  <input value={tvName} onChange={e=>setTvName(e.target.value)} placeholder="Ej: CESFAM Dr. Barros Luco" />
                </div>
                <div className={styles.formGroup}>
                  <label>URL del Logo</label>
                  <input value={logoUrl} onChange={e=>setLogoUrl(e.target.value)} placeholder="https://tu-institucion.cl/logo.png" />
                </div>
                <div className={styles.formGroup}>
                  <label>Color Primario</label>
                  <div style={{ display:'flex', gap:'0.75rem', alignItems:'center' }}>
                    <input type="color" value={tvColor} onChange={e=>setTvColor(e.target.value)} style={{ width:44, height:44, padding:2, cursor:'pointer', border:'1px solid var(--border-color)', borderRadius:8 }} />
                    <input value={tvColor} onChange={e=>setTvColor(e.target.value)} style={{ flex:1 }} />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label>URL Fondo Personalizado (TV)</label>
                  <input value={tvBg} onChange={e=>setTvBg(e.target.value)} placeholder="Dejar vacío para usar fondo oscuro" />
                </div>
                <div className={styles.formGroup}>
                  <label>Mensaje del Día</label>
                  <textarea rows={2} value={mensajeDia} onChange={e=>setMensajeDia(e.target.value)} placeholder="Escribe el mensaje desplazable de la TV..." />
                </div>
                <div className={styles.formGroup}>
                  <label>Categorías / Departamentos (separados por coma)</label>
                  <textarea rows={5} value={deptosStr} onChange={e=>setDeptosStr(e.target.value)} placeholder="OIRS, DIDECO, Atención General, ..." />
                </div>
                <div className={styles.formGroup}>
                  <label>Departamento OIRS (Orientación)</label>
                  <input value={oirsDpto} onChange={e=>setOirsDpto(e.target.value)} placeholder="OIRS" />
                </div>
                <div className={styles.formGroup}>
                  <label>Webhook n8n (Opcional)</label>
                  <input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} placeholder="https://n8n.tu-servidor.com/webhook/..." />
                </div>
                <button className={styles.primaryBtn} onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? 'Guardando...' : '💾 Guardar Configuración'}
                </button>
              </section>

              {/* Register Funcionario */}
              <section className={styles.configSection}>
                <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'1rem' }}>
                  <UserPlus size={20}/><h2 style={{ margin:0 }}>👤 Registrar Funcionario</h2>
                </div>
                <form onSubmit={e => handleRegisterUser(e, 'funcionario')} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                  {funcMsg && <div className={funcMsg.startsWith('Error') ? styles.errorBanner : styles.successBanner}>{funcMsg}</div>}
                  <div className={styles.formGroup}>
                    <label>Nombre Completo</label>
                    <input value={funcNombre} onChange={e=>setFuncNombre(e.target.value)} placeholder="María García" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Correo Electrónico</label>
                    <input type="email" value={funcEmail} onChange={e=>setFuncEmail(e.target.value)} placeholder="funcionario@municipio.cl" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Contraseña Temporal</label>
                    <input type="password" value={funcPass} onChange={e=>setFuncPass(e.target.value)} minLength={6} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Categoría asignada</label>
                    <select value={funcDepto} onChange={e=>setFuncDepto(e.target.value)} required style={{ padding:'var(--spacing-3)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-md)', background:'var(--surface-hover)', color:'var(--text-primary)' }}>
                      <option value="">Seleccionar...</option>
                      {deptosList.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Cargo</label>
                    <input value={funcCargo} onChange={e=>setFuncCargo(e.target.value)} placeholder="Ej: Psicólogo, Asistente Social" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Módulo / Letra</label>
                    <input value={funcLetra} onChange={e=>setFuncLetra(e.target.value)} placeholder="Ej: A, B, Box 1" />
                  </div>
                  <button type="submit" className={styles.primaryBtn} disabled={funcLoading}>
                    {funcLoading ? 'Registrando...' : 'Registrar Funcionario'}
                  </button>
                </form>
              </section>
            </div>

            {/* User Directory */}
            <section className={styles.chartSection} style={{ marginTop:'2rem' }}>
              <UserDirectory
                institutionId={institutionId || ''}
                funcionarioId={userProfile.user_id}
                funcionarioName={userProfile.nombre}
                role={userProfile.role}
              />
            </section>

            {/* Funcionarios Table */}
            <section className={styles.chartSection} style={{ marginTop:'2rem' }}>
              <h2>👥 Funcionarios de la Institución</h2>
              {deptosList.map(depto => {
                const funcs = funcionarios.filter(f => f.departamento === depto);
                return (
                  <div key={depto} className={styles.deptoGroup}>
                    <h3 className={styles.deptoTitle}>{depto}</h3>
                    <table className={styles.table}>
                      <thead><tr><th>Perfil</th><th>Nombre</th><th>Cargo</th><th>Módulo</th><th>Estado</th></tr></thead>
                      <tbody>
                        {funcs.map(f => (
                          <tr key={f.id}>
                            <td>
                              <div className={styles.adminProfileCell}>
                                <div className={styles.adminAvatarWrapper}>
                                  {f.avatar_url ? <img src={f.avatar_url} alt="" className={styles.adminAvatarImg}/> : <div className={styles.adminAvatarPlaceholder}>{f.nombre?.substring(0,2).toUpperCase()||'FN'}</div>}
                                </div>
                                <span className={styles.statusDot} data-status={f.estado_funcionario||'inactivo'}/>
                              </div>
                            </td>
                            <td><input className={styles.tableInput} value={f.nombre||''} onChange={e=>updateFuncionario(f.id,'nombre',e.target.value)}/></td>
                            <td><input className={styles.tableInput} value={f.cargo||''} onChange={e=>updateFuncionario(f.id,'cargo',e.target.value)}/></td>
                            <td><input className={styles.tableInput} value={f.letra_atencion||''} onChange={e=>updateFuncionario(f.id,'letra_atencion',e.target.value)}/></td>
                            <td><span className={styles.roleChip} data-role={f.estado_funcionario==='activo'?'admin':'funcionario'}>{f.estado_funcionario||'inactivo'}</span></td>
                          </tr>
                        ))}
                        {funcs.length===0 && <tr><td colSpan={5} style={{color:'var(--text-secondary)'}}>Sin funcionarios asignados.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>

            {/* Export */}
            <section className={styles.exportSection}>
              <h2>📊 Reportes y Exportación</h2>
              <div className={styles.exportGroup}>
                <button className={styles.exportBtn} onClick={exportUsuarios}><Download size={18}/> Usuarios (CSV)</button>
                <button className={styles.exportBtn} onClick={exportTurnos}><Download size={18}/> Turnos (CSV)</button>
                <button className={styles.exportBtn} onClick={exportFuncionarios}><Download size={18}/> Funcionarios (CSV)</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
