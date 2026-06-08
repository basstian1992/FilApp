'use client';

import { useEffect, useState, useRef } from 'react';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, orderBy, limit, onSnapshot, getDoc } from 'firebase/firestore';
import { triggerWebhook } from '@/lib/notify';
import styles from './funcionarios.module.css';
import { LogOut, User, CheckCircle, SkipForward, Megaphone, Download, Bell, BellRing, Users } from 'lucide-react';
import UserForm from '@/components/UserForm';
import UserDirectory from '@/components/UserDirectory';

interface Funcionario {
  id: string;
  user_id: string;
  institution_id: string;
  role: string;
  nombre: string;
  departamento: string;
  cargo?: string;
  estado_funcionario?: string;
  avatar_url?: string;
  letra_atencion: string;
  whatsapp_phone?: string;
  whatsapp_apikey?: string;
}

interface Turno {
  id: string;
  numero: number;
  letra_ticket?: string;
  rut_usuario: string;
  estado: string;
  departamento_solicitado?: string;
  priority_level?: number;
  is_appointment?: boolean;
}

interface Notification {
  id: string;
  message: string;
  turno: string;
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<'atencion' | 'directorio'>('atencion');
  const [isUserProfileComplete, setIsUserProfileComplete] = useState(false);
  const [resetLogs, setResetLogs] = useState<any[]>([]);

  // WhatsApp states
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testError, setTestError] = useState('');

  const funcionarioRef = useRef<Funcionario | null>(null);
  const isFirstEspera = useRef(true);
  const isFirstLoad = useRef(true);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    funcionarioRef.current = funcionario;
  }, [funcionario]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSession(user);
      if (user) fetchFuncionarioData(user.uid);
      else {
        setFuncionario(null);
        setLoading(false);
      }
    });

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

  useEffect(() => {
    if (funcionario?.institution_id) {
      const unsub = onSnapshot(doc(db, 'institutions', funcionario.institution_id), (docSnap: any) => {
        if (docSnap.exists()) {
          setResetLogs(docSnap.data().reset_logs || []);
        }
      });
      return () => unsub();
    }
  }, [funcionario?.institution_id]);

  const connectSocket = (institutionId: string, funcionarioUserId: string) => {
    const initSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        const socket = io(window.location.origin);
        socketRef.current = socket;

        socket.emit('join-institution', institutionId);
        socket.emit('join-funcionario', funcionarioUserId);

        socket.on('new-appointment', (ticket: any) => {
          setNotifications(prev => [{
            id: `${Date.now()}`,
            message: `Nuevo paciente con cita: ${ticket.letra_ticket || ''}-${ticket.numero} para ${ticket.departamento || 'su módulo'}`,
            turno: `${ticket.letra_ticket || ''}-${ticket.numero}`,
          }, ...prev].slice(0, 5));

          setTimeout(() => {
            setNotifications(prev => prev.slice(1));
          }, 8000);
        });
      } catch (e) {
        console.log('Socket.io no disponible, usando Firestore en tiempo real');
      }
    };
    initSocket();
  };

  const fetchFuncionarioData = async (userId: string) => {
    try {
      const q = query(collection(db, 'especialistas'), where('user_id', '==', userId));
      onSnapshot(q, async (querySnapshot) => {
        if (!querySnapshot.empty) {
          const specDoc = querySnapshot.docs[0];
          const specData = { id: specDoc.id, ...specDoc.data() } as Funcionario;

          const isGerente = specData.email?.toLowerCase() === 'b.alarconatenas@gmail.com' || session?.email?.toLowerCase() === 'b.alarconatenas@gmail.com';
          const isAdmin = specData.email?.toLowerCase() === 'contacto@asesoriapublica.cl' || session?.email?.toLowerCase() === 'contacto@asesoriapublica.cl';
          const isForceFuncionario = specData.email?.toLowerCase() === 'sanappchile@gmail.com' || specData.email?.toLowerCase() === 'cvappchile@gmail.com' || session?.email?.toLowerCase() === 'sanappchile@gmail.com' || session?.email?.toLowerCase() === 'cvappchile@gmail.com';
          
          let forcedRole = isGerente ? 'gerente' : (isAdmin ? 'admin' : (isForceFuncionario ? 'funcionario' : null));
          let expectedName = isGerente ? 'Gerente General' : (isAdmin ? 'Administrador Principal' : 'Funcionario');

          if (forcedRole && (specData.role !== forcedRole || specData.nombre !== expectedName)) {
            await updateDoc(doc(db, 'especialistas', specData.id), { role: forcedRole, nombre: expectedName });
            specData.role = forcedRole;
            specData.nombre = expectedName;
          }

          if (specData.role && specData.role !== 'funcionario') {
            setAuthError('Acceso denegado: Solo funcionarios pueden acceder a este panel. Los Administradores y Gerentes deben usar el panel correspondiente (/admin).');
            setLoading(false);
            return;
          }

          setFuncionario(specData);
          setWhatsappPhone(specData.whatsapp_phone || '');
          setWhatsappApiKey(specData.whatsapp_apikey || '');

          if (isFirstLoad.current) {
            isFirstLoad.current = false;
            await updateDoc(doc(db, 'especialistas', specData.id), { estado_funcionario: 'activo' });
            refreshQueue(specData.id);
            if (specData.institution_id && specData.user_id) {
              connectSocket(specData.institution_id, specData.user_id);
            }
          }
          setLoading(false);
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
      const currentFunc = funcionarioRef.current;
      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const filtered = currentFunc
        ? allDocs.filter(d => d.departamento_solicitado === currentFunc.departamento)
        : allDocs;

      filtered.sort((a, b) => {
        const priorityA = a.priority_level || 0;
        const priorityB = b.priority_level || 0;
        if (priorityB !== priorityA) return priorityB - priorityA;
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeA - timeB;
      });

      if (!isFirstEspera.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newTurno = change.doc.data();
            if (currentFunc && currentFunc.departamento === newTurno.departamento_solicitado) {
              const queueCount = filtered.length;

              if (currentFunc.whatsapp_phone && currentFunc.whatsapp_apikey) {
                const ticketStr = `${newTurno.letra_ticket || 'T'}-${newTurno.numero}`;
                const deptoStr = newTurno.departamento_solicitado || currentFunc.departamento;
                const priorityTag = newTurno.is_appointment ? '🔔 *ALTA PRIORIDAD* ' : '';
                const msg = `${priorityTag}🔔 *FilApp - Nuevo Turno*\nSe ha solicitado un nuevo turno en tu módulo de *${deptoStr}*.\n🎫 *Turno:* ${ticketStr}\n👥 *Personas en cola:* ${queueCount}\nIngresa al panel para atender.`;

                const encodedMsg = encodeURIComponent(msg);
                const encodedPhone = encodeURIComponent(currentFunc.whatsapp_phone.replace(/[^0-9+]/g, ''));
                const url = `https://api.callmebot.com/whatsapp.php?phone=${encodedPhone}&text=${encodedMsg}&apikey=${currentFunc.whatsapp_apikey.trim()}`;

                fetch(url, { mode: 'no-cors' }).catch(err => console.error('Error al enviar WhatsApp:', err));
              }
            }
          }
        });
      }
      isFirstEspera.current = false;

      setQueueDocs(filtered);
    });

    const qActivo = query(collection(db, 'turnos'), where('especialista_id', '==', specId));
    onSnapshot(qActivo, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Turno));
      const activo = docs.find(d => d.estado === 'llamado');

      if (activo) {
        setCurrentTurno(activo);

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
        setIsUserProfileComplete(false);
      }
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const q = query(collection(db, 'especialistas'), where('user_id', '==', userCred.user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as Funcionario;
        if (data.role && data.role !== 'funcionario') {
          setAuthError('Acceso denegado: Este panel es solo para funcionarios.');
          await signOut(auth);
          setLoading(false);
        }
      }
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, 'especialistas', userCred.user.uid), {
            user_id: userCred.user.uid,
            role: 'funcionario',
            nombre: nombre || 'Funcionario Nuevo',
            departamento: departamento,
            cargo: cargo || 'Funcionario',
            estado_funcionario: 'activo',
            avatar_url: '',
            letra_atencion: letraAtencion || email.split('@')[0].toUpperCase().substring(0,2),
            whatsapp_phone: '',
            whatsapp_apikey: '',
          });
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
    if (socketRef.current) {
      socketRef.current.disconnect();
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

  const handleLinkWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funcionario || !whatsappPhone.trim() || !whatsappApiKey.trim()) return;

    setIsSavingWhatsapp(true);
    setTestSent(false);
    setTestError('');

    const cleanPhone = whatsappPhone.trim();
    const cleanKey = whatsappApiKey.trim();

    const testMsg = `📲 *¡FilApp Conectado!*\nHola *${funcionario.nombre}*, tu WhatsApp se ha vinculado correctamente a FilApp.\nRecibirás una notificación en este chat cada vez que ingresen turnos en espera para *${funcionario.departamento}*.\n_Este servicio estará activo mientras mantengas tu panel abierto._`;

    try {
      const encodedMsg = encodeURIComponent(testMsg);
      const encodedPhone = encodeURIComponent(cleanPhone.replace(/[^0-9+]/g, ''));
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodedPhone}&text=${encodedMsg}&apikey=${cleanKey}`;

      await fetch(url, { mode: 'no-cors' });

      await updateDoc(doc(db, 'especialistas', funcionario.id), {
        whatsapp_phone: cleanPhone,
        whatsapp_apikey: cleanKey
      });

      setFuncionario({
        ...funcionario,
        whatsapp_phone: cleanPhone,
        whatsapp_apikey: cleanKey
      });

      setTestSent(true);
    } catch (err: any) {
      console.error('Error al vincular WhatsApp:', err);
      setTestError(err.message || 'No se pudo conectar. Por favor verifica tus credenciales.');
    } finally {
      setIsSavingWhatsapp(false);
    }
  };

  const handleUnlinkWhatsapp = async () => {
    if (!funcionario) return;

    setIsSavingWhatsapp(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), {
        whatsapp_phone: '',
        whatsapp_apikey: ''
      });

      setFuncionario({
        ...funcionario,
        whatsapp_phone: '',
        whatsapp_apikey: ''
      });

      setWhatsappPhone('');
      setWhatsappApiKey('');
      setTestSent(false);
      setTestError('');
    } catch (err) {
      console.error('Error al desvincular WhatsApp:', err);
      alert('Error al desvincular.');
    } finally {
      setIsSavingWhatsapp(false);
    }
  };

  const llamarSiguiente = async () => {
    if (!funcionario) return;
    setLoading(true);

    if (currentTurno) {
      alert("Debes finalizar el turno actual primero.");
      setLoading(false);
      return;
    }

    const qNext = query(collection(db, 'turnos'), where('estado', '==', 'espera'));
    const nextSnap = await getDocs(qNext);

    const docsList = nextSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const esperaDocs = docsList.filter(
      d => d.departamento_solicitado === funcionario.departamento
    );

    if (esperaDocs.length === 0) {
      alert("No hay pacientes en espera para " + funcionario.departamento);
      setLoading(false);
      return;
    }

    esperaDocs.sort((a, b) => {
      const priorityA = a.priority_level || 0;
      const priorityB = b.priority_level || 0;
      if (priorityB !== priorityA) return priorityB - priorityA;
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeA - timeB;
    });

    const nextTurnoDoc = esperaDocs[0];

    try {
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

      triggerWebhook('llamado', {
          numero: nextTurnoDoc.numero,
          rut_usuario: nextTurnoDoc.rut_usuario,
          especialista_id: funcionario.id || '',
          nombre_funcionario: funcionario.nombre || 'Funcionario',
          departamento: funcionario.departamento || '',
          letra_especialista: funcionario.letra_atencion || 'A'
      });

    } catch (e) {
      console.error("Error al llamar siguiente:", e);
      alert("Hubo un error al llamar al paciente. Revise consola.");
    }
    setLoading(false);
  };

  const finalizarTurno = async () => {
    if (!currentTurno || !funcionario) return;
    if (!isUserProfileComplete) {
      const confirmMsg = "Los datos obligatorios del paciente no han sido completados o no se ha hecho clic en 'Registrar Usuario'. ¿Estás seguro de que deseas finalizar la atención sin guardarlos?";
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'turnos', currentTurno.id), {
          estado: 'atendido',
          finished_at: new Date().toISOString()
      });

      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'activo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'activo' });

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

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleEstadoFuncionario = async () => {
    if (!funcionario) return;
    const nuevoEstado = funcionario.estado_funcionario === 'activo' ? 'inactivo' : 'activo';
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: nuevoEstado });
      setFuncionario({ ...funcionario, estado_funcionario: nuevoEstado });
    } catch (err) {
      console.error(err);
      alert('Error al cambiar estado.');
    }
  };

  const handleReiniciarConteo = async () => {
    if (!funcionario?.institution_id) return;
    if (!confirm('¿Estás seguro de que deseas reiniciar el conteo diario a cero? Esta acción quedará registrada.')) return;
    
    try {
      const instRef = doc(db, 'institutions', funcionario.institution_id);
      const instSnap = await getDoc(instRef);
      if (instSnap.exists()) {
        const data = instSnap.data();
        const logs = data.reset_logs || [];
        
        const newLog = {
          nombre: funcionario.nombre,
          fecha: new Date().toISOString()
        };
        
        const updatedLogs = [newLog, ...logs].slice(0, 3);
        
        await updateDoc(instRef, {
          currentTurno: 0,
          ultimo_reinicio: new Date().toISOString(),
          reset_logs: updatedLogs
        });
        
        alert("El conteo se ha reiniciado correctamente.");
      }
    } catch (e) {
      console.error(e);
      alert("Error al reiniciar conteo");
    }
  };

  const exportToCSV = (filename: string, rows: any[]) => {
    if (!rows || !rows.length) {
      alert("No hay datos para exportar");
      return;
    }
    const separator = ';';
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
          Prioridad: t.is_appointment ? 'Alta (Cita)' : 'Normal',
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

  const queueCount = queueDocs.filter(d => d.departamento_solicitado === funcionario?.departamento).length;

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
                title={`Estado: ${funcionario?.estado_funcionario || 'inactivo'} (Click para alternar)`}
                onClick={toggleEstadoFuncionario}
                style={{ cursor: 'pointer' }}
              />
            </div>
          )}

          <div>
            <strong style={{ fontSize: '1.2rem', display: 'block', marginBottom: '0.2rem', color: 'var(--text-primary)' }}>Buen día colega funcionario</strong>
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
          <button 
            onClick={() => setActiveTab('atencion')} 
            className={activeTab === 'atencion' ? styles.tabBtnActive : styles.tabBtn}
          >
            <Megaphone size={18} /> Atención
          </button>
          <button 
            onClick={() => setActiveTab('directorio')} 
            className={activeTab === 'directorio' ? styles.tabBtnActive : styles.tabBtn}
          >
            <Users size={18} /> Base de Datos
          </button>
          
          {notifications.length > 0 && (
            <div className={styles.notificationArea}>
              <BellRing size={18} className={styles.notificationBell} />
              <span className={styles.notificationCount}>{notifications.length}</span>
            </div>
          )}
          <button onClick={handleExportMyHistory} className={styles.exportBtn} title="Descargar mi historial">
            <Download size={18} /> Exportar
          </button>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </header>

      {notifications.length > 0 && (
        <div className={styles.notificationBar}>
          {notifications.map(n => (
            <div key={n.id} className={styles.notificationItem}>
              <BellRing size={16} />
              <span>{n.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.mainLayout}>
        {activeTab === 'directorio' ? (
          <div className={styles.directoryWrapper}>
            <UserDirectory institutionId={funcionario?.institution_id || ''} funcionarioId={funcionario?.id || ''} funcionarioName={funcionario?.nombre || ''} />
          </div>
        ) : (
          <>
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

          <div className={styles.statCard} style={{ background: 'rgba(220, 38, 38, 0.05)', borderColor: 'rgba(220, 38, 38, 0.2)' }}>
            <h3 style={{ color: 'var(--destructive)' }}>Reinicio de Conteo</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: '0.5rem' }}>
              Usa esto solo si hubo un error en la apertura. El contador volverá a 0.
            </p>
            <button
              className={styles.actionBtn}
              style={{ background: 'var(--destructive)', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)' }}
              onClick={handleReiniciarConteo}
            >
              Reiniciar Conteo a 0
            </button>
            {resetLogs.length > 0 && (
              <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                <strong>Últimos reinicios:</strong>
                <ul style={{ margin: 0, paddingLeft: '1rem', marginTop: '0.25rem' }}>
                  {resetLogs.map((log, i) => (
                    <li key={i}>{log.nombre} - {new Date(log.fecha).toLocaleString()}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className={styles.whatsappCard}>
            <h3>Alertas de WhatsApp</h3>

            {funcionario?.whatsapp_phone && funcionario?.whatsapp_apikey ? (
              <div className={styles.waConnectedState}>
                <div className={styles.waBadge}>
                  <span className={styles.waActiveDot} /> Conectado a WhatsApp
                </div>
                <p className={styles.waMeta}>
                  <strong>Teléfono:</strong> +{funcionario.whatsapp_phone}
                </p>
                <p className={styles.waInstructionText}>
                  Recibirás alertas en tiempo real en tu WhatsApp cuando lleguen turnos de <strong>{funcionario.departamento}</strong>.
                </p>
                <button
                  onClick={handleUnlinkWhatsapp}
                  className={styles.waDisconnectBtn}
                  disabled={isSavingWhatsapp}
                >
                  Desconectar WhatsApp
                </button>
              </div>
            ) : (
              <form onSubmit={handleLinkWhatsapp} className={styles.waForm}>
                <p className={styles.waDescription}>
                  Recibe notificaciones automáticas e instantáneas en tu celular cuando haya turnos en espera para tu módulo mediante CallMeBot.
                </p>

                <div className={styles.waSteps}>
                  <h4>Configuración en 15 segundos:</h4>
                  <ol>
                    <li>
                      Agrega el número de teléfono <strong>+34 691 62 17 28</strong> a tus contactos.
                    </li>
                    <li>
                      Envíale un mensaje de WhatsApp que diga: <strong>I allow callmebot to send me messages</strong>.
                    </li>
                    <li>
                      El bot responderá con tu <strong>API Key</strong>. Ingresa abajo tu teléfono y esa clave.
                    </li>
                  </ol>
                </div>

                {testError && <div className={styles.waError}>{testError}</div>}
                {testSent && <div className={styles.waSuccess}>¡WhatsApp vinculado! Revisa tu celular para ver el mensaje de confirmación.</div>}

                <div className={styles.waInputGroup}>
                  <label>Número de WhatsApp (con código ej: 56912345678)</label>
                  <input
                    type="text"
                    placeholder="Ej: +56912345678"
                    value={whatsappPhone}
                    onChange={e => setWhatsappPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                    required
                    disabled={isSavingWhatsapp}
                  />
                </div>

                <div className={styles.waInputGroup}>
                  <label>Tu CallMeBot API Key</label>
                  <input
                    type="text"
                    placeholder="Ej: 123456"
                    value={whatsappApiKey}
                    onChange={e => setWhatsappApiKey(e.target.value)}
                    required
                    disabled={isSavingWhatsapp}
                  />
                </div>

                <button
                  type="submit"
                  className={styles.waConnectBtn}
                  disabled={isSavingWhatsapp || !whatsappPhone.trim() || !whatsappApiKey.trim()}
                >
                  {isSavingWhatsapp ? 'Vinculando...' : 'Vincular y Probar'}
                </button>
              </form>
            )}
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
                {currentTurno.is_appointment && (
                  <p className={styles.appointmentTag}>Hora Agendada - Prioridad Alta</p>
                )}
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
              
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <UserForm 
                  rut={currentTurno.rut_usuario} 
                  institutionId={funcionario?.institution_id || ''}
                  funcionarioId={funcionario?.id || ''}
                  funcionarioName={funcionario?.nombre || ''}
                  onSaved={(isComplete) => setIsUserProfileComplete(isComplete)} 
                />
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
          </>
        )}
      </div>
    </div>
  );
}
