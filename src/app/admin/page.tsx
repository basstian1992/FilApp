'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, updateDoc, orderBy, addDoc, getDoc } from 'firebase/firestore';
import styles from './admin.module.css';
import { Settings, BarChart3, Users, Clock, AlertTriangle, Download, LogOut, Building2, UserPlus, ArrowLeft, Plus } from 'lucide-react';
import UserDirectory from '@/components/UserDirectory';

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Dashboard states
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [allAdmins, setAllAdmins] = useState<any[]>([]);
  
  // New Institution Form
  const [showNewInstForm, setShowNewInstForm] = useState(false);
  const [newInstName, setNewInstName] = useState('');
  
  // Detail View states
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [tvName, setTvName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [tvPrimaryColor, setTvPrimaryColor] = useState('#3b82f6');
  const [tvBackgroundUrl, setTvBackgroundUrl] = useState('');
  const [mensajeDia, setMensajeDia] = useState('');
  const [departamentosStr, setDepartamentosStr] = useState('OIRS, Atención General');
  const [oirsDepartamento, setOirsDepartamento] = useState('OIRS');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [resetLogs, setResetLogs] = useState<any[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [stats, setStats] = useState({
    enEspera: 0,
    atendidosHoy: 0,
    tiempoPromedioEspera: 0,
    tiempoPromedioAtencion: 0,
  });
  const [funcionarios, setFuncionarios] = useState<any[]>([]);

  // Auth States
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Forms
  const [showNewFuncForm, setShowNewFuncForm] = useState(false);
  const [newUserRole, setNewUserRole] = useState<'funcionario' | 'admin'>('funcionario');
  const [newFuncEmail, setNewFuncEmail] = useState('');
  const [newFuncPassword, setNewFuncPassword] = useState('');
  const [newFuncName, setNewFuncName] = useState('');
  const [newFuncDepto, setNewFuncDepto] = useState('');
  const [newFuncCargo, setNewFuncCargo] = useState('');
  const [newFuncLetra, setNewFuncLetra] = useState('');
  const [newFuncMessage, setNewFuncMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setSession(user);
      if (user) {
        let isGerente = user.email?.toLowerCase() === 'b.alarconatenas@gmail.com';
        let data: any = null;

        const q = query(collection(db, 'especialistas'), where('user_id', '==', user.uid));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          data = snap.docs[0].data();
        }

        if (isGerente && !data) {
          // Auto-create gerente profile if missing
          const newGerente = {
            user_id: user.uid,
            role: 'gerente',
            nombre: 'Gerente General',
            estado_funcionario: 'activo',
            email: user.email
          };
          await setDoc(doc(db, 'especialistas', user.uid), newGerente);
          data = newGerente;
        }

        if (isGerente) {
          data.role = 'gerente';
        }

        if (!data || !['admin', 'gerente'].includes(data.role)) {
          setAuthError('Acceso denegado: Solo administradores o gerentes pueden acceder a este panel.');
          setLoading(false);
          await signOut(auth);
          return;
        }

        setUserProfile(data);
        await loadDashboardData(user.uid, data.role);
        setLoading(false);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadDashboardData = async (userId: string, role: string) => {
    try {
      if (role === 'gerente') {
        const instSnap = await getDocs(collection(db, 'institutions'));
        setInstitutions(instSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const adminQ = query(collection(db, 'especialistas'), where('role', '==', 'admin'));
        const adminSnap = await getDocs(adminQ);
        setAllAdmins(adminSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        const q = query(collection(db, 'institutions'), where('owner_id', '==', userId));
        const instSnap = await getDocs(q);
        setInstitutions(instSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstName.trim() || !userProfile) return;
    
    if (userProfile.role !== 'gerente' && institutions.length >= 50) {
      alert('Has alcanzado el límite máximo de 50 instituciones.');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'institutions'), {
        name: newInstName.trim(),
        owner_id: userProfile.user_id,
        owner_email: session.email,
        created_at: new Date().toISOString(),
        currentTurno: 0,
        config: {
          tv_name: newInstName.trim(),
          departamentos: ['OIRS', 'Atención General'],
          tv_primary_color: '#3b82f6'
        }
      });
      setNewInstName('');
      setShowNewInstForm(false);
      await loadDashboardData(userProfile.user_id, userProfile.role);
      alert(`Institución creada con éxito. ID: ${docRef.id}`);
    } catch (e) {
      alert("Error al crear institución");
    }
  };

  const openInstitutionDetail = async (instId: string) => {
    setLoading(true);
    try {
      const instSnap = await getDoc(doc(db, 'institutions', instId));
      if (instSnap.exists()) {
        const instData = instSnap.data();
        setInstitutionId(instId);
        setInstitutionName(instData.name || '');
        setTvName(instData.config?.tv_name || instData.name || '');
        setLogoUrl(instData.config?.logo_url || '');
        setTvPrimaryColor(instData.config?.tv_primary_color || '#3b82f6');
        setTvBackgroundUrl(instData.config?.tv_background_url || '');
        setMensajeDia(instData.config?.mensaje_dia || '');
        setDepartamentosStr((instData.config?.departamentos || ['OIRS', 'Atención General']).join(', '));
        setOirsDepartamento(instData.config?.oirs_departamento || 'OIRS');
        setWebhookUrl(instData.config?.n8n_webhook_url || '');
        setResetLogs(instData.reset_logs || []);
        
        await loadFuncionarios(instId);
        setView('detail');
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadFuncionarios = async (instId: string) => {
    const q = query(collection(db, 'especialistas'), where('institution_id', '==', instId));
    const snap = await getDocs(q);
    setFuncionarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    if (view !== 'detail' || !institutionId) return;
    const unsubTurnos = onSnapshot(collection(db, 'turnos'), () => {
      fetchStats();
    });
    fetchStats();
    return () => unsubTurnos();
  }, [view, institutionId]);

  const fetchStats = async () => {
    if (!institutionId) return;
    try {
      const qWait = query(
        collection(db, 'turnos'),
        where('estado', '==', 'espera'),
        where('institution_id', '==', institutionId)
      );
      const waitSnap = await getDocs(qWait);

      const qAttended = query(
        collection(db, 'turnos'),
        where('estado', '==', 'atendido'),
        where('institution_id', '==', institutionId)
      );
      const attSnap = await getDocs(qAttended);

      let totalEspera = 0;
      let totalAtencion = 0;
      let count = 0;

      attSnap.forEach(doc => {
        const t = doc.data();
        if (t.called_at && t.created_at) {
          const espera = (new Date(t.called_at).getTime() - new Date(t.created_at).getTime()) / 60000;
          totalEspera += espera;
        }
        if (t.finished_at && t.called_at) {
          const atencion = (new Date(t.finished_at).getTime() - new Date(t.called_at).getTime()) / 60000;
          totalAtencion += atencion;
        }
        count++;
      });

      setStats({
        enEspera: waitSnap.size || 0,
        atendidosHoy: attSnap.size || 0,
        tiempoPromedioEspera: count ? Math.round(totalEspera / count) : 0,
        tiempoPromedioAtencion: count ? Math.round(totalAtencion / count) : 0,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setAuthError(err.message || 'Error al iniciar sesión.');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  const handleReiniciarConteo = async () => {
    if (!institutionId || !userProfile) return;
    if (!confirm('¿Estás seguro de que deseas reiniciar el conteo diario a cero? Esta acción quedará registrada.')) return;
    
    try {
      const instRef = doc(db, 'institutions', institutionId);
      const instSnap = await getDoc(instRef);
      if (instSnap.exists()) {
        const data = instSnap.data();
        const logs = data.reset_logs || [];
        
        const newLog = {
          nombre: userProfile.nombre,
          fecha: new Date().toISOString()
        };
        
        const updatedLogs = [newLog, ...logs].slice(0, 3);
        
        await updateDoc(instRef, {
          currentTurno: 0,
          ultimo_reinicio: new Date().toISOString(),
          reset_logs: updatedLogs
        });
        
        alert("El conteo se ha reiniciado correctamente.");
        setResetLogs(updatedLogs);
      }
    } catch (e) {
      console.error(e);
      alert("Error al reiniciar conteo");
    }
  };

  const saveConfig = async () => {
    if (!institutionId) return;
    setSavingConfig(true);
    try {
      await updateDoc(doc(db, 'institutions', institutionId), {
        config: {
          tv_name: tvName.trim() || institutionName,
          logo_url: logoUrl.trim(),
          tv_primary_color: tvPrimaryColor,
          tv_background_url: tvBackgroundUrl.trim(),
          mensaje_dia: mensajeDia,
          departamentos: departamentosStr.split(',').map(s => s.trim()).filter(Boolean),
          oirs_departamento: oirsDepartamento.trim(),
          n8n_webhook_url: webhookUrl.trim(),
        }
      });
      alert("Configuración guardada");
    } catch (e) {
      console.error(e);
      alert("Error al guardar configuración");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRegisterUser = async (e: React.FormEvent, forceRole?: 'admin' | 'funcionario') => {
    e.preventDefault();
    setNewFuncMessage('');

    try {
      const role = forceRole || newUserRole;
      
      const userCred = await createUserWithEmailAndPassword(auth, newFuncEmail, newFuncPassword);

      await setDoc(doc(db, 'especialistas', userCred.user.uid), {
        user_id: userCred.user.uid,
        institution_id: institutionId || '', // Admins might not have one initially
        role: role,
        nombre: newFuncName || (role === 'admin' ? 'Administrador' : 'Funcionario'),
        departamento: role === 'admin' ? 'Administración' : newFuncDepto,
        cargo: newFuncCargo || (role === 'admin' ? 'Administrador' : 'Funcionario'),
        estado_funcionario: 'inactivo',
        avatar_url: '',
        letra_atencion: newFuncLetra || newFuncEmail.split('@')[0].toUpperCase().substring(0, 2),
        whatsapp_phone: '',
        whatsapp_apikey: '',
      });

      const roleLabel = role === 'admin' ? 'Administrador' : 'Funcionario';
      setNewFuncMessage(`${roleLabel} ${newFuncName} registrado exitosamente.`);
      setNewFuncEmail('');
      setNewFuncPassword('');
      setNewFuncName('');
      setNewFuncCargo('');
      setNewFuncLetra('');
      
      if (view === 'detail' && institutionId) {
        await loadFuncionarios(institutionId);
      } else if (view === 'dashboard' && userProfile.role === 'gerente') {
        await loadDashboardData(userProfile.user_id, 'gerente');
      }
    } catch (err: any) {
      setNewFuncMessage(`Error: ${err.message}`);
    }
  };

  const updateFuncionario = async (id: string, field: string, value: string) => {
    try {
      await updateDoc(doc(db, 'especialistas', id), { [field]: value });
      setFuncionarios(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    } catch (e) {
      alert("Error al actualizar");
    }
  };

  const exportToCSV = (filename: string, rows: any[]) => {
    if (!rows || !rows.length) {
      alert("No hay datos para exportar");
      return;
    }
    const separator = ',';
    const keys = Object.keys(rows[0]);
    const csvContent =
      keys.join(separator) +
      '\n' +
      rows.map(row => {
        return keys.map(k => {
          let cell = row[k] === null || row[k] === undefined ? '' : row[k];
          cell = cell instanceof Date
            ? cell.toLocaleString()
            : cell.toString().replace(/"/g, '""');
          if (cell.search(/("|,|\n)/g) >= 0) {
            cell = `"${cell}"`;
          }
          return cell;
        }).join(separator);
      }).join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportUsuarios = async () => {
    if (!institutionId) return;
    try {
      const q = query(collection(db, 'usuarios'), where('institution_id', '==', institutionId));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => {
        const docData = d.data();
        return {
          RUT: d.id,
          Fecha_Ingreso: docData.created_at ? new Date(docData.created_at).toLocaleString() : ''
        };
      });
      exportToCSV('usuarios_filapp.csv', data);
    } catch (e) {
      alert("Error exportando usuarios");
    }
  };

  const handleExportTurnos = async () => {
    if (!institutionId) return;
    try {
      const q = query(
        collection(db, 'turnos'),
        where('institution_id', '==', institutionId),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => {
        const t = d.data();
        return {
          ID_Turno: d.id,
          Estado: t.estado,
          RUT_Usuario: t.rut_usuario || '',
          Departamento: t.departamento_solicitado || '',
          Prioridad: t.is_appointment ? 'Alta (Cita)' : 'Normal',
          Funcionario: t.nombre_funcionario || '',
          Cargo: t.cargo_funcionario || '',
          Modulo: t.letra_especialista || '',
          Creado_En: t.created_at ? new Date(t.created_at).toLocaleString() : '',
          Llamado_En: t.called_at ? new Date(t.called_at).toLocaleString() : '',
          Finalizado_En: t.finished_at ? new Date(t.finished_at).toLocaleString() : ''
        };
      });
      exportToCSV('turnos_filapp.csv', data);
    } catch (e) {
      alert("Error exportando turnos");
    }
  };

  const handleExportFuncionarios = () => {
    const data = funcionarios.map((f: any) => ({
      Nombre: f.nombre || '',
      Rol: f.role || 'funcionario',
      Departamento: f.departamento || '',
      Cargo: f.cargo || '',
      Modulo: f.letra_atencion || '',
      Estado: f.estado_funcionario || 'inactivo'
    }));
    exportToCSV('funcionarios_filapp.csv', data);
  };

  if (loading && !session) {
    return <div className={styles.centerLoad}>Cargando panel de administración...</div>;
  }

  if (!session) {
    return (
      <main className={styles.authContainer}>
        <form onSubmit={handleLogin} className={styles.authCard}>
          <h2>Acceso Gerencial</h2>
          <p>Ingrese con credenciales de administrador o gerente.</p>
          {authError && <div className={styles.errorBanner}>{authError}</div>}
          <div className={styles.inputGroup}>
            <label>Correo Electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className={styles.inputGroup}>
            <label>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </main>
    );
  }

  if (authError) {
    return <div className={styles.centerLoad}>{authError}</div>;
  }

  const departamentosList = departamentosStr.split(',').map(s => s.trim()).filter(Boolean);

  if (loading) return <div className={styles.centerLoad}>Cargando...</div>;

  return (
    <div className={styles.adminContainer}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Settings size={28} />
          <div>
            <h1>{userProfile?.role === 'gerente' ? 'Panel Gerencial' : 'Panel de Administración'}</h1>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <UserPlus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Hola, {userProfile?.nombre} ({userProfile?.role})
            </span>
          </div>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} /> Salir
        </button>
      </header>

      <main className={styles.content}>
        {view === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-6)' }}>
              <h2>Mis Instituciones ({institutions.length}{userProfile?.role !== 'gerente' ? '/50' : ''})</h2>
              {(userProfile?.role === 'gerente' || institutions.length < 50) && (
                <button className={styles.primaryBtn} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={() => setShowNewInstForm(!showNewInstForm)}>
                  <Plus size={18} /> Crear Nueva Institución
                </button>
              )}
            </div>

            {showNewInstForm && (
              <form onSubmit={handleCreateInstitution} className={styles.configSection} style={{ marginBottom: 'var(--spacing-6)' }}>
                <h3>Crear Nueva Institución</h3>
                <div className={styles.formGroup}>
                  <label>Nombre de la Institución</label>
                  <input type="text" value={newInstName} onChange={e => setNewInstName(e.target.value)} placeholder="Ej: CESFAM Norte" required />
                </div>
                <button type="submit" className={styles.primaryBtn}>Guardar Institución</button>
              </form>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
              {institutions.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No tienes instituciones creadas.</p>
              ) : (
                institutions.map(inst => (
                  <div key={inst.id} className={styles.configSection} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} onClick={() => openInstitutionDetail(inst.id)}>
                      <Building2 size={32} color={inst.config?.tv_primary_color || 'var(--primary)'} />
                      <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{inst.name}</h3>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {inst.config?.departamentos?.length || 0} Categorías configuradas
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <button onClick={() => openInstitutionDetail(inst.id)} className={styles.primaryBtn} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', flex: 1 }}>
                        Gestionar (Funcionarios/Usuarios)
                      </button>
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const q = query(collection(db, 'usuarios'), where('institution_id', '==', inst.id));
                            const snap = await getDocs(q);
                            const data = snap.docs.map(d => ({ RUT: d.id, ...d.data() }));
                            exportToCSV(`bd_usuarios_${inst.name.replace(/\s+/g, '_')}.csv`, data);
                          } catch(err) { alert('Error al exportar BD'); }
                        }} 
                        className={styles.exportBtn} 
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                        <Download size={14} /> BD Usuarios
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {userProfile?.role === 'gerente' && (
              <section className={styles.configSection}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 'var(--spacing-4)' }}>
                  <UserPlus size={20} />
                  <h2 style={{ margin: 0 }}>Crear Administrador</h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Los administradores pueden crear sus propias instituciones y gestionar a sus funcionarios.</p>
                <form onSubmit={e => handleRegisterUser(e, 'admin')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                  {newFuncMessage && (
                    <div className={newFuncMessage.startsWith('Error') ? styles.errorBanner : styles.successBanner}>
                      {newFuncMessage}
                    </div>
                  )}
                  <div className={styles.formGroup}>
                    <label>Correo Electrónico</label>
                    <input type="email" value={newFuncEmail} onChange={e => setNewFuncEmail(e.target.value)} placeholder="admin@ejemplo.com" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Contraseña temporal</label>
                    <input type="password" value={newFuncPassword} onChange={e => setNewFuncPassword(e.target.value)} required minLength={6} />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Nombre Completo</label>
                    <input type="text" value={newFuncName} onChange={e => setNewFuncName(e.target.value)} placeholder="Ej: Juan Pérez" required />
                  </div>
                  <button type="submit" className={styles.primaryBtn}>Registrar Administrador</button>
                </form>

                <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Lista de Administradores del Sistema</h3>
                <table className={styles.table}>
                  <thead><tr><th>Email</th><th>Nombre</th><th>Rol</th></tr></thead>
                  <tbody>
                    {allAdmins.map(a => (
                      <tr key={a.id}>
                        <td>{a.email || 'N/A'}</td>
                        <td>{a.nombre}</td>
                        <td><span className={styles.roleChip} data-role={a.role}>{a.role}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}

        {view === 'detail' && (
          <div>
            <button className={styles.exportBtn} style={{ marginBottom: '1.5rem', background: 'transparent', border: 'none', color: 'var(--primary)', padding: 0 }} onClick={() => setView('dashboard')}>
              <ArrowLeft size={18} /> Volver al Dashboard
            </button>
            <h1 style={{ marginBottom: '2rem', fontSize: '2rem', color: 'var(--text-primary)' }}>{institutionName}</h1>

            <section className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span>En Espera</span>
                  <Users color="var(--primary)" />
                </div>
                <div className={styles.kpiValue}>{stats.enEspera}</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span>Atendidos Hoy</span>
                  <BarChart3 color="var(--success)" />
                </div>
                <div className={styles.kpiValue}>{stats.atendidosHoy}</div>
              </div>

              <div className={`${styles.kpiCard} ${stats.tiempoPromedioEspera > 15 ? styles.kpiWarning : ''}`}>
                <div className={styles.kpiHeader}>
                  <span>Tiempo Promedio Espera (SLA)</span>
                  <Clock />
                </div>
                <div className={styles.kpiValue}>{stats.tiempoPromedioEspera} min</div>
                {stats.tiempoPromedioEspera > 15 && <div className={styles.warningAlert}><AlertTriangle size={14}/> SLA Excedido</div>}
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span>T. Promedio Atención</span>
                  <Clock color="var(--accent)" />
                </div>
                <div className={styles.kpiValue}>{stats.tiempoPromedioAtencion} min</div>
              </div>
            </section>

            <div className={styles.resetSection} style={{ background: 'rgba(220, 38, 38, 0.05)', border: '1px solid rgba(220, 38, 38, 0.2)', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: 'var(--destructive)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={20} /> Reinicio Manual de Conteo
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Esta acción pondrá el contador de tickets en 0. Usa esto solo si hubo un error en la apertura.
                </p>
                {resetLogs.length > 0 && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                    <strong>Últimos reinicios:</strong>
                    <ul style={{ margin: 0, paddingLeft: '1rem', marginTop: '0.25rem' }}>
                      {resetLogs.map((log, i) => (
                        <li key={i}>{log.nombre} - {new Date(log.fecha).toLocaleString()}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <button className={styles.destructiveBtn} onClick={handleReiniciarConteo} style={{ background: 'var(--destructive)', color: 'white', padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                Reiniciar Conteo a 0
              </button>
            </div>

            <div className={styles.bottomGrid}>
              <section className={styles.configSection}>
                <h2>Configuración de la Institución (Pantalla TV)</h2>
                <div className={styles.formGroup}>
                  <label>Nombre de la Institución en TV</label>
                  <input type="text" value={tvName} onChange={e => setTvName(e.target.value)} placeholder="Ej: CESFAM Dr. Barros Luco" />
                </div>
                <div className={styles.formGroup}>
                  <label>Logo de la Institución (URL de la imagen)</label>
                  <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://ejemplo.com/logo.png" />
                </div>
                <div className={styles.formGroup}>
                  <label>Color Primario (TV y App)</label>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input type="color" value={tvPrimaryColor} onChange={e => setTvPrimaryColor(e.target.value)} style={{ width: '50px', height: '40px', padding: '0', cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                    <input type="text" value={tvPrimaryColor} onChange={e => setTvPrimaryColor(e.target.value)} style={{ flex: 1 }} />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label>Fondo de TV Personalizado (URL imagen)</label>
                  <input type="url" value={tvBackgroundUrl} onChange={e => setTvBackgroundUrl(e.target.value)} placeholder="Dejar vacío para usar el tema oscuro por defecto" />
                </div>
                <div className={styles.formGroup}>
                  <label>Mensaje del Día (TV)</label>
                  <textarea rows={2} value={mensajeDia} onChange={e => setMensajeDia(e.target.value)} placeholder="Escribe el mensaje que se deslizará en la pantalla principal..." />
                </div>
                <div className={styles.formGroup}>
                  <label>Categorías / Dependencias (Separados por coma)</label>
                  <textarea rows={4} value={departamentosStr} onChange={e => setDepartamentosStr(e.target.value)} placeholder="Ej: OIRS, Atención General, DIDECO... (Soporta hasta 200+)" />
                </div>
                <div className={styles.formGroup}>
                  <label>Departamento OIRS (Orientación)</label>
                  <input type="text" value={oirsDepartamento} onChange={e => setOirsDepartamento(e.target.value)} placeholder="OIRS" />
                </div>
                <div className={styles.formGroup}>
                  <label>Webhook URL (n8n)</label>
                  <input type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://tu-n8n.com/webhook/..." />
                </div>
                <button className={styles.primaryBtn} onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </section>

              <section className={styles.configSection}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 'var(--spacing-4)' }}>
                  <UserPlus size={20} />
                  <h2 style={{ margin: 0 }}>Registrar Funcionario</h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Los funcionarios atenderán al público en las distintas categorías de esta institución.</p>
                <form onSubmit={e => handleRegisterUser(e, 'funcionario')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                  {newFuncMessage && (
                    <div className={newFuncMessage.startsWith('Error') ? styles.errorBanner : styles.successBanner}>
                      {newFuncMessage}
                    </div>
                  )}
                  <div className={styles.formGroup}>
                    <label>Correo Electrónico</label>
                    <input type="email" value={newFuncEmail} onChange={e => setNewFuncEmail(e.target.value)} placeholder="funcionario@institucion.cl" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Contraseña temporal</label>
                    <input type="password" value={newFuncPassword} onChange={e => setNewFuncPassword(e.target.value)} minLength={6} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Nombre Completo</label>
                    <input type="text" value={newFuncName} onChange={e => setNewFuncName(e.target.value)} placeholder="Ej: María García" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Departamento / Categoría asignada</label>
                    <select value={newFuncDepto} onChange={e => setNewFuncDepto(e.target.value)} required style={{ padding: 'var(--spacing-3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--surface-hover)', color: 'var(--text-primary)' }}>
                      <option value="">Seleccionar...</option>
                      {departamentosList.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Cargo</label>
                    <input type="text" value={newFuncCargo} onChange={e => setNewFuncCargo(e.target.value)} placeholder="Ej: Psicólogo, Asistente Social" />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Módulo / Letra de Atención</label>
                    <input type="text" value={newFuncLetra} onChange={e => setNewFuncLetra(e.target.value)} placeholder="Ej: A, B, Box 1" />
                  </div>
                  <button type="submit" className={styles.primaryBtn}>Registrar Funcionario</button>
                </form>
              </section>
            </div>

            <section className={styles.chartSection} style={{ marginTop: 'var(--spacing-6)' }}>
              <UserDirectory 
                institutionId={institutionId || ''} 
                funcionarioId={userProfile.user_id} 
                funcionarioName={userProfile.nombre}
                role={userProfile.role}
              />
            </section>

            <section className={styles.chartSection} style={{ marginTop: 'var(--spacing-6)', overflowX: 'auto' }}>
              <h2>Gestión de Funcionarios por Departamento</h2>
              {departamentosList.map(depto => {
                const funcs = funcionarios.filter((f: any) => f.departamento === depto);
                return (
                  <div key={depto} className={styles.deptoGroup}>
                    <h3 className={styles.deptoTitle}>{depto}</h3>
                    <table className={styles.table}>
                      <thead><tr><th style={{width: '100px'}}>Perfil</th><th>Nombre</th><th>Rol</th><th>Cargo</th><th>Módulo</th><th>Estado</th></tr></thead>
                      <tbody>
                        {funcs.map((f: any) => (
                          <tr key={f.id}>
                            <td>
                              <div className={styles.adminProfileCell}>
                                <div className={styles.adminAvatarWrapper}>
                                  {f.avatar_url ? <img src={f.avatar_url} alt="Avatar" className={styles.adminAvatarImg} /> : <div className={styles.adminAvatarPlaceholder}>{f.nombre?.substring(0, 2).toUpperCase() || 'FN'}</div>}
                                </div>
                                <span className={styles.statusDot} data-status={f.estado_funcionario || 'inactivo'} />
                              </div>
                            </td>
                            <td><input className={styles.tableInput} value={f.nombre || ''} onChange={e => updateFuncionario(f.id, 'nombre', e.target.value)} /></td>
                            <td><span className={styles.roleChip} data-role={f.role}>{f.role}</span></td>
                            <td><input className={styles.tableInput} value={f.cargo || ''} onChange={e => updateFuncionario(f.id, 'cargo', e.target.value)} /></td>
                            <td><input className={styles.tableInput} value={f.letra_atencion || ''} onChange={e => updateFuncionario(f.id, 'letra_atencion', e.target.value)} /></td>
                            <td>{f.estado_funcionario || 'inactivo'}</td>
                          </tr>
                        ))}
                        {funcs.length === 0 && <tr><td colSpan={6} style={{color: 'var(--text-secondary)'}}>Sin funcionarios asignados.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>

            <section className={styles.exportSection}>
              <h2>Reportes y Exportación de Datos</h2>
              <div className={styles.exportGroup}>
                <button className={styles.exportBtn} onClick={handleExportUsuarios}>
                  <Download size={20} /> Exportar Usuarios (CSV)
                </button>
                <button className={styles.exportBtn} onClick={handleExportTurnos}>
                  <Download size={20} /> Exportar Turnos (CSV)
                </button>
                <button className={styles.exportBtn} onClick={handleExportFuncionarios}>
                  <Download size={20} /> Exportar Funcionarios (CSV)
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
