'use client';

import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { triggerWebhook } from '@/lib/notify';
import styles from './staff.module.css';
import { LogOut, User, CheckCircle, SkipForward, Megaphone } from 'lucide-react';

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
  const [newLetra, setNewLetra] = useState('');
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [departamentosDisponibles, setDepartamentosDisponibles] = useState<string[]>(['DIDECO', 'OMIL', 'PRODESAL', 'PMJH', 'FOMENTO', 'OTEC', 'TURISMO', 'OTRO']);

  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [currentTurno, setCurrentTurno] = useState<Turno | null>(null);
  const [queueCount, setQueueCount] = useState(0);
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
      const q = query(collection(db, 'especialistas'), where('user_id', '==', userId));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const specDoc = querySnapshot.docs[0];
        const specData = { id: specDoc.id, ...specDoc.data() } as Funcionario;
        setFuncionario(specData);
        // Actualizar estado a activo al iniciar sesión
        await updateDoc(doc(db, 'especialistas', specData.id), { estado_funcionario: 'activo' });
        await refreshQueue(specData.id);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const refreshQueue = async (specId: string) => {
    const qEspera = query(collection(db, 'turnos'), where('estado', '==', 'espera'));
    onSnapshot(qEspera, (snap) => setQueueCount(snap.size));

    const qActivo = query(collection(db, 'turnos'), 
      where('especialista_id', '==', specId),
      where('estado', '==', 'llamado')
    );
    onSnapshot(qActivo, async (snap) => {
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const currentData = { id: docSnap.id, ...docSnap.data() } as Turno;
        setCurrentTurno(currentData);
        
        // Cargar historial
        if (currentData.rut_usuario) {
          const histQ = query(
            collection(db, 'turnos'),
            where('rut_usuario', '==', currentData.rut_usuario),
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

    // Buscar turnos en espera sin ordenar en Firebase para evitar error de índice
    const qNext = query(collection(db, 'turnos'), where('estado', '==', 'espera'));
    const nextSnap = await getDocs(qNext);

    if (nextSnap.empty) {
      alert("No hay pacientes en espera.");
      setLoading(false);
      return;
    }

    // Ordenar localmente por created_at (del más antiguo al más reciente)
    const esperaDocs = nextSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    esperaDocs.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeA - timeB;
    });

    const nextTurnoDoc = esperaDocs[0];

    // Actualizar estado a 'llamado'
    await updateDoc(doc(db, 'turnos', nextTurnoDoc.id), { 
        estado: 'llamado', 
        especialista_id: funcionario.id,
        nombre_funcionario: funcionario.nombre || 'Funcionario',
        departamento: funcionario.departamento || '',
        cargo_funcionario: funcionario.cargo || '',
        letra_especialista: funcionario.letra_atencion,
        called_at: new Date().toISOString()
    });
    
    await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'atendiendo' });
    
    // Notificar a n8n
    triggerWebhook('llamado', {
        numero: nextTurnoDoc.numero,
        rut_usuario: nextTurnoDoc.rut_usuario,
        especialista_id: funcionario.id,
        nombre_funcionario: funcionario.nombre || 'Funcionario',
        departamento: funcionario.departamento || '',
        letra_especialista: funcionario.letra_atencion
    });
      
    await refreshQueue(funcionario.id);
    setLoading(false);
  };

  const finalizarTurno = async () => {
    if (!currentTurno || !funcionario) return;
    setLoading(true);
    await updateDoc(doc(db, 'turnos', currentTurno.id), { 
        estado: 'atendido', 
        finished_at: new Date().toISOString()
    });
      
    await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'activo' });
      
    await refreshQueue(funcionario.id);
    setLoading(false);
  };

  const saltarTurno = async () => {
    if (!currentTurno || !funcionario) return;
    setLoading(true);
    await updateDoc(doc(db, 'turnos', currentTurno.id), { estado: 'saltado' });
      
    await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'activo' });
      
    await refreshQueue(funcionario.id);
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
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} /> Salir
        </button>
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
                Turno {currentTurno.numero}
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
