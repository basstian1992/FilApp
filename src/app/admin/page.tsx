'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword as _createUserWithEmailAndPassword
} from 'firebase/auth';
import { getAuth as _getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import {
  collection, query, where, getDocs, doc, setDoc,
  onSnapshot, updateDoc, orderBy, addDoc, getDoc, deleteDoc
} from 'firebase/firestore';
import styles from './admin.module.css';
import {
  Settings, BarChart3, Users, Clock, AlertTriangle,
  Download, LogOut, Building2, UserPlus, ArrowLeft, Plus,
  Link2, Eye, Shield, UserCog, ChevronRight, Monitor,
  Tablet, LayoutDashboard, FileText, PlusCircle, Trash2, CheckCircle
} from 'lucide-react';
import UserDirectory from '@/components/UserDirectory';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const GERENTE_EMAILS = ['b.alarconatenas@gmail.com', 'contacto@asesoriapublica.cl'];

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
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function createUserSecondary(email: string, password: string) {
  const SECONDARY = 'filapp-secondary';
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDFIOBb_k-WbutDSXyrcz4-MhEiZx0pmUE',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'filapp-f5682.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'filapp-f5682',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'filapp-f5682.firebasestorage.app',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '913826262699',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:913826262699:web:35c51f954bf801c65bd1ee',
  };
  const secondaryApp = getApps().find(a => a.name === SECONDARY)
    || initializeApp(firebaseConfig, SECONDARY);
  const secondaryAuth = _getAuth(secondaryApp);
  const cred = await _createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;
  await signOut(secondaryAuth);
  return uid;
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type AdminTab = 'dashboard' | 'config' | 'funcionarios' | 'directorio' | 'reportes';
type GerenteTab = 'instituciones' | 'administradores' | 'reportes';

/* ─── Component ──────────────────────────────────────────────────────────────── */
export default function AdminPage() {
  const router = useRouter();

  // Auth
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // View state
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [activeGerenteTab, setActiveGerenteTab] = useState<GerenteTab>('instituciones');

  // Dashboard data
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [allAdmins, setAllAdmins] = useState<any[]>([]);

  // New institution form
  const [showInstForm, setShowInstForm] = useState(false);
  const [newInstName, setNewInstName] = useState('');
  const [instSaving, setInstSaving] = useState(false);

  // Institution detail
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [tvName, setTvName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [tvColor, setTvColor] = useState('#3b82f6');
  const [tvBg, setTvBg] = useState('');
  const [mensajeDia, setMensajeDia] = useState('');
  const [deptosStr, setDeptosStr] = useState('OIRS, Atención General');
  const [oirsDpto, setOirsDpto] = useState('OIRS');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [resetLogs, setResetLogs] = useState<any[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [stats, setStats] = useState({ enEspera: 0, atendidosHoy: 0, tEspera: 0, tAtencion: 0 });
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [pendingFuncionarios, setPendingFuncionarios] = useState<any[]>([]);

  // New user form
  const [funcEmail, setFuncEmail] = useState('');
  const [funcPass, setFuncPass] = useState('');
  const [funcNombre, setFuncNombre] = useState('');
  const [funcDepto, setFuncDepto] = useState('');
  const [funcCargo, setFuncCargo] = useState('');
  const [funcLetra, setFuncLetra] = useState('');
  const [funcInstId, setFuncInstId] = useState(''); // institution to assign to new admin
  const [funcMsg, setFuncMsg] = useState('');
  const [funcLoading, setFuncLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  /* ── Auth effect ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/'); return; }
      setSession(user);
      try {
        const q = query(collection(db, 'especialistas'), where('user_id', '==', user.uid));
        const snap = await getDocs(q);
        if (snap.empty) { router.replace('/'); return; }
        const profile = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
        if (GERENTE_EMAILS.includes(user.email?.toLowerCase() || '')) profile.role = 'gerente';
        if (!['admin', 'gerente'].includes(profile.role)) { await signOut(auth); router.replace('/'); return; }
        if (profile.estado_funcionario === 'pendiente') { await signOut(auth); router.replace('/'); return; }
        setUserProfile(profile);
        await loadDashboard(user.uid, profile.role, profile);
      } catch (err) {
        console.error(err);
        router.replace('/');
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* ── Data loaders ─────────────────────────────────────────────────────────── */
  const loadDashboard = async (uid: string, role: string, profile?: any) => {
    const adminSnap = await getDocs(query(collection(db, 'especialistas'), where('role', '==', 'admin')));
    setAllAdmins(adminSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    if (role === 'gerente') {
      const snap = await getDocs(collection(db, 'institutions'));
      setInstitutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } else {
      const snap = await getDocs(query(collection(db, 'institutions'), where('owner_id', '==', uid)));
      const ownInsts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInstitutions(ownInsts);
      if (ownInsts.length > 0) await openDetail(ownInsts[0].id);
    }
  };

  const loadFuncionarios = async (instId: string) => {
    const snap = await getDocs(query(collection(db, 'especialistas'), where('institution_id', '==', instId)));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const staff = all.filter((f: any) => f.role === 'funcionario');
    setFuncionarios(staff.filter((f: any) => f.estado_funcionario !== 'pendiente'));
    setPendingFuncionarios(staff.filter((f: any) => f.estado_funcionario === 'pendiente'));
  };

  // Live stats — scoped to current institution only
  useEffect(() => {
    if (!institutionId) return;
    fetchStats();
    const unsub = onSnapshot(
      query(collection(db, 'turnos'), where('institution_id', '==', institutionId)),
      () => fetchStats()
    );
    return () => unsub();
  }, [institutionId]);

  const fetchStats = async () => {
    if (!institutionId) return;
    const [waitSnap, attSnap] = await Promise.all([
      getDocs(query(collection(db, 'turnos'), where('estado', '==', 'espera'), where('institution_id', '==', institutionId))),
      getDocs(query(collection(db, 'turnos'), where('estado', '==', 'atendido'), where('institution_id', '==', institutionId)))
    ]);
    let tE = 0, tA = 0, n = 0;
    attSnap.forEach(d => {
      const t = d.data();
      if (t.called_at && t.created_at)   tE += (new Date(t.called_at).getTime() - new Date(t.created_at).getTime()) / 60000;
      if (t.finished_at && t.called_at)  tA += (new Date(t.finished_at).getTime() - new Date(t.called_at).getTime()) / 60000;
      n++;
    });
    setStats({ enEspera: waitSnap.size, atendidosHoy: attSnap.size, tEspera: n ? Math.round(tE / n) : 0, tAtencion: n ? Math.round(tA / n) : 0 });
  };

  /* ── Actions ─────────────────────────────────────────────────────────────── */
  const handleLogout = async () => { await signOut(auth); router.push('/'); };

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstName.trim() || !userProfile) return;
    setInstSaving(true);
    const isGte = userProfile.role === 'gerente';
    try {
      const ref = await addDoc(collection(db, 'institutions'), {
        name: newInstName.trim(),
        // Gerente creates unowned institutions; only admins own institutions
        owner_id: isGte ? '' : userProfile.user_id,
        owner_email: isGte ? '' : session.email,
        created_at: new Date().toISOString(),
        currentTurno: 0,
        estado: 'activa',
        config: {
          tv_name: newInstName.trim(),
          departamentos: ['OIRS', 'Atención General'],
          tv_primary_color: '#3b82f6',
          mensaje_dia: '',
        }
      });
      // Only update the admin's own profile, never the gerente's
      if (!isGte) {
        await updateDoc(doc(db, 'especialistas', userProfile.id), { institution_id: ref.id });
        setUserProfile({ ...userProfile, institution_id: ref.id });
      }
      setNewInstName(''); setShowInstForm(false);
      await loadDashboard(userProfile.user_id, userProfile.role);
    } catch { alert('Error al crear institución'); }
    setInstSaving(false);
  };

  const handleAuthorizeInstitution = async (inst: any) => {
    if (!confirm(`¿Autorizar la institución "${inst.name}"?`)) return;
    try {
      await updateDoc(doc(db, 'institutions', inst.id), { estado: 'activa' });
      if (inst.owner_id) await updateDoc(doc(db, 'especialistas', inst.owner_id), { estado_funcionario: 'activo' });
      await loadDashboard(userProfile.user_id, userProfile.role);
    } catch (err: any) { alert('Error al autorizar: ' + err.message); }
  };

  const handleDeleteInstitution = async (instId: string, instName: string) => {
    if (!confirm(`¿Eliminar la institución "${instName}"?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'institutions', instId));
      setInstitutions(prev => prev.filter(i => i.id !== instId));
    } catch (err: any) { alert('Error al eliminar: ' + err.message); }
  };

  const handleDeleteAdmin = async (adminId: string, adminName: string) => {
    if (!confirm(`¿Eliminar el perfil de "${adminName}"?\n\nEl usuario no podrá acceder al sistema.`)) return;
    try {
      await deleteDoc(doc(db, 'especialistas', adminId));
      setAllAdmins(prev => prev.filter(a => a.id !== adminId));
    } catch (err: any) { alert('Error al eliminar: ' + err.message); }
  };

  const handleDeleteFuncionario = async (funcId: string, funcName: string) => {
    if (!confirm(`¿Eliminar al funcionario "${funcName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'especialistas', funcId));
      setFuncionarios(prev => prev.filter(f => f.id !== funcId));
      setPendingFuncionarios(prev => prev.filter(f => f.id !== funcId));
    } catch (err: any) { alert('Error al eliminar: ' + err.message); }
  };

  const handleApproveFuncionario = async (funcId: string, funcName: string) => {
    const fn = pendingFuncionarios.find(f => f.id === funcId);
    if (!fn?.departamento) {
      alert('Asigna primero un departamento al funcionario antes de aprobar.');
      return;
    }
    if (!confirm(`¿Aprobar y activar a "${funcName}"?`)) return;
    try {
      await updateDoc(doc(db, 'especialistas', funcId), { estado_funcionario: 'activo' });
      setPendingFuncionarios(prev => prev.filter(f => f.id !== funcId));
      setFuncionarios(prev => [...prev, { ...fn, estado_funcionario: 'activo' }]);
    } catch (err: any) { alert('Error al aprobar: ' + err.message); }
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
      setDeptosStr((d.config?.departamentos || ['OIRS', 'Atención General']).join(', '));
      setOirsDpto(d.config?.oirs_departamento || 'OIRS');
      setWebhookUrl(d.config?.n8n_webhook_url || '');
      setResetLogs(d.reset_logs || []);
      await loadFuncionarios(instId);
      setView('detail');
      setActiveTab('dashboard');
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
      const updated = [{ nombre: userProfile.nombre, fecha: new Date().toISOString() }, ...logs].slice(0, 3);
      await updateDoc(ref, { currentTurno: 0, ultimo_reinicio: new Date().toISOString(), reset_logs: updated });
      setResetLogs(updated);
    }
  };

  const handleRegisterUser = async (e: React.FormEvent, role: 'admin' | 'funcionario') => {
    e.preventDefault();
    setFuncLoading(true); setFuncMsg('');
    try {
      const newUid = await createUserSecondary(funcEmail, funcPass);
      const assignedInstId = role === 'funcionario' ? (institutionId || '') : (funcInstId || '');
      await setDoc(doc(db, 'especialistas', newUid), {
        user_id: newUid,
        institution_id: assignedInstId,
        role,
        nombre: funcNombre || (role === 'admin' ? 'Administrador' : 'Funcionario'),
        departamento: role === 'funcionario' ? funcDepto : 'Administración',
        cargo: funcCargo || (role === 'admin' ? 'Administrador' : 'Funcionario'),
        estado_funcionario: 'activo', // admins start active; funcionarios start active when directly registered
        avatar_url: '',
        letra_atencion: funcLetra || funcEmail.split('@')[0].substring(0, 2).toUpperCase(),
        whatsapp_phone: '',
        whatsapp_apikey: '',
        email: funcEmail,
      });
      // If gerente assigned an institution to the new admin, also link admin as owner
      if (role === 'admin' && funcInstId) {
        await updateDoc(doc(db, 'institutions', funcInstId), {
          owner_id: newUid,
          owner_email: funcEmail,
        });
      }
      setFuncMsg(`✅ ${role === 'admin' ? 'Administrador' : 'Funcionario'} "${funcNombre}" registrado.`);
      setFuncEmail(''); setFuncPass(''); setFuncNombre(''); setFuncDepto('');
      setFuncCargo(''); setFuncLetra(''); setFuncInstId('');
      if (role === 'funcionario' && institutionId) await loadFuncionarios(institutionId);
      else await loadDashboard(userProfile.user_id, userProfile.role);
    } catch (err: any) {
      setFuncMsg(`❌ Error: ${err.message}`);
    }
    setFuncLoading(false);
  };

  const updateFuncionario = async (id: string, field: string, value: string) => {
    await updateDoc(doc(db, 'especialistas', id), { [field]: value });
    setFuncionarios(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    setPendingFuncionarios(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const toggleFuncionarioStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'activo' ? 'inactivo' : 'activo';
    await updateDoc(doc(db, 'especialistas', id), { estado_funcionario: newStatus });
    setFuncionarios(prev => prev.map(f => f.id === id ? { ...f, estado_funcionario: newStatus } : f));
  };

  /* ── Export helpers ────────────────────────────────────────────────────────── */
  const exportUsuarios = async () => {
    if (!institutionId) return;
    const snap = await getDocs(query(collection(db, 'usuarios'), where('institution_id', '==', institutionId)));
    exportToCSV(`usuarios_${institutionName}.csv`, snap.docs.map(d => ({ RUT: d.id, ...d.data() })));
  };

  const exportTurnos = async () => {
    if (!institutionId) return;
    const snap = await getDocs(query(collection(db, 'turnos'), where('institution_id', '==', institutionId), orderBy('created_at', 'desc')));
    exportToCSV(`turnos_${institutionName}.csv`, snap.docs.map(d => {
      const t = d.data();
      return {
        ID: d.id, Estado: t.estado, RUT: t.rut_usuario || '',
        Departamento: t.departamento_solicitado || '', Funcionario: t.nombre_funcionario || '',
        Modulo: t.letra_especialista || '',
        Creado: t.created_at ? new Date(t.created_at).toLocaleString() : '',
        Llamado: t.called_at ? new Date(t.called_at).toLocaleString() : '',
        Finalizado: t.finished_at ? new Date(t.finished_at).toLocaleString() : ''
      };
    }));
  };

  const exportFuncionarios = () => {
    exportToCSV(`funcionarios_${institutionName}.csv`, funcionarios.map(f => ({
      Nombre: f.nombre || '', Rol: f.role || '', Departamento: f.departamento || '',
      Cargo: f.cargo || '', Modulo: f.letra_atencion || '',
      Estado: f.estado_funcionario || 'inactivo', Email: f.email || ''
    })));
  };

  const exportAllAdmins = () => {
    exportToCSV(`todos_los_administradores.csv`, allAdmins.map(a => {
      const inst = institutions.find(i => i.owner_id === a.user_id || i.owner_id === a.id);
      return {
        Nombre: a.nombre || '',
        Email: a.email || '',
        Cargo: a.cargo || '',
        Estado: a.estado_funcionario || 'inactivo',
        Institucion: inst ? inst.name : 'Sin Institución',
        ID_Institucion: inst ? inst.id : ''
      };
    }));
  };

  const exportAllBD = async () => {
    const snap = await getDocs(collection(db, 'usuarios'));
    exportToCSV('bd_global_todas_instituciones.csv', snap.docs.map(d => ({ RUT: d.id, ...d.data() })));
  };

  const handleDownloadInstBD = async (inst: any) => {
    const snap = await getDocs(query(collection(db, 'usuarios'), where('institution_id', '==', inst.id)));
    exportToCSV(`bd_${inst.name}.csv`, snap.docs.map(d => ({ RUT: d.id, ...d.data() })));
  };

  const handleSystemReset = async () => {
    if (userProfile?.role !== 'gerente') return;
    const step1 = confirm(
      '⚠️ RESET TOTAL DEL SISTEMA\n\n' +
      'Esto eliminará PERMANENTEMENTE:\n' +
      '• Todas las instituciones\n' +
      '• Todos los administradores y funcionarios (excepto tu cuenta de gerente)\n' +
      '• Todos los usuarios atendidos\n' +
      '• Todo el historial de turnos\n\n' +
      'Las cuentas de inicio de sesión (Authentication) NO se eliminan aquí.\n\n' +
      '¿Deseas continuar?'
    );
    if (!step1) return;
    const phrase = prompt('Para confirmar, escribe exactamente:  BORRAR TODO');
    if (phrase !== 'BORRAR TODO') { alert('Cancelado. Texto no coincide.'); return; }

    setResetting(true);
    try {
      const myUid = userProfile.user_id;
      const collections = ['turnos', 'usuarios', 'institutions'];
      for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id))));
      }
      // Delete all especialistas except the current gerente
      const espSnap = await getDocs(collection(db, 'especialistas'));
      await Promise.all(
        espSnap.docs
          .filter(d => (d.data() as any).user_id !== myUid)
          .map(d => deleteDoc(doc(db, 'especialistas', d.id)))
      );
      // Reset gerente's own institution link
      await updateDoc(doc(db, 'especialistas', userProfile.id), { institution_id: '' });
      setInstitutions([]); setAllAdmins([]); setFuncionarios([]); setPendingFuncionarios([]);
      alert('✅ Sistema reiniciado. Recuerda eliminar las cuentas antiguas en Firebase Authentication si deseas reutilizar esos correos.');
    } catch (err: any) {
      alert('Error durante el reset: ' + err.message);
    }
    setResetting(false);
  };

  /* ── Render ─────────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className={styles.centerLoad}>
        <div className={styles.loadSpinner} />
        <span>Cargando panel…</span>
      </div>
    );
  }

  const deptosList = deptosStr.split(',').map(s => s.trim()).filter(Boolean);
  const isGerente = userProfile?.role === 'gerente';

  const gerenteTabs = [
    { id: 'instituciones' as GerenteTab, Icon: Building2, label: 'Instituciones', count: institutions.length },
    { id: 'administradores' as GerenteTab, Icon: UserCog, label: 'Administradores', count: allAdmins.length },
    { id: 'reportes' as GerenteTab, Icon: BarChart3, label: 'Reportes', count: null },
  ];

  const adminTabs = [
    { id: 'dashboard' as AdminTab, Icon: LayoutDashboard, label: 'Dashboard', badge: null as number | null },
    { id: 'config' as AdminTab, Icon: Settings, label: 'Configuración', badge: null as number | null },
    { id: 'funcionarios' as AdminTab, Icon: Users, label: 'Funcionarios', badge: pendingFuncionarios.length > 0 ? pendingFuncionarios.length : null },
    { id: 'directorio' as AdminTab, Icon: FileText, label: 'Base de Datos', badge: null as number | null },
    { id: 'reportes' as AdminTab, Icon: BarChart3, label: 'Reportes', badge: null as number | null },
  ];

  return (
    <div className={styles.shell}>
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {isGerente
            ? <><Shield size={22} className={styles.headerIcon} data-color="gerente" /><span className={styles.headerTitle}>Panel Gerencial</span></>
            : <><UserCog size={22} className={styles.headerIcon} data-color="admin" /><span className={styles.headerTitle}>Panel de Administración</span></>
          }
          <span className={styles.rolePill} data-role={userProfile?.role}>
            {isGerente ? '👑 Gerente' : '⚙️ Admin'}
          </span>
          {view === 'detail' && (
            <span className={styles.breadcrumb}>
              <ChevronRight size={14} />
              {institutionName}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerEmail}>{session?.email}</span>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <LogOut size={15} /> Salir
          </button>
        </div>
      </header>

      <div className={styles.body}>

        {/* ══ GERENTE DASHBOARD ══════════════════════════════════════════════ */}
        {isGerente && view === 'dashboard' && (
          <div className={styles.gerenteDash}>

            {/* Gerente Tab Nav */}
            <nav className={styles.gerenteTabNav}>
              {gerenteTabs.map(({ id, Icon, label, count }) => (
                <button
                  key={id}
                  className={`${styles.gerenteTab} ${activeGerenteTab === id ? styles.gerenteTabActive : ''}`}
                  onClick={() => setActiveGerenteTab(id)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {count !== null && <span className={styles.gerenteTabBadge}>{count}</span>}
                </button>
              ))}
            </nav>

            {/* ── Tab: INSTITUCIONES ─────────────────────────────────────── */}
            {activeGerenteTab === 'instituciones' && (
              <div>
                <div className={styles.sectionHead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Instituciones Registradas</h2>
                    <p className={styles.sectionSub}>{institutions.length} institución{institutions.length !== 1 ? 'es' : ''}</p>
                  </div>
                  <button className={styles.btnPrimary} onClick={() => setShowInstForm(!showInstForm)}>
                    <Plus size={16} /> Nueva Institución
                  </button>
                </div>

                {showInstForm && (
                  <form onSubmit={handleCreateInstitution} className={styles.inlineForm}>
                    <input
                      type="text" value={newInstName}
                      onChange={e => setNewInstName(e.target.value)}
                      placeholder="Nombre de la nueva institución…" required autoFocus
                      className={styles.inlineInput}
                    />
                    <button type="submit" className={styles.btnPrimary} disabled={instSaving}>
                      {instSaving ? 'Creando…' : 'Crear'}
                    </button>
                    <button type="button" className={styles.btnGhost} onClick={() => setShowInstForm(false)}>Cancelar</button>
                  </form>
                )}

                <div className={styles.instGrid}>
                  {institutions.length === 0 ? (
                    <div className={styles.emptyState}>
                      <Building2 size={40} />
                      <p>No hay instituciones aún. Crea la primera.</p>
                    </div>
                  ) : institutions.map(inst => {
                    const admin = allAdmins.find(a => a.user_id === inst.owner_id || a.id === inst.owner_id);
                    return (
                      <div key={inst.id} className={styles.instCard}>
                        <div className={styles.instCardTop}>
                          <div className={styles.instDot} style={{ background: inst.config?.tv_primary_color || '#3b82f6' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h3 className={styles.instCardName}>
                              {inst.name}
                              {inst.estado === 'pendiente' && <span className={styles.pendingBadge}>Pendiente</span>}
                            </h3>
                            {admin && <p className={styles.instCardAdmin}>{admin.nombre} · {admin.email}</p>}
                            <small className={styles.instCardMeta}>{inst.config?.departamentos?.length || 0} departamentos</small>
                          </div>
                        </div>
                        <div className={styles.instCardMono}>
                          <Link2 size={11} /> /tv?institution={inst.id}
                        </div>
                        <div className={styles.instCardActions}>
                          {inst.estado === 'pendiente' ? (
                            <button onClick={() => handleAuthorizeInstitution(inst)} className={styles.btnGreen} style={{ flex: 1 }}>
                              <Shield size={14} /> Autorizar
                            </button>
                          ) : (
                            <button onClick={() => openDetail(inst.id)} className={styles.btnPrimary} style={{ flex: 1 }}>
                              <Settings size={14} /> Gestionar
                            </button>
                          )}
                          <button onClick={() => handleDownloadInstBD(inst)} className={styles.btnGhost} title="Descargar Base de Datos">
                            <Download size={14} />
                          </button>
                          <button onClick={() => handleDeleteInstitution(inst.id, inst.name)} className={styles.btnDanger} title="Eliminar institución">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Tab: ADMINISTRADORES ──────────────────────────────────── */}
            {activeGerenteTab === 'administradores' && (
              <div>
                <div className={styles.sectionHead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Administradores</h2>
                    <p className={styles.sectionSub}>{allAdmins.length} registrado{allAdmins.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <UserPlus size={20} className={styles.cardHeadIcon} />
                    <h2>Registrar Administrador</h2>
                  </div>
                  <p className={styles.cardDesc}>Los administradores gestionan su propia institución y funcionarios.</p>
                  <form onSubmit={e => handleRegisterUser(e, 'admin')} className={styles.userForm}>
                    {funcMsg && <div className={funcMsg.startsWith('✅') ? styles.msgSuccess : styles.msgError}>{funcMsg}</div>}
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Nombre Completo</label>
                        <input type="text" value={funcNombre} onChange={e => setFuncNombre(e.target.value)} placeholder="Juan Pérez" required />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Correo Electrónico</label>
                        <input type="email" value={funcEmail} onChange={e => setFuncEmail(e.target.value)} placeholder="admin@municipio.cl" required />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Contraseña Temporal</label>
                        <input type="password" value={funcPass} onChange={e => setFuncPass(e.target.value)} minLength={6} required />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Asignar Institución (opcional)</label>
                        <select value={funcInstId} onChange={e => setFuncInstId(e.target.value)} className={styles.selectField}>
                          <option value="">Sin institución asignada</option>
                          {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <button type="submit" className={styles.btnPrimary} disabled={funcLoading}>
                      {funcLoading ? 'Registrando…' : <><UserPlus size={15} /> Registrar Administrador</>}
                    </button>
                  </form>
                </div>

                <div className={styles.card} style={{ marginTop: '1.25rem' }}>
                  <div className={styles.cardHead}>
                    <Users size={18} className={styles.cardHeadIcon} />
                    <h2>Lista de Administradores</h2>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Nombre</th><th>Email</th><th>Institución</th><th>Estado</th><th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAdmins.map(a => {
                          const inst = institutions.find(i => i.owner_id === a.user_id || i.owner_id === a.id);
                          return (
                            <tr key={a.id}>
                              <td>{a.nombre}</td>
                              <td>{a.email || '—'}</td>
                              <td>{inst ? inst.name : <span style={{ color: 'var(--text-secondary)' }}>Sin institución</span>}</td>
                              <td><span className={styles.chip} data-role={a.estado_funcionario === 'activo' ? 'admin' : 'funcionario'}>{a.estado_funcionario || 'inactivo'}</span></td>
                              <td>
                                <button className={styles.btnDanger} onClick={() => handleDeleteAdmin(a.id, a.nombre)} style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}>
                                  <Trash2 size={13} /> Eliminar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {allAdmins.length === 0 && <tr><td colSpan={5} className={styles.noData}>Sin administradores.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: REPORTES ─────────────────────────────────────────── */}
            {activeGerenteTab === 'reportes' && (
              <div>
                <div className={styles.sectionHead}>
                  <div>
                    <h2 className={styles.sectionTitle}>Reportes Globales</h2>
                    <p className={styles.sectionSub}>Exporta datos de todo el sistema</p>
                  </div>
                </div>
                <div className={styles.reportGrid}>
                  <div className={styles.reportCard}>
                    <div className={styles.reportCardIcon}><Users size={28} /></div>
                    <h3>Base de Datos Global</h3>
                    <p>Todos los usuarios registrados en el sistema, de todas las instituciones.</p>
                    <button className={styles.btnPrimary} onClick={exportAllBD}>
                      <Download size={16} /> Descargar BD Global (CSV)
                    </button>
                  </div>
                  <div className={styles.reportCard}>
                    <div className={styles.reportCardIcon}><UserCog size={28} /></div>
                    <h3>Administradores</h3>
                    <p>Lista completa de todos los administradores con sus instituciones asignadas.</p>
                    <button className={styles.btnPrimary} onClick={exportAllAdmins}>
                      <Download size={16} /> Descargar Admins (CSV)
                    </button>
                  </div>
                  <div className={styles.reportCard}>
                    <div className={styles.reportCardIcon}><Building2 size={28} /></div>
                    <h3>BD por Institución</h3>
                    <p>Descarga la base de datos de usuarios de cada institución individualmente.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                      {institutions.map(inst => (
                        <button key={inst.id} className={styles.btnGhost} onClick={() => handleDownloadInstBD(inst)} style={{ justifyContent: 'flex-start' }}>
                          <Download size={14} /> {inst.name}
                        </button>
                      ))}
                      {institutions.length === 0 && <p className={styles.noData}>Sin instituciones.</p>}
                    </div>
                  </div>
                </div>

                {/* Danger zone — system reset */}
                <div className={styles.dangerZone} style={{ marginTop: '1.75rem' }}>
                  <div className={styles.dangerInfo}>
                    <h3><AlertTriangle size={18} /> Reset Total del Sistema</h3>
                    <p>
                      Elimina <strong>todas</strong> las instituciones, administradores, funcionarios,
                      usuarios y turnos para empezar desde cero. Tu cuenta de gerente se conserva.
                      Las cuentas de Authentication deben eliminarse aparte en Firebase Console.
                    </p>
                  </div>
                  <button onClick={handleSystemReset} className={styles.btnDanger} disabled={resetting}>
                    {resetting ? 'Borrando…' : <><Trash2 size={15} /> Borrar Todo</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ADMIN SIN INSTITUCIÓN ══════════════════════════════════════════ */}
        {!isGerente && view === 'dashboard' && (
          <div className={styles.emptyState}>
            <Building2 size={40} />
            <h2>Bienvenido al Panel de Administración</h2>
            <p>Aún no tienes una institución asignada o creada.</p>
            {!showInstForm ? (
              <button onClick={() => setShowInstForm(true)} className={styles.btnPrimary} style={{ marginTop: '1rem' }}>
                <PlusCircle size={15} /> Crear mi Institución
              </button>
            ) : (
              <form onSubmit={handleCreateInstitution} className={styles.inlineForm} style={{ marginTop: '1rem' }}>
                <input
                  type="text" value={newInstName}
                  onChange={e => setNewInstName(e.target.value)}
                  placeholder="Nombre de la institución…" required autoFocus
                  className={styles.inlineInput}
                />
                <button type="submit" className={styles.btnPrimary} disabled={instSaving}>
                  {instSaving ? 'Creando…' : 'Crear'}
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setShowInstForm(false)}>Cancelar</button>
              </form>
            )}
          </div>
        )}

        {/* ══ DETAIL VIEW ════════════════════════════════════════════════════ */}
        {view === 'detail' && (
          <div className={styles.detailWrapper}>
            {isGerente && (
              <button className={styles.backBtn} onClick={() => setView('dashboard')}>
                <ArrowLeft size={15} /> Todas las Instituciones
              </button>
            )}

            <div className={styles.instHeader}>
              <div className={styles.instHeaderLeft}>
                <div className={styles.instHeaderDot} style={{ background: tvColor }} />
                <div>
                  <h1 className={styles.instHeaderTitle}>{institutionName}</h1>
                  <p className={styles.instHeaderSub}>ID: {institutionId}</p>
                </div>
              </div>
              <div className={styles.instHeaderActions}>
                <button onClick={() => window.open(`/tv?institution=${institutionId}`, '_blank')} className={styles.btnGreen}>
                  <Monitor size={15} /> Ver TV
                </button>
                <button onClick={() => window.open(`/totem?institution=${institutionId}`, '_blank')} className={styles.btnAmber}>
                  <Tablet size={15} /> Tótem
                </button>
                <button onClick={() => navigator.clipboard.writeText(`${location.origin}/tv?institution=${institutionId}`)} className={styles.btnGhost}>
                  <Link2 size={15} /> Copiar URL
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <nav className={styles.tabNav}>
              {adminTabs.map(({ id, Icon, label, badge }) => (
                <button
                  key={id}
                  className={`${styles.tabBtn} ${activeTab === id ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={16} /> {label}
                  {badge !== null && <span className={styles.tabBadge}>{badge}</span>}
                </button>
              ))}
            </nav>

            {/* ── TAB: DASHBOARD ────────────────────────────────────────── */}
            {activeTab === 'dashboard' && (
              <div className={styles.tabContent}>
                <div className={styles.kpiGrid}>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}><Users size={16} /> En Espera</div>
                    <div className={styles.kpiValue}>{stats.enEspera}</div>
                    <div className={styles.kpiBar} style={{ width: `${Math.min(stats.enEspera * 10, 100)}%`, background: '#3b82f6' }} />
                  </div>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}><BarChart3 size={16} /> Atendidos Hoy</div>
                    <div className={styles.kpiValue} style={{ color: 'var(--success)' }}>{stats.atendidosHoy}</div>
                    <div className={styles.kpiBar} style={{ width: `${Math.min(stats.atendidosHoy * 3, 100)}%`, background: 'var(--success)' }} />
                  </div>
                  <div className={`${styles.kpiCard} ${stats.tEspera > 15 ? styles.kpiDanger : ''}`}>
                    <div className={styles.kpiLabel}><Clock size={16} /> T. Espera Prom.</div>
                    <div className={styles.kpiValue}>{stats.tEspera}<small> min</small></div>
                    {stats.tEspera > 15 && <div className={styles.kpiAlert}><AlertTriangle size={13} /> SLA Excedido</div>}
                  </div>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}><Clock size={16} /> T. Atención Prom.</div>
                    <div className={styles.kpiValue}>{stats.tAtencion}<small> min</small></div>
                  </div>
                </div>

                <div className={styles.dangerZone}>
                  <div className={styles.dangerInfo}>
                    <h3><AlertTriangle size={18} /> Reinicio de Conteo</h3>
                    <p>Pone el contador de tickets en 0. Solo para errores de apertura.</p>
                    {resetLogs.length > 0 && (
                      <ul className={styles.resetLogList}>
                        {resetLogs.map((l, i) => <li key={i}>{l.nombre} — {new Date(l.fecha).toLocaleString()}</li>)}
                      </ul>
                    )}
                  </div>
                  <button onClick={handleReiniciarConteo} className={styles.btnDanger}>Reiniciar a 0</button>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <Users size={18} className={styles.cardHeadIcon} />
                    <h2>Estado del Personal ({funcionarios.length})</h2>
                  </div>
                  <div className={styles.staffGrid}>
                    {funcionarios.map(f => (
                      <div key={f.id} className={styles.staffBadge} data-status={f.estado_funcionario || 'inactivo'}>
                        <div className={styles.staffAvatar}>
                          {f.avatar_url ? <img src={f.avatar_url} alt="" /> : <span>{f.nombre?.substring(0, 2).toUpperCase() || 'FN'}</span>}
                        </div>
                        <div>
                          <strong>{f.nombre}</strong>
                          <small>{f.departamento} · Módulo {f.letra_atencion}</small>
                          <span className={styles.staffStatus} data-status={f.estado_funcionario || 'inactivo'}>
                            {f.estado_funcionario || 'inactivo'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {funcionarios.length === 0 && <p className={styles.noData}>Sin funcionarios activos.</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: CONFIGURACIÓN ────────────────────────────────────── */}
            {activeTab === 'config' && (
              <div className={styles.tabContent}>
                <div className={styles.configGrid}>
                  <div className={styles.card}>
                    <div className={styles.cardHead}>
                      <Monitor size={18} className={styles.cardHeadIcon} />
                      <h2>Pantalla TV & Branding</h2>
                    </div>
                    <div className={styles.formGroup}><label>Nombre en TV</label><input value={tvName} onChange={e => setTvName(e.target.value)} placeholder="Ej: CESFAM Dr. Barros Luco" /></div>
                    <div className={styles.formGroup}><label>URL del Logo</label><input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://tu-institucion.cl/logo.png" /></div>
                    <div className={styles.formGroup}>
                      <label>Color Primario</label>
                      <div className={styles.colorRow}>
                        <input type="color" value={tvColor} onChange={e => setTvColor(e.target.value)} className={styles.colorPicker} />
                        <input value={tvColor} onChange={e => setTvColor(e.target.value)} style={{ flex: 1 }} />
                      </div>
                    </div>
                    <div className={styles.formGroup}><label>URL Fondo TV</label><input value={tvBg} onChange={e => setTvBg(e.target.value)} placeholder="https://..." /></div>
                    <div className={styles.formGroup}><label>Mensaje del Día</label><textarea rows={3} value={mensajeDia} onChange={e => setMensajeDia(e.target.value)} placeholder="Texto desplazable en pantalla…" /></div>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.cardHead}><Settings size={18} className={styles.cardHeadIcon} /><h2>Departamentos & Automatización</h2></div>
                    <div className={styles.formGroup}><label>Categorías / Departamentos (separados por coma)</label><textarea rows={6} value={deptosStr} onChange={e => setDeptosStr(e.target.value)} placeholder="OIRS, DIDECO, Atención General…" /></div>
                    <div className={styles.formGroup}><label>Departamento de Orientación (OIRS)</label><input value={oirsDpto} onChange={e => setOirsDpto(e.target.value)} placeholder="OIRS" /></div>
                    <div className={styles.formGroup}><label>Webhook n8n (Opcional)</label><input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://n8n.tu-servidor.com/webhook/…" /></div>
                  </div>
                </div>

                <div className={styles.card} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.cardHead}><Link2 size={18} className={styles.cardHeadIcon} /><h2>Enlaces Públicos</h2></div>
                  <p className={styles.cardDesc}>Copia estas URLs en Smart TVs o Tablets.</p>
                  <div className={styles.formRow} style={{ marginTop: '1rem' }}>
                    <div className={styles.formGroup}>
                      <label><Monitor size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Pantalla de TV</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="text" readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/tv?institution=${institutionId}`} onClick={e => (e.target as HTMLInputElement).select()} style={{ flex: 1, cursor: 'text', background: 'var(--bg-color)' }} />
                        <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tv?institution=${institutionId}`)} className={styles.btnPrimary}>Copiar</button>
                        <a href={`/tv?institution=${institutionId}`} target="_blank" className={styles.btnGhost} style={{ padding: '0 0.75rem' }}><Eye size={16} /></a>
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <label><Tablet size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Tótem</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="text" readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/totem?institution=${institutionId}`} onClick={e => (e.target as HTMLInputElement).select()} style={{ flex: 1, cursor: 'text', background: 'var(--bg-color)' }} />
                        <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/totem?institution=${institutionId}`)} className={styles.btnPrimary}>Copiar</button>
                        <a href={`/totem?institution=${institutionId}`} target="_blank" className={styles.btnGhost} style={{ padding: '0 0.75rem' }}><Eye size={16} /></a>
                      </div>
                    </div>
                  </div>
                </div>

                <button className={styles.btnPrimary} onClick={saveConfig} disabled={savingConfig} style={{ marginTop: '1.5rem' }}>
                  {savingConfig ? 'Guardando…' : '💾 Guardar Configuración'}
                </button>
              </div>
            )}

            {/* ── TAB: FUNCIONARIOS ─────────────────────────────────────── */}
            {activeTab === 'funcionarios' && (
              <div className={styles.tabContent}>

                {/* Pending section */}
                {pendingFuncionarios.length > 0 && (
                  <div className={styles.pendingSection}>
                    <div className={styles.pendingSectionHeader}>
                      <AlertTriangle size={18} />
                      <h3>Pendientes de Aprobación ({pendingFuncionarios.length})</h3>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr><th>Nombre</th><th>Email</th><th>Cargo</th><th>Departamento</th><th>Acciones</th></tr>
                        </thead>
                        <tbody>
                          {pendingFuncionarios.map(f => (
                            <tr key={f.id}>
                              <td>{f.nombre}</td>
                              <td>{f.email || '—'}</td>
                              <td>{f.cargo || '—'}</td>
                              <td>
                                <select
                                  value={f.departamento || ''}
                                  onChange={e => updateFuncionario(f.id, 'departamento', e.target.value)}
                                  className={styles.selectField}
                                  style={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem', width: 'auto', minWidth: '130px' }}
                                >
                                  <option value="">Asignar depto…</option>
                                  {deptosList.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <button className={styles.btnGreen} onClick={() => handleApproveFuncionario(f.id, f.nombre)} style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}>
                                    <CheckCircle size={13} /> Aprobar
                                  </button>
                                  <button className={styles.btnDanger} onClick={() => handleDeleteFuncionario(f.id, f.nombre)} style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}>
                                    <Trash2 size={13} /> Rechazar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Register form */}
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <UserPlus size={18} className={styles.cardHeadIcon} />
                    <h2>Registrar Funcionario</h2>
                  </div>
                  <form onSubmit={e => handleRegisterUser(e, 'funcionario')} className={styles.userForm}>
                    {funcMsg && <div className={funcMsg.startsWith('✅') ? styles.msgSuccess : styles.msgError}>{funcMsg}</div>}
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Nombre Completo</label>
                        <input value={funcNombre} onChange={e => setFuncNombre(e.target.value)} placeholder="María García" required />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Correo Electrónico</label>
                        <input type="email" value={funcEmail} onChange={e => setFuncEmail(e.target.value)} placeholder="funcionario@municipio.cl" required />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Contraseña Temporal</label>
                        <input type="password" value={funcPass} onChange={e => setFuncPass(e.target.value)} minLength={6} required />
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Categoría Asignada</label>
                        <select value={funcDepto} onChange={e => setFuncDepto(e.target.value)} required className={styles.selectField}>
                          <option value="">Seleccionar…</option>
                          {deptosList.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className={styles.formGroup}>
                        <label>Cargo</label>
                        <input value={funcCargo} onChange={e => setFuncCargo(e.target.value)} placeholder="Ej: Psicólogo" />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Módulo / Letra</label>
                        <input value={funcLetra} onChange={e => setFuncLetra(e.target.value)} placeholder="Ej: A, B, Box 1" />
                      </div>
                    </div>
                    <button type="submit" className={styles.btnPrimary} disabled={funcLoading}>
                      {funcLoading ? 'Registrando…' : <><UserPlus size={15} /> Registrar Funcionario</>}
                    </button>
                  </form>
                </div>

                {/* Funcionarios by dept */}
                {deptosList.map(depto => {
                  const funcs = funcionarios.filter(f => f.departamento === depto);
                  return (
                    <div key={depto} className={styles.card} style={{ marginTop: '1rem' }}>
                      <div className={styles.deptHeader}>
                        <h3>{depto}</h3>
                        <span className={styles.deptCount}>{funcs.length} funcionario{funcs.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr><th>Perfil</th><th>Nombre</th><th>Cargo</th><th>Módulo</th><th>Estado</th><th>Acciones</th></tr>
                          </thead>
                          <tbody>
                            {funcs.map(f => (
                              <tr key={f.id}>
                                <td>
                                  <div className={styles.funcAvatarCell}>
                                    <div className={styles.funcAvatar}>
                                      {f.avatar_url ? <img src={f.avatar_url} alt="" /> : f.nombre?.substring(0, 2).toUpperCase() || 'FN'}
                                    </div>
                                    <span className={styles.statusDot} data-status={f.estado_funcionario || 'inactivo'} />
                                  </div>
                                </td>
                                <td><input className={styles.tableInput} value={f.nombre || ''} onChange={e => updateFuncionario(f.id, 'nombre', e.target.value)} /></td>
                                <td><input className={styles.tableInput} value={f.cargo || ''} onChange={e => updateFuncionario(f.id, 'cargo', e.target.value)} /></td>
                                <td><input className={styles.tableInput} value={f.letra_atencion || ''} onChange={e => updateFuncionario(f.id, 'letra_atencion', e.target.value)} /></td>
                                <td><span className={styles.chip} data-role={f.estado_funcionario === 'activo' ? 'admin' : 'funcionario'}>{f.estado_funcionario || 'inactivo'}</span></td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <button
                                      className={f.estado_funcionario === 'activo' ? styles.btnAmber : styles.btnGreen}
                                      onClick={() => toggleFuncionarioStatus(f.id, f.estado_funcionario || 'inactivo')}
                                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
                                    >
                                      {f.estado_funcionario === 'activo' ? 'Desactivar' : 'Activar'}
                                    </button>
                                    <button
                                      className={styles.btnDanger}
                                      onClick={() => handleDeleteFuncionario(f.id, f.nombre)}
                                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
                                      title="Eliminar"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {funcs.length === 0 && <tr><td colSpan={6} className={styles.noData}>Sin funcionarios en este departamento.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                <div className={styles.exportRow}>
                  <button className={styles.btnGhost} onClick={exportFuncionarios}><Download size={15} /> Exportar Funcionarios (CSV)</button>
                </div>
              </div>
            )}

            {/* ── TAB: BASE DE DATOS ────────────────────────────────────── */}
            {activeTab === 'directorio' && (
              <div className={styles.tabContent}>
                <UserDirectory
                  institutionId={institutionId || ''}
                  funcionarioId={userProfile?.user_id || ''}
                  funcionarioName={userProfile?.nombre || ''}
                  role={userProfile?.role}
                />
              </div>
            )}

            {/* ── TAB: REPORTES ─────────────────────────────────────────── */}
            {activeTab === 'reportes' && (
              <div className={styles.tabContent}>
                <div className={styles.reportGrid}>
                  <div className={styles.reportCard}>
                    <div className={styles.reportCardIcon}><Users size={28} /></div>
                    <h3>Base de Datos de Usuarios</h3>
                    <p>Exporta todos los usuarios registrados de esta institución con sus datos completos.</p>
                    <button className={styles.btnPrimary} onClick={exportUsuarios}><Download size={16} /> Descargar Usuarios (CSV)</button>
                  </div>
                  <div className={styles.reportCard}>
                    <div className={styles.reportCardIcon}><BarChart3 size={28} /></div>
                    <h3>Historial de Turnos</h3>
                    <p>Registro completo de turnos atendidos, saltados y en espera.</p>
                    <button className={styles.btnPrimary} onClick={exportTurnos}><Download size={16} /> Descargar Turnos (CSV)</button>
                  </div>
                  <div className={styles.reportCard}>
                    <div className={styles.reportCardIcon}><UserCog size={28} /></div>
                    <h3>Registro de Funcionarios</h3>
                    <p>Lista completa del personal con roles, módulos y estado de atención.</p>
                    <button className={styles.btnPrimary} onClick={exportFuncionarios}><Download size={16} /> Descargar Funcionarios (CSV)</button>
                  </div>
                </div>

                <div className={styles.card} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.cardHead}><BarChart3 size={18} className={styles.cardHeadIcon} /><h2>Métricas en Tiempo Real</h2></div>
                  <div className={styles.metricsGrid}>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{stats.enEspera}</span><span className={styles.metricLabel}>En Espera</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal} style={{ color: 'var(--success)' }}>{stats.atendidosHoy}</span><span className={styles.metricLabel}>Atendidos Hoy</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal} style={{ color: stats.tEspera > 15 ? 'var(--destructive)' : 'var(--primary)' }}>{stats.tEspera} min</span><span className={styles.metricLabel}>Espera Prom.</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{stats.tAtencion} min</span><span className={styles.metricLabel}>Atención Prom.</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{funcionarios.filter(f => f.estado_funcionario === 'activo').length}</span><span className={styles.metricLabel}>Activos</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{deptosList.length}</span><span className={styles.metricLabel}>Departamentos</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
