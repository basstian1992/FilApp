'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
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
  onSnapshot, updateDoc, orderBy, addDoc, getDoc, deleteDoc,
  getCountFromServer
} from 'firebase/firestore';
import styles from './admin.module.css';
import {
  Settings, BarChart3, Users, Clock, AlertTriangle,
  Download, LogOut, Building2, UserPlus, ArrowLeft, Plus,
  Link2, Eye, Shield, UserCog, ChevronRight, Monitor,
  Tablet, LayoutDashboard, FileText, PlusCircle, Trash2, CheckCircle, ClipboardList, Upload,
  MapPin, Pencil, Activity, RefreshCw
} from 'lucide-react';
import UserDirectory from '@/components/UserDirectory';
import { useToast } from '@/components/Toast';
import { SkeletonScreen } from '@/components/Skeleton';

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const GERENTE_EMAILS = ['b.alarconatenas@gmail.com', 'contacto@asesoriapublica.cl'];

function exportToCSV(filename: string, rows: any[], toast?: { (msg: string, type?: 'success' | 'error' | 'warning'): void }) {
  if (!rows?.length) { toast?.('No hay datos para exportar', 'warning'); return; }
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
type AdminTab = 'dashboard' | 'config' | 'pantallas' | 'dependencias' | 'funcionarios' | 'directorio' | 'reportes';
type GerenteTab = 'instituciones' | 'administradores' | 'reportes';

/* ─── Module Inline Editor ──────────────────────────────────────────────────── */
function ModuleEditor({ funcionario, onSaved }: { funcionario: any; onSaved: (newLetra: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(funcionario.letra_atencion || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!val.trim() || val.trim() === (funcionario.letra_atencion || '')) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), { letra_atencion: val.trim() });
      onSaved(val.trim());
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(funcionario.letra_atencion || ''); setEditing(true); }}
        style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', transition: 'all 0.15s' }}
        title="Click para editar módulo"
      >
        {funcionario.letra_atencion || '—'}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        onBlur={save}
        style={{ width: '70px', padding: '0.3rem 0.5rem', borderRadius: '6px', border: '2px solid var(--primary)', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
        maxLength={10}
        placeholder="Mód."
      />
      {saving && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>…</span>}
    </div>
  );
}

/* ─── Analytics helpers (datos reales de Firestore) ─────────────────────────── */
// Paleta consistente: cada dependencia mantiene su color en todos los gráficos
const DEP_PALETTE = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316'];

function BarList({ title, items, color, empty }: { title: string; items: { nombre: string; count: number; color?: string }[]; color: string; empty: string }) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <div style={{ flex: 1, minWidth: '280px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.9rem' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <BarChart3 size={14} /> {title}
      </h3>
      {items.length === 0 ? (
        <p className={styles.noData}>{empty}</p>
      ) : items.map(it => (
        <div key={it.nombre} style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '2px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              {it.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color, display: 'inline-block' }} />}
              {it.nombre}
            </span>
            <strong>{it.count}</strong>
          </div>
          <div style={{ height: 8, background: 'var(--surface-secondary)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(it.count / max) * 100}%`, height: '100%', background: it.color || color, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScreenCard({ nombre, sublabel, turno, ultimo, funcionarios, tvUrl, totemUrl, tvHref, totemHref }: {
  nombre: string; sublabel: string; turno?: number; ultimo?: string | null; funcionarios: number;
  tvUrl: string; totemUrl: string; tvHref: string; totemHref: string;
}) {
  return (
    <div className={styles.card} style={{ marginTop: '1rem' }}>
      <div className={styles.deptHeader}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Building2 size={16} /> {nombre}
        </h3>
        <span className={styles.deptCount}>{sublabel}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0 0.9rem' }}>
        <span className={styles.chip}><Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Ticket actual: #{turno ?? 0}</span>
        <span className={styles.chip}>Último reinicio: {ultimo ? new Date(ultimo).toLocaleString('es-CL') : '—'}</span>
        <span className={styles.chip}><Users size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> {funcionarios} funcionario{funcionarios !== 1 ? 's' : ''}</span>
      </div>
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label><Monitor size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> TV (sala de espera)</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="text" readOnly value={tvUrl} onClick={e => (e.target as HTMLInputElement).select()} style={{ flex: 1, cursor: 'text', background: 'var(--bg-color)' }} />
            <button type="button" onClick={() => navigator.clipboard.writeText(tvUrl)} className={styles.btnPrimary}>Copiar</button>
            <a href={tvHref} target="_blank" rel="noopener noreferrer" className={styles.btnGhost} style={{ padding: '0 0.75rem' }}><Eye size={16} /></a>
          </div>
        </div>
        <div className={styles.formGroup}>
          <label><Tablet size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Tótem (autoatención)</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="text" readOnly value={totemUrl} onClick={e => (e.target as HTMLInputElement).select()} style={{ flex: 1, cursor: 'text', background: 'var(--bg-color)' }} />
            <button type="button" onClick={() => navigator.clipboard.writeText(totemUrl)} className={styles.btnPrimary}>Copiar</button>
            <a href={totemHref} target="_blank" rel="noopener noreferrer" className={styles.btnGhost} style={{ padding: '0 0.75rem' }}><Eye size={16} /></a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────────────── */
export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();

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
  // Datos reales para KPIs y gráficos (todos los turnos de la institución)
  const [allTurnos, setAllTurnos] = useState<any[]>([]);
  const [usuariosCount, setUsuariosCount] = useState(0);
  const [resettingStats, setResettingStats] = useState(false);
  const [instDoc, setInstDoc] = useState<any>(null);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [pendingFuncionarios, setPendingFuncionarios] = useState<any[]>([]);

  // Dependencias (sedes) de la institución
  const [sedes, setSedes] = useState<any[]>([]);
  const [newSedeNombre, setNewSedeNombre] = useState('');
  const [newSedeDir, setNewSedeDir] = useState('');
  const [newSedeDeptos, setNewSedeDeptos] = useState('');
  const [editingSedeId, setEditingSedeId] = useState<string | null>(null);
  const [sedeSaving, setSedeSaving] = useState(false);

  // New user form
  const [funcEmail, setFuncEmail] = useState('');
  const [funcPass, setFuncPass] = useState('');
  const [funcNombre, setFuncNombre] = useState('');
  const [funcDepto, setFuncDepto] = useState('');
  const [funcSede, setFuncSede] = useState('');
  const [funcCargo, setFuncCargo] = useState('');
  const [funcLetra, setFuncLetra] = useState('');
  const [funcInstId, setFuncInstId] = useState(''); // institution to assign to new admin
  const [funcMsg, setFuncMsg] = useState('');
  const [funcLoading, setFuncLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [bitacora, setBitacora] = useState<any[]>([]);
  const [bitacoraLoading, setBitacoraLoading] = useState(false);

  // Bulk upload state
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [bulkResults, setBulkResults] = useState<{ ok: string[]; fail: { email: string; error: string }[] }>({ ok: [], fail: [] });
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkFileName, setBulkFileName] = useState('');
  const unsubFuncionariosRef = useRef<(() => void) | null>(null);
  const unsubSedesRef = useRef<(() => void) | null>(null);
  const instUnsubRef = useRef<(() => void) | null>(null);

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
    try {
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
    } catch (err) {
      console.error('Error loading dashboard:', err);
      toast('Error al cargar datos del panel.', 'error');
    }
  };

  const loadFuncionarios = async (instId: string) => {
    unsubFuncionariosRef.current?.();
    const unsub = onSnapshot(
      query(collection(db, 'especialistas'), where('institution_id', '==', instId)),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const staff = all.filter((f: any) => f.role === 'funcionario');
        setFuncionarios(staff.filter((f: any) => f.estado_funcionario !== 'pendiente'));
        setPendingFuncionarios(staff.filter((f: any) => f.estado_funcionario === 'pendiente'));
      }
    );
    unsubFuncionariosRef.current = unsub;
    return unsub;
  };

  // Fetch bitácora when reportes tab is active
  useEffect(() => {
    if (activeTab === 'reportes') fetchBitacora();
  }, [activeTab, institutionId]);

  // Live data — scoped to current institution only
  useEffect(() => {
    if (!institutionId) return;
    const loadTurnos = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'turnos'), where('institution_id', '==', institutionId)));
        setAllTurnos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) { console.error(err); }
    };
    loadTurnos();
    getCountFromServer(query(collection(db, 'usuarios'), where('institution_id', '==', institutionId)))
      .then(s => setUsuariosCount(s.data().count))
      .catch(() => setUsuariosCount(0));
    const unsub = onSnapshot(
      query(collection(db, 'turnos'), where('institution_id', '==', institutionId)),
      () => loadTurnos()
    );
    return () => unsub();
  }, [institutionId]);

  // Analítica derivada de datos reales
  const analytics = useMemo(() => {
    const tz = 'America/Santiago';
    const dayKey = (iso: any) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: tz });

    const porDia: { label: string; key: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA', { timeZone: tz });
      porDia.push({
        label: d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: tz }).replace('.', ''),
        key,
        count: allTurnos.filter(t => t.created_at && dayKey(t.created_at) === key).length,
      });
    }

    const attended = allTurnos.filter(t => t.estado === 'atendido');
    const waiting = allTurnos.filter(t => t.estado === 'espera');
    let tE = 0, tA = 0, n = 0;
    attended.forEach((t: any) => {
      if (t.called_at && t.created_at) tE += (new Date(t.called_at).getTime() - new Date(t.created_at).getTime()) / 60000;
      if (t.finished_at && t.called_at) tA += (new Date(t.finished_at).getTime() - new Date(t.called_at).getTime()) / 60000;
      n++;
    });

    const depMap = new Map<string, number>();
    allTurnos.forEach((t: any) => {
      const nombre = t.sede_id ? (sedes.find((s: any) => s.id === t.sede_id)?.nombre || 'Otra dependencia') : 'Sede Central';
      depMap.set(nombre, (depMap.get(nombre) || 0) + 1);
    });
    const porDependencia = Array.from(depMap.entries())
      .map(([nombre, count]) => ({ nombre, count }))
      .sort((a, b) => b.count - a.count)
      .map((e, i) => ({ ...e, color: DEP_PALETTE[i % DEP_PALETTE.length] }));

    // Tendencia: total últimos 7 días vs los 7 días anteriores
    const sum7 = porDia.reduce((a, d) => a + d.count, 0);
    let prev7 = 0;
    for (let i = 13; i >= 7; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA', { timeZone: tz });
      prev7 += allTurnos.filter(t => t.created_at && dayKey(t.created_at) === key).length;
    }
    const tendencia = prev7 > 0 ? Math.round(((sum7 - prev7) / prev7) * 100) : null;

    const deptMap = new Map<string, number>();
    allTurnos.forEach((t: any) => {
      const nombre = t.departamento_solicitado || 'Sin categoría';
      deptMap.set(nombre, (deptMap.get(nombre) || 0) + 1);
    });
    const porDepto = Array.from(deptMap.entries()).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => b.count - a.count).slice(0, 6);

    const estados: Record<string, number> = { espera: 0, llamado: 0, atendido: 0, saltado: 0 };
    allTurnos.forEach((t: any) => {
      const e = t.estado || 'espera';
      estados[e] = (estados[e] || 0) + 1;
    });

    return {
      total: allTurnos.length,
      hoy: allTurnos.filter(t => t.created_at && dayKey(t.created_at) === todayKey).length,
      enEspera: waiting.length,
      atendidosHoy: attended.filter(t => t.created_at && dayKey(t.created_at) === todayKey).length,
      tEspera: n ? Math.round(tE / n) : 0,
      tAtencion: n ? Math.round(tA / n) : 0,
      tendencia,
      porDia, porDependencia, porDepto, estados,
    };
  }, [allTurnos, sedes]);

  /* ── Actions ─────────────────────────────────────────────────────────────── */
  const handleLogout = async () => {
    unsubFuncionariosRef.current?.();
    unsubFuncionariosRef.current = null;
    unsubSedesRef.current?.();
    unsubSedesRef.current = null;
    instUnsubRef.current?.();
    instUnsubRef.current = null;
    await signOut(auth); router.push('/');
  };

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
    } catch { toast('Error al crear institución', 'error'); }
    setInstSaving(false);
  };

  const handleAuthorizeInstitution = async (inst: any) => {
    if (!confirm(`¿Autorizar la institución "${inst.name}"?`)) return;
    try {
      await updateDoc(doc(db, 'institutions', inst.id), { estado: 'activa' });
      if (inst.owner_id) await updateDoc(doc(db, 'especialistas', inst.owner_id), { estado_funcionario: 'activo' });
      await loadDashboard(userProfile.user_id, userProfile.role);
    } catch (err: any) { toast('Error al autorizar: ' + err.message, 'error'); }
  };

  const handleDeleteInstitution = async (instId: string, instName: string) => {
    if (!confirm(`¿Eliminar la institución "${instName}"?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'institutions', instId));
      setInstitutions(prev => prev.filter(i => i.id !== instId));
    } catch (err: any) { toast('Error al eliminar: ' + err.message, 'error'); }
  };

  const handleDeleteAdmin = async (adminId: string, adminName: string) => {
    if (!confirm(`¿Eliminar el perfil de "${adminName}"?\n\nEl usuario no podrá acceder al sistema.`)) return;
    try {
      await deleteDoc(doc(db, 'especialistas', adminId));
      setAllAdmins(prev => prev.filter(a => a.id !== adminId));
    } catch (err: any) { toast('Error al eliminar: ' + err.message, 'error'); }
  };

  const handleDeleteFuncionario = async (funcId: string, funcName: string) => {
    if (!confirm(`¿Eliminar al funcionario "${funcName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'especialistas', funcId));
      setFuncionarios(prev => prev.filter(f => f.id !== funcId));
      setPendingFuncionarios(prev => prev.filter(f => f.id !== funcId));
    } catch (err: any) { toast('Error al eliminar: ' + err.message, 'error'); }
  };

  const handleApproveFuncionario = async (funcId: string, funcName: string) => {
    const fn = pendingFuncionarios.find(f => f.id === funcId);
    if (!fn?.departamento) {
      toast('Asigna primero un departamento al funcionario antes de aprobar.', 'warning');
      return;
    }
    if (!confirm(`¿Aprobar y activar a "${funcName}"?`)) return;
    try {
      await updateDoc(doc(db, 'especialistas', funcId), { estado_funcionario: 'activo' });
      setPendingFuncionarios(prev => prev.filter(f => f.id !== funcId));
      setFuncionarios(prev => [...prev, { ...fn, estado_funcionario: 'activo' }]);
    } catch (err: any) { toast('Error al aprobar: ' + err.message, 'error'); }
  };

  const openDetail = async (instId: string) => {
    setLoading(true);
    try {
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
        // Suscripción en vivo al doc de la institución (contador central para la pestaña Pantallas)
        const unsubInst = onSnapshot(doc(db, 'institutions', instId), (s) => {
          if (s.exists()) setInstDoc({ id: s.id, ...s.data() });
        });
        instUnsubRef.current = unsubInst;
        await loadFuncionarios(instId);
        // Suscripción en vivo a las dependencias (sedes) de esta institución
        unsubSedesRef.current?.();
        const unsubSedes = onSnapshot(
          query(collection(db, 'sedes'), where('institution_id', '==', instId)),
          (snapSedes) => {
            const list = snapSedes.docs.map(sd => ({ id: sd.id, ...sd.data() }));
            list.sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''));
            setSedes(list);
          }
        );
        unsubSedesRef.current = unsubSedes;
        resetSedeForm();
        setView('detail');
        setActiveTab('dashboard');
      }
    } catch (err) {
      console.error(err);
      toast('Error al cargar la institución.', 'error');
    }
    setLoading(false);
  };

  /* ── Dependencias (sedes) ─────────────────────────────────────────────────── */
  const resetSedeForm = () => {
    setNewSedeNombre(''); setNewSedeDir(''); setNewSedeDeptos(''); setEditingSedeId(null);
  };

  const handleSaveSede = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionId || !newSedeNombre.trim()) return;
    setSedeSaving(true);
    const departamentos = newSedeDeptos.split(',').map(s => s.trim()).filter(Boolean);
    try {
      if (editingSedeId) {
        await updateDoc(doc(db, 'sedes', editingSedeId), {
          nombre: newSedeNombre.trim(),
          direccion: newSedeDir.trim(),
          departamentos,
        });
        toast('Dependencia actualizada');
      } else {
        await addDoc(collection(db, 'sedes'), {
          institution_id: institutionId,
          nombre: newSedeNombre.trim(),
          direccion: newSedeDir.trim(),
          departamentos: departamentos.length ? departamentos : ['Atención General'],
          currentTurno: 0,
          ultimo_reinicio: null,
          created_at: new Date().toISOString(),
        });
        toast('Dependencia creada');
      }
      resetSedeForm();
    } catch (err: any) {
      toast('Error al guardar dependencia: ' + err.message, 'error');
    }
    setSedeSaving(false);
  };

  const startEditSede = (sede: any) => {
    setEditingSedeId(sede.id);
    setNewSedeNombre(sede.nombre || '');
    setNewSedeDir(sede.direccion || '');
    setNewSedeDeptos((sede.departamentos || []).join(', '));
    setActiveTab('dependencias');
  };

  const handleDeleteSede = async (sedeId: string, nombre: string) => {
    if (!confirm(`¿Eliminar la dependencia "${nombre}"?\n\nLos funcionarios asignados quedarán sin dependencia y los turnos históricos se conservan.`)) return;
    try {
      await deleteDoc(doc(db, 'sedes', sedeId));
      toast('Dependencia eliminada');
    } catch (err: any) {
      toast('Error al eliminar: ' + err.message, 'error');
    }
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
    toast('Configuración guardada');
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

  // Pone en 0 las estadísticas: borra todos los turnos de la institución vía API
  const handleResetStats = async () => {
    if (!institutionId) return;
    const step1 = confirm(
      '⚠️ REINICIAR ESTADÍSTICAS\n\n' +
      'Esto eliminará PERMANENTEMENTE todos los turnos de la institución ' +
      '(de la sede central y de todas las dependencias) y dejará los contadores y gráficos en 0.\n\n' +
      'Los usuarios registrados, funcionarios y dependencias NO se afectan.\n\n¿Continuar?'
    );
    if (!step1) return;
    const phrase = prompt('Para confirmar, escribe exactamente:  BORRAR DATOS');
    if (phrase !== 'BORRAR DATOS') { toast('Cancelado. El texto no coincide.', 'warning'); return; }
    setResettingStats(true);
    try {
      // La API exige ID token de Firebase de un admin/gerente autorizado
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/reset-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ institutionId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error del servidor');
      toast(`Estadísticas reiniciadas (${data.deleted} turno${data.deleted !== 1 ? 's' : ''} eliminado${data.deleted !== 1 ? 's' : ''}).`);
    } catch (err: any) {
      toast('Error al reiniciar estadísticas: ' + err.message, 'error');
    }
    setResettingStats(false);
  };

  const handleRegisterUser = async (e: React.FormEvent, role: 'admin' | 'funcionario') => {
    e.preventDefault();
    setFuncLoading(true); setFuncMsg('');
    if (role === 'funcionario' && !institutionId) {
      setFuncMsg('❌ Error: No hay una institución seleccionada. Selecciona o crea una institución primero.');
      setFuncLoading(false);
      return;
    }
    try {
      const newUid = await createUserSecondary(funcEmail, funcPass);
      const assignedInstId = role === 'funcionario' ? (institutionId || '') : (funcInstId || '');
      await setDoc(doc(db, 'especialistas', newUid), {
        user_id: newUid,
        institution_id: assignedInstId,
        role,
        nombre: funcNombre || (role === 'admin' ? 'Administrador' : 'Funcionario'),
        departamento: role === 'funcionario' ? funcDepto : 'Administración',
        sede_id: role === 'funcionario' ? (funcSede || '') : '',
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
      setFuncEmail(''); setFuncPass(''); setFuncNombre(''); setFuncDepto(''); setFuncSede('');
      setFuncCargo(''); setFuncLetra(''); setFuncInstId('');
      if (role === 'funcionario' && institutionId) await loadFuncionarios(institutionId);
      else await loadDashboard(userProfile.user_id, userProfile.role);
    } catch (err: any) {
      const code = err.code;
      if (code === 'auth/email-already-in-use') {
        setFuncMsg('❌ Ese correo ya está registrado en el sistema. Si es un reintento, elimina el usuario en Firebase Console (Authentication → Usuarios) y vuelve a intentar.');
      } else if (code === 'auth/weak-password') {
        setFuncMsg('❌ La contraseña debe tener al menos 6 caracteres.');
      } else if (code === 'auth/invalid-email') {
        setFuncMsg('❌ El correo electrónico no es válido.');
      } else {
        setFuncMsg(`❌ Error: ${err.message}`);
      }
    }
    setFuncLoading(false);
  };

  const handleRegisterAdminByAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionId) return;
    setAdminLoading(true); setAdminMsg('');
    try {
      const newUid = await createUserSecondary(funcEmail, funcPass);
      await setDoc(doc(db, 'especialistas', newUid), {
        user_id: newUid,
        institution_id: institutionId,
        role: 'admin',
        nombre: funcNombre || 'Administrador',
        departamento: 'Administración',
        cargo: funcCargo || 'Administrador',
        estado_funcionario: 'activo',
        avatar_url: '',
        letra_atencion: funcLetra || funcEmail.split('@')[0].substring(0, 2).toUpperCase(),
        whatsapp_phone: '',
        whatsapp_apikey: '',
        email: funcEmail,
      });
      setAdminMsg(`✅ Administrador "${funcNombre}" registrado en ${institutionName}.`);
      setFuncEmail(''); setFuncPass(''); setFuncNombre(''); setFuncCargo(''); setFuncLetra('');
      await loadDashboard(userProfile.user_id, userProfile.role);
    } catch (err: any) {
      const code = err.code;
      if (code === 'auth/email-already-in-use') {
        setAdminMsg('❌ Ese correo ya está registrado en el sistema.');
      } else if (code === 'auth/weak-password') {
        setAdminMsg('❌ La contraseña debe tener al menos 6 caracteres.');
      } else {
        setAdminMsg(`❌ Error: ${err.message}`);
      }
    }
    setAdminLoading(false);
  };

  const BULK_PASS = '123456';

  const handleBulkExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkResults({ ok: [], fail: [] });
    setBulkProgress({ current: 0, total: 0 });
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      setBulkRows(rows);
    } catch (err: any) {
      setBulkRows([]);
      setBulkResults({ ok: [], fail: [{ email: '', error: `Error al leer Excel: ${err.message}` }] });
    }
    e.target.value = '';
  };

  const handleBulkCreate = async () => {
    if (!bulkRows.length || !institutionId) return;
    setBulkLoading(true);
    setBulkResults({ ok: [], fail: [] });
    const ok: string[] = [];
    const fail: { email: string; error: string }[] = [];

    for (let i = 0; i < bulkRows.length; i++) {
      const row = bulkRows[i];
      const email = (row['EMAIL INSTITUCIONAL'] || '').toString().trim().toLowerCase();
      if (!email || !email.includes('@')) {
        fail.push({ email: email || `Fila ${i + 2}`, error: 'Sin correo institucional válido' });
        setBulkProgress({ current: i + 1, total: bulkRows.length });
        continue;
      }
      const nombre = [row['NOMBRES'], row['APELLIDO_1'], row['APELLIDO_2']].filter(Boolean).map((s: any) => String(s).trim()).join(' ');
      const depto = (row['PROGRAMA O DEPARTAMENTO'] || '').toString().trim();
      const cargo = (row['CARGO '] || row['CARGO'] || '').toString().trim();
      const rut = row['RUT'] ? `${row['RUT']}-${row['DV'] || ''}` : '';
      const comuna = (row['COMUNA'] || '').toString().trim();

      try {
        const newUid = await createUserSecondary(email, BULK_PASS);
        await setDoc(doc(db, 'especialistas', newUid), {
          user_id: newUid,
          institution_id: institutionId,
          role: 'funcionario',
          nombre: nombre || 'Funcionario',
          departamento: depto || 'Sin departamento',
          cargo: cargo || 'Funcionario',
          estado_funcionario: 'activo',
          avatar_url: '',
          letra_atencion: depto ? depto.substring(0, 2).toUpperCase() : email.split('@')[0].substring(0, 2).toUpperCase(),
          whatsapp_phone: '',
          whatsapp_apikey: '',
          email,
          rut,
          comuna,
        });
        // Base estandarizada por institución: clave = RUT formateado XXXXXXXX-X
        // (igual que el Tótem), nunca el UID, para que todas las dependencias
        // compartan la misma base y la TV resuelva el nombre del usuario.
        if (rut && !rut.endsWith('-')) {
          await setDoc(
            doc(db, 'usuarios', rut),
            { rut, institution_id: institutionId, created_at: new Date().toISOString() },
            { merge: true }
          );
        }
        ok.push(email);
      } catch (err: any) {
        fail.push({ email, error: err.code === 'auth/email-already-in-use' ? 'Ya registrado' : err.message });
      }
      setBulkProgress({ current: i + 1, total: bulkRows.length });
    }

    setBulkResults({ ok, fail });
    setBulkLoading(false);
    if (ok.length > 0) await loadDashboard(userProfile.user_id, userProfile.role);
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

  const fetchBitacora = async () => {
    if (!institutionId) return;
    setBitacoraLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'bitacora'), where('institution_id', '==', institutionId), orderBy('finished_at', 'desc')));
      setBitacora(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
    setBitacoraLoading(false);
  };

  const exportBitacora = async () => {
    if (!institutionId) return;
    const snap = await getDocs(query(collection(db, 'bitacora'), where('institution_id', '==', institutionId), orderBy('finished_at', 'desc')));
    exportToCSV(`bitacora_${institutionName}.csv`, snap.docs.map(d => {
      const b = d.data();
      return {
        ID: d.id, Turno_ID: b.turno_id || '',
        RUT: b.rut_usuario || '', Paciente: b.nombre_paciente || '',
        Funcionario: b.nombre_funcionario || '', Departamento: b.departamento || '',
        Ticket: b.letra_ticket ? `${b.letra_ticket}-${b.numero}` : `${b.numero}`,
        Creado: b.created_at ? new Date(b.created_at).toLocaleString() : '',
        Llamado: b.called_at ? new Date(b.called_at).toLocaleString() : '',
        Finalizado: b.finished_at ? new Date(b.finished_at).toLocaleString() : ''
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
    if (phrase !== 'BORRAR TODO') { toast('Cancelado. Texto no coincide.', 'warning'); return; }

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
      toast('Sistema reiniciado. Recuerda eliminar las cuentas antiguas en Firebase Authentication si deseas reutilizar esos correos.');
    } catch (err: any) {
      toast('Error durante el reset: ' + err.message, 'error');
    }
    setResetting(false);
  };

  /* ── Render ─────────────────────────────────────────────────────────────────── */
  if (loading) {
    return <SkeletonScreen />;
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
    { id: 'pantallas' as AdminTab, Icon: Monitor, label: 'Pantallas', badge: ((sedes.length + 1) * 2) as number | null },
    { id: 'dependencias' as AdminTab, Icon: Building2, label: 'Dependencias', badge: sedes.length > 0 ? sedes.length : null as number | null },
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
                    <div className={styles.kpiValue}>{analytics.enEspera}</div>
                    <div className={styles.kpiBar} style={{ width: `${Math.min(analytics.enEspera * 10, 100)}%`, background: '#3b82f6' }} />
                  </div>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}><BarChart3 size={16} /> Atendidos Hoy</div>
                    <div className={styles.kpiValue} style={{ color: 'var(--success)' }}>{analytics.atendidosHoy}</div>
                    <div className={styles.kpiBar} style={{ width: `${Math.min(analytics.atendidosHoy * 3, 100)}%`, background: 'var(--success)' }} />
                  </div>
                  <div className={`${styles.kpiCard} ${analytics.tEspera > 15 ? styles.kpiDanger : ''}`}>
                    <div className={styles.kpiLabel}><Clock size={16} /> T. Espera Prom.</div>
                    <div className={styles.kpiValue}>{analytics.tEspera}<small> min</small></div>
                    {analytics.tEspera > 15 && <div className={styles.kpiAlert}><AlertTriangle size={13} /> SLA Excedido</div>}
                  </div>
                  <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}><Clock size={16} /> T. Atención Prom.</div>
                    <div className={styles.kpiValue}>{analytics.tAtencion}<small> min</small></div>
                  </div>
                </div>

                {/* ── Analítica con datos reales ── */}
                <div className={styles.card} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.cardHead}>
                    <Activity size={18} className={styles.cardHeadIcon} />
                    <h2>Analítica del Sistema</h2>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                    <span className={styles.chip}><BarChart3 size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Total turnos: {analytics.total}</span>
                    <span className={styles.chip}>Hoy: {analytics.hoy}</span>
                    {analytics.tendencia !== null && (
                      <span className={styles.chip} style={{ color: analytics.tendencia >= 0 ? 'var(--success)' : 'var(--destructive)', fontWeight: 700 }}>
                        {analytics.tendencia >= 0 ? '▲' : '▼'} {Math.abs(analytics.tendencia)}% vs semana anterior
                      </span>
                    )}
                    <span className={styles.chip}><Users size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Usuarios registrados: {usuariosCount}</span>
                    <span className={styles.chip}><Building2 size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Dependencias: {sedes.length + 1}</span>
                  </div>

                  {/* Turnos por día — últimos 7 días */}
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Turnos por día (últimos 7 días)</h3>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.5rem', height: '150px' }}>
                    {(() => {
                      const max = Math.max(...analytics.porDia.map(d => d.count), 1);
                      return analytics.porDia.map(d => (
                        <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                          <strong style={{ fontSize: '0.72rem' }}>{d.count || ''}</strong>
                          <div
                            title={`${d.count} turnos`}
                            style={{
                              width: '70%', maxWidth: '52px',
                              height: `${Math.max((d.count / max) * 100, 2)}%`,
                              background: d.count ? 'var(--primary)' : 'var(--surface-secondary)',
                              borderRadius: '6px 6px 0 0', transition: 'height 0.3s'
                            }}
                          />
                          <small style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{d.label}</small>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Por dependencia y por departamento */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1.25rem' }}>
                    <BarList title="Turnos por dependencia" items={analytics.porDependencia} color="#3b82f6" empty="Sin turnos registrados aún." />
                    <BarList title="Departamentos más solicitados (Top 6)" items={analytics.porDepto} color="#8b5cf6" empty="Sin turnos registrados aún." />
                  </div>

                  {/* Distribución por estado */}
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '1.25rem 0 0.5rem' }}>Estado de los turnos</h3>
                  {(() => {
                    const totalE = Object.values(analytics.estados).reduce((a, b) => a + b, 0) || 1;
                    const estadoMeta: Record<string, { label: string; color: string }> = {
                      espera: { label: 'En espera', color: '#3b82f6' },
                      llamado: { label: 'Llamados', color: '#f59e0b' },
                      atendido: { label: 'Atendidos', color: '#22c55e' },
                      saltado: { label: 'Saltados', color: '#94a3b8' },
                    };
                    return (
                      <>
                        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-secondary)' }}>
                          {Object.entries(analytics.estados).map(([k, v]) => (
                            <div key={k} title={`${estadoMeta[k]?.label || k}: ${v}`} style={{ width: `${(v / totalE) * 100}%`, background: estadoMeta[k]?.color || '#94a3b8' }} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '0.6rem' }}>
                          {Object.entries(analytics.estados).map(([k, v]) => (
                            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
                              <span style={{ width: 10, height: 10, borderRadius: 3, background: estadoMeta[k]?.color || '#94a3b8', display: 'inline-block' }} />
                              {estadoMeta[k]?.label || k}: <strong>{v as number}</strong> ({Math.round(((v as number) / totalE) * 100)}%)
                            </span>
                          ))}
                        </div>
                      </>
                    );
                  })()}
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

                <div className={styles.dangerZone}>
                  <div className={styles.dangerInfo}>
                    <h3><RefreshCw size={18} /> Poner Estadísticas en 0</h3>
                    <p>
                      Elimina todos los turnos históricos de la institución (sede central y todas las dependencias)
                      y deja contadores y gráficos en cero. Usuarios, funcionarios y dependencias no se afectan.
                    </p>
                  </div>
                  <button onClick={handleResetStats} disabled={resettingStats} className={styles.btnDanger}>
                    {resettingStats ? 'Procesando…' : 'Borrar Datos'}
                  </button>
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
                          <small>{f.departamento} · Módulo {f.letra_atencion}{f.sede_id && sedes.find(s => s.id === f.sede_id) ? ` · ${sedes.find(s => s.id === f.sede_id).nombre}` : ''}</small>
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
                  <p className={styles.cardDesc}>
                    Copia estas URLs en Smart TVs o Tablets. Estas URLs corresponden a la sede central;
                    para ver todas las TVs y Tótems (uno por dependencia), usa la pestaña <strong>Pantallas</strong>.
                  </p>
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

            {/* ── TAB: PANTALLAS (TVs y Tótems) ─────────────────────────── */}
            {activeTab === 'pantallas' && (
              <div className={styles.tabContent}>
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <Monitor size={18} className={styles.cardHeadIcon} />
                    <h2>Todas las Pantallas de la Institución</h2>
                  </div>
                  <p className={styles.cardDesc}>
                    {sedes.length + 1} ubicación{(sedes.length + 1) !== 1 ? 'es' : ''} × 2 pantallas = {(sedes.length + 1) * 2} dispositivos en total.
                    Cada TV (sala de espera) y cada Tótem (autoatención) son independientes por dependencia:
                    muestran solo los turnos de su propia fila.
                  </p>
                </div>

                <ScreenCard
                  nombre="Sede Central"
                  sublabel="URLs generales de la institución"
                  turno={instDoc?.currentTurno}
                  ultimo={instDoc?.ultimo_reinicio}
                  funcionarios={funcionarios.filter((f: any) => !f.sede_id).length}
                  tvUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/tv?institution=${institutionId}`}
                  totemUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/totem?institution=${institutionId}`}
                  tvHref={`/tv?institution=${institutionId}`}
                  totemHref={`/totem?institution=${institutionId}`}
                />

                {sedes.map((sede: any) => (
                  <ScreenCard
                    key={sede.id}
                    nombre={sede.nombre}
                    sublabel={sede.direccion || 'Dependencia'}
                    turno={sede.currentTurno}
                    ultimo={sede.ultimo_reinicio}
                    funcionarios={funcionarios.filter((f: any) => f.sede_id === sede.id).length}
                    tvUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/tv?institution=${institutionId}&sede=${sede.id}`}
                    totemUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/totem?institution=${institutionId}&sede=${sede.id}`}
                    tvHref={`/tv?institution=${institutionId}&sede=${sede.id}`}
                    totemHref={`/totem?institution=${institutionId}&sede=${sede.id}`}
                  />
                ))}
              </div>
            )}

            {/* ── TAB: DEPENDENCIAS ─────────────────────────────────────── */}
            {activeTab === 'dependencias' && (
              <div className={styles.tabContent}>
                <div className={styles.card}>
                  <div className={styles.cardHead}>
                    <Building2 size={18} className={styles.cardHeadIcon} />
                    <h2>{editingSedeId ? 'Editar Dependencia' : 'Nueva Dependencia'}</h2>
                  </div>
                  <p className={styles.cardDesc}>
                    Cada dependencia física (sede) tiene sus propios departamentos y oficinas, su propio contador
                    de tickets y una TV y un Tótem totalmente independientes entre sí.
                  </p>
                  <form onSubmit={handleSaveSede} className={styles.userForm}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Nombre de la Dependencia</label>
                        <input type="text" value={newSedeNombre} onChange={e => setNewSedeNombre(e.target.value)} placeholder="Ej: Casa Consistorial, CESFAM Norte…" required />
                      </div>
                      <div className={styles.formGroup}>
                        <label>Dirección (opcional)</label>
                        <input type="text" value={newSedeDir} onChange={e => setNewSedeDir(e.target.value)} placeholder="Ej: Av. Aníbal Pinto 1234" />
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <label>Departamentos / Oficinas de esta dependencia (separados por coma)</label>
                      <textarea rows={3} value={newSedeDeptos} onChange={e => setNewSedeDeptos(e.target.value)} placeholder="OIRS, DIDECO, OMIL, Secretaría…" />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className={styles.btnPrimary} disabled={sedeSaving}>
                        {sedeSaving ? 'Guardando…' : editingSedeId ? <>Guardar Cambios</> : <><Plus size={15} /> Crear Dependencia</>}
                      </button>
                      {editingSedeId && (
                        <button type="button" className={styles.btnGhost} onClick={resetSedeForm}>Cancelar edición</button>
                      )}
                    </div>
                  </form>
                </div>

                {sedes.length === 0 ? (
                  <div className={styles.emptyState} style={{ marginTop: '1.25rem' }}>
                    <Building2 size={36} />
                    <p>Sin dependencias creadas. La institución opera con una sede central única (URLs genéricas de TV y Tótem).</p>
                  </div>
                ) : sedes.map(sede => {
                  const tvUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/tv?institution=${institutionId}&sede=${sede.id}`;
                  const totemUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/totem?institution=${institutionId}&sede=${sede.id}`;
                  return (
                    <div key={sede.id} className={styles.card} style={{ marginTop: '1rem' }}>
                      <div className={styles.deptHeader}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Building2 size={16} /> {sede.nombre}
                        </h3>
                        <span className={styles.deptCount}>{sede.departamentos?.length || 0} departamento{(sede.departamentos?.length || 0) !== 1 ? 's' : ''}</span>
                      </div>
                      {sede.direccion && (
                        <p className={styles.cardDesc} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <MapPin size={12} /> {sede.direccion}
                        </p>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.5rem 0 0.75rem' }}>
                        {(sede.departamentos || []).map((d: string) => (
                          <span key={d} className={styles.chip} data-role="funcionario">{d}</span>
                        ))}
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label><Monitor size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> TV de esta dependencia</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="text" readOnly value={tvUrl} onClick={e => (e.target as HTMLInputElement).select()} style={{ flex: 1, cursor: 'text', background: 'var(--bg-color)' }} />
                            <button type="button" onClick={() => navigator.clipboard.writeText(tvUrl)} className={styles.btnPrimary}>Copiar</button>
                            <a href={`/tv?institution=${institutionId}&sede=${sede.id}`} target="_blank" rel="noopener noreferrer" className={styles.btnGhost} style={{ padding: '0 0.75rem' }}><Eye size={16} /></a>
                          </div>
                        </div>
                        <div className={styles.formGroup}>
                          <label><Tablet size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Tótem de esta dependencia</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="text" readOnly value={totemUrl} onClick={e => (e.target as HTMLInputElement).select()} style={{ flex: 1, cursor: 'text', background: 'var(--bg-color)' }} />
                            <button type="button" onClick={() => navigator.clipboard.writeText(totemUrl)} className={styles.btnPrimary}>Copiar</button>
                            <a href={`/totem?institution=${institutionId}&sede=${sede.id}`} target="_blank" rel="noopener noreferrer" className={styles.btnGhost} style={{ padding: '0 0.75rem' }}><Eye size={16} /></a>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="button" className={styles.btnGhost} onClick={() => startEditSede(sede)}>
                          <Pencil size={14} /> Editar
                        </button>
                        <button type="button" className={styles.btnDanger} onClick={() => handleDeleteSede(sede.id, sede.nombre)}>
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                      <h3>Pendientes de Aprobación — {institutionName} ({pendingFuncionarios.length})</h3>
                    </div>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr><th>Nombre</th><th>Email</th><th>Cargo</th><th>Departamento</th><th>Dependencia</th><th>Acciones</th></tr>
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
                                <select
                                  value={f.sede_id || ''}
                                  onChange={e => updateFuncionario(f.id, 'sede_id', e.target.value)}
                                  className={styles.selectField}
                                  style={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem', width: 'auto', minWidth: '130px' }}
                                >
                                  <option value="">Sede central</option>
                                  {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
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

                {/* ── Administradores de la institución ──────────────────── */}
                {institutionId && (
                  <div className={styles.card} style={{ marginTop: pendingFuncionarios.length > 0 ? '1.25rem' : 0 }}>
                    <div className={styles.cardHead}>
                      <Shield size={18} className={styles.cardHeadIcon} />
                      <h2>Administradores de {institutionName}</h2>
                    </div>
                    <p className={styles.cardDesc}>Registra otros administradores para que gestionen esta institución.</p>

                    {/* Admin registration form */}
                    <form onSubmit={handleRegisterAdminByAdmin} className={styles.userForm}>
                      {adminMsg && <div className={adminMsg.startsWith('✅') ? styles.msgSuccess : styles.msgError}>{adminMsg}</div>}
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
                          <label>Cargo</label>
                          <input value={funcCargo} onChange={e => setFuncCargo(e.target.value)} placeholder="Administrador" />
                        </div>
                      </div>
                      <button type="submit" className={styles.btnPrimary} disabled={adminLoading}>
                        {adminLoading ? 'Registrando…' : <><Shield size={15} /> Registrar Administrador</>}
                      </button>
                    </form>

                    {/* Admin list for this institution */}
                    <div style={{ marginTop: '1.25rem' }}>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                        Administradores de esta institución
                      </h3>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr><th>Nombre</th><th>Email</th><th>Estado</th><th>Acción</th></tr>
                          </thead>
                          <tbody>
                            {allAdmins
                              .filter(a => a.institution_id === institutionId)
                              .map(a => (
                              <tr key={a.id}>
                                <td>{a.nombre}</td>
                                <td>{a.email || '—'}</td>
                                <td><span className={styles.chip} data-role={a.estado_funcionario === 'activo' ? 'admin' : 'funcionario'}>{a.estado_funcionario || 'inactivo'}</span></td>
                                <td>
                                  <button className={styles.btnDanger} onClick={() => handleDeleteAdmin(a.id, a.nombre)} style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}>
                                    <Trash2 size={13} /> Eliminar
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {allAdmins.filter(a => a.institution_id === institutionId).length === 0 && (
                              <tr><td colSpan={4} className={styles.noData}>Sin administradores para esta institución.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Register form */}
                <div className={styles.card} style={{ marginTop: '1.25rem' }}>
                  <div className={styles.cardHead}>
                    <UserPlus size={18} className={styles.cardHeadIcon} />
                    <h2>Registrar Funcionario</h2>
                  </div>
                  <p className={styles.cardDesc}>
                    Institución: <strong>{institutionName}</strong>
                  </p>
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
                        <label>Dependencia (Sede)</label>
                        <select value={funcSede} onChange={e => setFuncSede(e.target.value)} className={styles.selectField}>
                          <option value="">Sede central / Sin dependencia</option>
                          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
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

                {/* ── Carga Masiva desde Excel ──────────────────── */}
                <div className={styles.card} style={{ marginTop: '1.25rem' }}>
                  <div className={styles.cardHead}>
                    <Upload size={18} className={styles.cardHeadIcon} />
                    <h2>Carga Masiva de Funcionarios</h2>
                  </div>
                  <p className={styles.cardDesc}>
                    Sube un Excel con columna <strong>EMAIL INSTITUCIONAL</strong>. Se crearán Auth + perfil con contraseña <code style={{ background: 'var(--surface-secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.85rem' }}>{BULK_PASS}</code>.
                  </p>
                  <label className={styles.btnPrimary} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Upload size={15} /> Seleccionar Excel
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkExcel} style={{ display: 'none' }} />
                  </label>
                  {bulkFileName && <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{bulkFileName} — {bulkRows.length} fila{bulkRows.length !== 1 ? 's' : ''}</span>}

                  {bulkRows.length > 0 && !bulkLoading && bulkResults.ok.length === 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Vista previa ({bulkRows.length} usuarios)</span>
                        <button className={styles.btnPrimary} onClick={handleBulkCreate} disabled={!institutionId}>
                          <Upload size={15} /> Crear {bulkRows.length} Funcionarios
                        </button>
                      </div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        <table className={styles.table}>
                          <thead><tr><th>Email</th><th>Nombre</th><th>Depto</th><th>Cargo</th></tr></thead>
                          <tbody>
                            {bulkRows.map((row: any, i: number) => {
                              const em = (row['EMAIL INSTITUCIONAL'] || '').toString().trim();
                              const nm = [row['NOMBRES'], row['APELLIDO_1'], row['APELLIDO_2']].filter(Boolean).map((s: any) => String(s).trim()).join(' ');
                              return (
                                <tr key={i}>
                                  <td style={{ fontSize: '0.82rem', fontWeight: 600, color: em && em.includes('@') ? 'var(--text-primary)' : 'var(--destructive)' }}>{em || `Fila ${i + 2}: sin email`}</td>
                                  <td style={{ fontSize: '0.82rem' }}>{nm || '—'}</td>
                                  <td style={{ fontSize: '0.82rem' }}>{(row['PROGRAMA O DEPARTAMENTO'] || '').toString().trim()}</td>
                                  <td style={{ fontSize: '0.82rem' }}>{(row['CARGO '] || row['CARGO'] || '').toString().trim()}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {bulkLoading && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        <span>Creando usuarios…</span>
                        <span>{bulkProgress.current} / {bulkProgress.total}</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--surface-secondary)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${bulkProgress.total ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%`, height: '100%', background: 'var(--primary)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  )}

                  {(bulkResults.ok.length > 0 || bulkResults.fail.length > 0) && (
                    <div style={{ marginTop: '1rem' }}>
                      {bulkResults.ok.length > 0 && (
                        <div style={{ padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                          <strong style={{ color: 'var(--success)' }}>✅ {bulkResults.ok.length} creados:</strong> {bulkResults.ok.join(', ')}
                        </div>
                      )}
                      {bulkResults.fail.length > 0 && (
                        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '0.85rem' }}>
                          <strong style={{ color: 'var(--destructive)' }}>❌ {bulkResults.fail.length} fallidos:</strong>
                          <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                            {bulkResults.fail.map((f, i) => <li key={i}><strong>{f.email}</strong>: {f.error}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
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
                            <tr><th>Perfil</th><th>Nombre</th><th>Cargo</th><th>Dependencia</th><th>Módulo</th><th>Estado</th><th>Acciones</th></tr>
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
                                <td>
                                  <select
                                    value={f.sede_id || ''}
                                    onChange={e => updateFuncionario(f.id, 'sede_id', e.target.value)}
                                    className={styles.selectField}
                                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.82rem', width: 'auto', minWidth: '120px' }}
                                  >
                                    <option value="">Sede central</option>
                                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <ModuleEditor
                                    funcionario={f}
                                    onSaved={(newLetra) => {
                                      setFuncionarios(prev => prev.map(x => x.id === f.id ? { ...x, letra_atencion: newLetra } : x));
                                    }}
                                  />
                                </td>
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
                            {funcs.length === 0 && <tr><td colSpan={7} className={styles.noData}>Sin funcionarios en este departamento.</td></tr>}
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
                  <div className={styles.reportCard}>
                    <div className={styles.reportCardIcon}><ClipboardList size={28} /></div>
                    <h3>Bitácora de Atenciones</h3>
                    <p>Registro detallado de cada atención finalizada con paciente, funcionario y horarios.</p>
                    <button className={styles.btnPrimary} onClick={exportBitacora}><Download size={16} /> Descargar Bitácora (CSV)</button>
                  </div>
                </div>

                <div className={styles.card} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.cardHead}><BarChart3 size={18} className={styles.cardHeadIcon} /><h2>Métricas en Tiempo Real</h2></div>
                  <div className={styles.metricsGrid}>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{analytics.enEspera}</span><span className={styles.metricLabel}>En Espera</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal} style={{ color: 'var(--success)' }}>{analytics.atendidosHoy}</span><span className={styles.metricLabel}>Atendidos Hoy</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal} style={{ color: analytics.tEspera > 15 ? 'var(--destructive)' : 'var(--primary)' }}>{analytics.tEspera} min</span><span className={styles.metricLabel}>Espera Prom.</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{analytics.tAtencion} min</span><span className={styles.metricLabel}>Atención Prom.</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{funcionarios.filter(f => f.estado_funcionario === 'activo').length}</span><span className={styles.metricLabel}>Activos</span></div>
                    <div className={styles.metricItem}><span className={styles.metricVal}>{deptosList.length}</span><span className={styles.metricLabel}>Departamentos</span></div>
                  </div>
                </div>

                <div className={styles.card} style={{ marginTop: '1.5rem' }}>
                  <div className={styles.cardHead}><ClipboardList size={18} className={styles.cardHeadIcon} /><h2>Bitácora de Atenciones</h2></div>
                  {bitacoraLoading ? (
                    <p style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Cargando bitácora...</p>
                  ) : bitacora.length === 0 ? (
                    <p style={{ padding: '1rem', color: 'var(--text-tertiary)' }}>Sin atenciones registradas.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr><th>Paciente</th><th>RUT</th><th>Funcionario</th><th>Depto</th><th>Ticket</th><th>Inicio</th><th>Término</th></tr>
                        </thead>
                        <tbody>
                          {bitacora.slice(0, 100).map(b => (
                            <tr key={b.id}>
                              <td>{b.nombre_paciente || '—'}</td>
                              <td>{b.rut_usuario || '—'}</td>
                              <td>{b.nombre_funcionario || '—'}</td>
                              <td>{b.departamento || '—'}</td>
                              <td>{b.letra_ticket ? `${b.letra_ticket}-${b.numero}` : b.numero}</td>
                              <td>{b.called_at ? new Date(b.called_at).toLocaleString() : '—'}</td>
                              <td>{b.finished_at ? new Date(b.finished_at).toLocaleString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
