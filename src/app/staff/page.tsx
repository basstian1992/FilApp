'use client';

import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { triggerWebhook } from '@/lib/notify';
import styles from './staff.module.css';
import { LogOut, User, CheckCircle, SkipForward, Megaphone, Download } from 'lucide-react';

interface Funcionario {
  id: string;
  nombre: string;
  departamento: string;
  cargo?: string;
  estado_funcionario?: string;
  avatar_url?: string;
  letra_atencion: string;
}

interface Turno {
  id: string;
  numero: number;
  letra_ticket?: string;
  rut_usuario: string;
  estado: string;
}

export default function StaffPage() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [departamento, setDepartamento] = useState('OMIL');
  const [cargo, setCargo] = useState('');
  const [letraAtencion, setLetraAtencion] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isEditingLetra, setIsEditingLetra] = useState(false);
  const [newLetra, setNewLetra] = useState('');
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [departamentosDisponibles, setDepartamentosDisponibles] = useState<string[]>(['DIDECO', 'OMIL', 'PRODESAL', 'P.M. Jefas de Hogar', 'Turismo', 'OTEC', 'Fomento', 'Otro']);

  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [currentTurno, setCurrentTurno] = useState<Turno | null>(null);
  const [queueDocs, setQueueDocs] = useState<any[]>([]);
  const [userHistory, setUserHistory] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSession(user);
      if (user) fetchFuncionarioData(user.uid);
      else {
        setFuncionario(null);
        setLoading(false);
      }
    });

    // Cargar departamentos
    const fetchConfig = async () => {
      const c = await getDocs(query(collection(db, 'configuracion')));
      const globalDoc = c.docs.find(d => d.id === 'global');
      if (globalDoc && globalDoc.data().departamentos) {
        setDepartamentosDisponibles(globalDoc.data().departamentos);
      }
    };
    fetchConfig();

    return () => unsubscribe();
  }, []);

  const fetchFuncionarioData = async (userId: string) => {
    try {
      // Use onSnapshot to avoid race conditions when creating new accounts
      const q = query(collection(db, 'especialistas'), where('user_id', '==', userId));
      onSnapshot(q, async (querySnapshot) => {
        if (!querySnapshot.empty) {
          const specDoc = querySnapshot.docs[0];
          const specData = { id: specDoc.id, ...specDoc.data() } as Funcionario;
          
          setFuncionario((prev) => ({ ...specData, estado_funcionario: prev?.estado_funcionario || 'activo' }));
          
          if (!funcionario) {
            // First load for this session
            await updateDoc(doc(db, 'especialistas', specData.id), { estado_funcionario: 'activo' });
            await refreshQueue(specData.id);
          }
          setLoading(false);
        } else {
          // Keep loading if we expect it to be created shortly, or timeout
        }
      });
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const refreshQueue = async (specId: string) => {
    const qEspera = query(collection(db, 'turnos'), where('estado', '==', 'espera'));
    onSnapshot(qEspera, (snap) => {
      setQueueDocs(snap.docs.map(d => d.data()));
    });

    const qActivo = query(collection(db, 'turnos'), where('especialista_id', '==', specId));
    onSnapshot(qActivo, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Turno));
      const activo = docs.find(d => d.estado === 'llamado');
      
      if (activo) {
        setCurrentTurno(activo);
        
        // Cargar historial
        if (activo.rut_usuario) {
          const histQ = query(
            collection(db, 'turnos'),
            where('rut_usuario', '==', activo.rut_usuario),
            where('estado', '==', 'atendido'),
            orderBy('finished_at', 'desc'),
            limit(5)
          );
          const histSnap = await getDocs(histQ);
          setUserHistory(histSnap.docs.map(d => ({id: d.id, ...d.data()})));
        }
      } else {
        setCurrentTurno(null);
        setUserHistory([]);
      }
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        try {
          // Intentar registro automático
          const userCred = await createUserWithEmailAndPassword(auth, email, password);
          // Crear perfil especialista
          await setDoc(doc(db, 'especialistas', userCred.user.uid), {
            user_id: userCred.user.uid,
            nombre: nombre || 'Funcionario Nuevo',
            departamento: departamento,
            cargo: cargo || 'Funcionario',
            estado_funcionario: 'activo',
            avatar_url: '',
            letra_atencion: letraAtencion || email.split('@')[0].toUpperCase().substring(0,2)
          });
          // La sesión se actualizará sola por el onAuthStateChanged
        } catch (regError: any) {
          if (regError.code === 'auth/email-already-in-use') {
            setAuthError('La contraseña es incorrecta.');
          } else {
            setAuthError(regError.message);
          }
          setLoading(false);
        }
      } else {
        setAuthError(error.message);
        setLoading(false);
      }
    }
  };

  const handleLogout = async () => {
    if (funcionario) {
      try {
        await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'inactivo' });
      } catch (e) {}
    }
    await signOut(auth);
  };

  const handleUpdateLetra = async () => {
    if (!funcionario || !newLetra.trim()) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), { letra_atencion: newLetra.trim() });
      setFuncionario({ ...funcionario, letra_atencion: newLetra.trim() });
      setIsEditingLetra(false);
    } catch (e) {
      console.error(e);
      alert('Error al actualizar módulo');
    }
    setLoading(false);
  };

  const handleUpdateAvatar = async () => {
    if (!funcionario) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), { avatar_url: newAvatarUrl.trim() });
      setFuncionario({ ...funcionario, avatar_url: newAvatarUrl.trim() });
      setIsEditingAvatar(false);
    } catch (e) {
      console.error(e);
      alert('Error al actualizar avatar');
    }
    setLoading(false);
  };

  const llamarSiguiente = async () => {
    if (!funcionario) return;
    setLoading(true);
    
    // Si ya tiene uno activo, forzar a saltarlo o finalizarlo primero
    if (currentTurno) {
      alert("Debes finalizar el turno actual primero.");
      setLoading(false);
      return;
    }

    // Buscar turnos en espera sin el doble filtro de BD
    const qNext = query(collection(db, 'turnos'), where('estado', '==', 'espera'));
    const nextSnap = await getDocs(qNext);
    
    // Filtrar en cliente
    const docsList = nextSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const esperaDocs = docsList.filter(d => d.departamento_solicitado === funcionario.departamento);

    if (esperaDocs.length === 0) {
      alert("No hay pacientes en espera para " + funcionario.departamento);
      setLoading(false);
      return;
    }

    // Ordenar localmente por created_at (del más antiguo al más reciente)
    esperaDocs.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeA - timeB;
    });

    const nextTurnoDoc = esperaDocs[0];

    try {
      // Actualizar estado a 'llamado'
      await updateDoc(doc(db, 'turnos', nextTurnoDoc.id), { 
          estado: 'llamado', 
          especialista_id: funcionario.id || '',
          nombre_funcionario: funcionario.nombre || 'Funcionario',
          departamento: funcionario.departamento || '',
          cargo_funcionario: funcionario.cargo || '',
          letra_especialista: funcionario.letra_atencion || 'A',
          called_at: new Date().toISOString()
      });
      
      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'atendiendo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'atendiendo' });
      
      // Notificar a n8n
      triggerWebhook('llamado', {
          numero: nextTurnoDoc.numero,
          rut_usuario: nextTurnoDoc.rut_usuario,
          especialista_id: funcionario.id || '',
          nombre_funcionario: funcionario.nombre || 'Funcionario',
          departamento: funcionario.departamento || '',
          letra_especialista: funcionario.letra_atencion || 'A'
      });
        
      await refreshQueue(funcionario.id);
    } catch (e) {
      console.error("Error al llamar siguiente:", e);
      alert("Hubo un error al llamar al paciente. Revise consola.");
    }
    setLoading(false);
  };

  const finalizarTurno = async () => {
    if (!currentTurno || !funcionario) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'turnos', currentTurno.id), { 
          estado: 'atendido', 
          finished_at: new Date().toISOString()
      });
        
      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'activo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'activo' });
        
      await refreshQueue(funcionario.id);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const saltarTurno = async () => {
    if (!currentTurno || !funcionario) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'turnos', currentTurno.id), { estado: 'saltado' });
        
      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'activo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'activo' });
        
      await refreshQueue(funcionario.id);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
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

  const handleExportMyHistory = async () => {
    if (!funcionario) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'turnos'), 
        where('especialista_id', '==', funcionario.id),
        where('estado', '==', 'atendido'),
        orderBy('finished_at', 'desc')
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => {
        const t = d.data();
        return {
          ID_Turno: d.id,
          Turno_Visual: `${t.letra_ticket ? t.letra_ticket + '-' : ''}${t.numero}`,
          RUT_Usuario: t.rut_usuario || '',
          Fecha_Atencion: t.finished_at ? new Date(t.finished_at).toLocaleString() : '',
          Llamado_En: t.called_at ? new Date(t.called_at).toLocaleString() : ''
        };
      });
      exportToCSV(`atenciones_${funcionario.nombre.replace(/\s+/g, '_')}.csv`, data);
    } catch (e) {
      console.error(e);
      alert("Error al exportar");
    }
    setLoading(false);
  };

  // --- RENDERS ---

  if (loading && !session && !authError) {
    return <div className={styles.centerLoad}>Cargando entorno...</div>;
  }

  if (!session) {
    return (
      <main className={styles.authContainer}>
        <form onSubmit={handleLogin} className={styles.authCard}>
          <h2>Acceso Funcionarios</h2>
          <p>Inicie sesión con su correo para atender usuarios.</p>
          
          {authError && <div className={styles.errorBanner}>{authError}</div>}
          
          <div className={styles.inputGroup}>
            <label>Correo Electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className={styles.inputGroup}>
            <label>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className={styles.inputGroup}>
            <label>Nombre y Apellido (Solo cuenta nueva)</label>
            <input type="text" placeholder="Ej: Juan Pérez" value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div className={styles.inputGroup}>
            <label>Departamento (Solo cuenta nueva)</label>
            <select value={departamento} onChange={e => setDepartamento(e.target.value)} className={styles.select}>
              {departamentosDisponibles.map(dep => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>
          </div>
          <div className={styles.inputGroup}>
            <label>Cargo o Función (Solo cuenta nueva)</label>
            <input type="text" placeholder="Ej: Psicólogo, Asistente..." value={cargo} onChange={e => setCargo(e.target.value)} />
          </div>
          <div className={styles.inputGroup}>
            <label>Módulo / Letra (Solo cuenta nueva)</label>
            <input type="text" placeholder="Ej: A, B, Box 1" value={letraAtencion} onChange={e => setLetraAtencion(e.target.value)} />
          </div>
          
          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </main>
    );
  }

  const queueCount = queueDocs.filter(d => d.departamento_solicitado === funcionario?.departamento).length;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.topBar}>
        <div className={styles.userInfo}>
          {isEditingAvatar ? (
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <input 
                className={styles.editInput}
                value={newAvatarUrl} 
                onChange={e => setNewAvatarUrl(e.target.value)} 
                placeholder="URL de tu foto..."
                autoFocus
              />
              <button className={styles.saveBtn} onClick={handleUpdateAvatar}>Guardar</button>
              <button className={styles.cancelBtn} onClick={() => setIsEditingAvatar(false)}>X</button>
            </div>
          ) : (
            <div className={styles.profileCell}>
              <div 
                className={styles.avatarWrapper} 
                onClick={() => { setNewAvatarUrl(funcionario?.avatar_url || ''); setIsEditingAvatar(true); }}
                title="Cambiar Foto"
              >
                {funcionario?.avatar_url ? (
                  <img src={funcionario.avatar_url} alt="Avatar" className={styles.avatarImg} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {funcionario?.nombre?.substring(0, 2).toUpperCase() || 'FN'}
                  </div>
                )}
              </div>
              <span 
                className={styles.statusDot} 
                data-status={funcionario?.estado_funcionario || 'inactivo'}
                title={`Estado: ${funcionario?.estado_funcionario || 'inactivo'}`}
              />
            </div>
          )}
          
          <div>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              {isEditingLetra ? (
                <>
                  <input 
                    className={styles.editInput}
                    value={newLetra} 
                    onChange={e => setNewLetra(e.target.value)} 
                    placeholder="Nuevo módulo"
                    autoFocus
                  />
                  <button className={styles.saveBtn} onClick={handleUpdateLetra}>Guardar</button>
                  <button className={styles.cancelBtn} onClick={() => setIsEditingLetra(false)}>X</button>
                </>
              ) : (
                <>
                  <strong>{funcionario?.nombre} - Módulo {funcionario?.letra_atencion}</strong>
                  <button 
                    className={styles.editBtn} 
                    onClick={() => { setNewLetra(funcionario?.letra_atencion || ''); setIsEditingLetra(true); }}
                  >
                    Editar
                  </button>
                </>
              )}
            </div>
            <span>{funcionario?.cargo ? `${funcionario.cargo} en ` : ''}{funcionario?.departamento} | {session?.email}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button onClick={handleExportMyHistory} className={styles.exportBtn} title="Descargar mi historial">
            <Download size={18} /> Exportar
          </button>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </header>

      <div className={styles.mainLayout}>
        <div className={styles.panelLeft}>
          <div className={styles.statCard}>
            <h3>Pacientes en Espera</h3>
            <div className={styles.bigNumber}>{queueCount}</div>
            <button 
              className={`${styles.actionBtn} ${styles.btnCall}`} 
              onClick={llamarSiguiente}
              disabled={loading || currentTurno !== null || queueCount === 0}
            >
              <Megaphone size={24} /> Llamar Siguiente
            </button>
          </div>
        </div>

        <div className={styles.panelRight}>
          {currentTurno ? (
            <div className={styles.activeTurnoCard}>
              <h2>Atendiendo Actualmente</h2>
              <div className={styles.turnoDisplay}>
                Turno {currentTurno.letra_ticket ? `${currentTurno.letra_ticket}-` : ''}{currentTurno.numero}
              </div>
              <div className={styles.patientInfo}>
                <p><strong>RUT:</strong> {currentTurno.rut_usuario}</p>
              </div>

              {userHistory.length > 0 && (
                <div className={styles.historyBox}>
                  <h3>Historial Reciente del Paciente</h3>
                  <ul>
                    {userHistory.map(h => (
                      <li key={h.id}>
                        <strong>{new Date(h.finished_at).toLocaleDateString()}</strong> - 
                        Atendido por: {h.nombre_funcionario || 'Funcionario'} ({h.departamento || 'Sin Depto'}) 
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.actionGrid}>
                <button 
                  className={`${styles.actionBtn} ${styles.btnFinish}`}
                  onClick={finalizarTurno}
                  disabled={loading}
                >
                  <CheckCircle size={20} /> Finalizar Atención
                </button>
                <button 
                  className={`${styles.actionBtn} ${styles.btnSkip}`}
                  onClick={saltarTurno}
                  disabled={loading}
                >
                  <SkipForward size={20} /> Saltar (No se presenta)
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.emptyStateCard}>
              <div className={styles.emptyCircle}>
                <User size={48} color="var(--border-color)" />
              </div>
              <h3>Disponible</h3>
              <p>Haga clic en "Llamar Siguiente" para comenzar a atender.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
