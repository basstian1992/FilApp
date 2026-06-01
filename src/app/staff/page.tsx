'use client';

import { useEffect, useState, useRef } from 'react';
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
  telegram_chat_id?: string;
  telegram_bot_token?: string;
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

  // Telegram states
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testError, setTestError] = useState('');

  // Refs for tracking changes and bypassing closures in firestore listener
  const funcionarioRef = useRef<Funcionario | null>(null);
  const isFirstEspera = useRef(true);

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
          setTelegramChatId(specData.telegram_chat_id || '');
          setTelegramBotToken(specData.telegram_bot_token || '');
          
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
      const currentFunc = funcionarioRef.current;

      if (isFirstEspera.current) {
        isFirstEspera.current = false;
      } else {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newTurno = change.doc.data();

            if (currentFunc && currentFunc.departamento === newTurno.departamento_solicitado) {
              const allDocs = snap.docs.map(d => d.data());
              const currentQueueCount = allDocs.filter(d => d.departamento_solicitado === currentFunc.departamento).length;

              if (currentFunc.telegram_chat_id && currentFunc.telegram_bot_token) {
                const ticketStr = `${newTurno.letra_ticket || 'T'}-${newTurno.numero}`;
                const deptoStr = newTurno.departamento_solicitado || currentFunc.departamento;

                const msg = `🔔 *FilApp - Nuevo Turno*\n\nSe ha solicitado un nuevo turno en tu módulo de *${deptoStr}*.\n\n🎫 *Turno:* ${ticketStr}\n👥 *Personas en cola:* ${currentQueueCount}\n\nIngresa al panel para atender.`;

                fetch('/api/telegram', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chatId: currentFunc.telegram_chat_id,
                    botToken: currentFunc.telegram_bot_token,
                    message: msg
                  })
                }).catch(err => console.error('Error al enviar Telegram:', err));
              }
            }
          }
        });
      }

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

  const handleLinkTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funcionario || !telegramChatId.trim() || !telegramBotToken.trim()) return;

    setIsSavingWhatsapp(true);
    setTestSent(false);
    setTestError('');

    const cleanChatId = telegramChatId.trim();
    const cleanToken = telegramBotToken.trim();
    
    const testMsg = `📲 *¡FilApp Conectado!*\n\nHola *${funcionario.nombre}*, tu Telegram se ha vinculado correctamente a FilApp.\n\nRecibirás una notificación en este chat cada vez que ingresen turnos en espera para *${funcionario.departamento}*.\n\n_Este servicio estará activo mientras mantengas tu panel abierto._`;

    try {
      // 1. Send test message via API to verify it works
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: cleanChatId,
          botToken: cleanToken,
          message: testMsg
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al conectar con la API de Telegram. Verifica el Token y tu Chat ID.');
      }

      // 2. Save credentials to Firestore
      await updateDoc(doc(db, 'especialistas', funcionario.id), {
        telegram_chat_id: cleanChatId,
        telegram_bot_token: cleanToken
      });

      // 3. Update local state
      setFuncionario({
        ...funcionario,
        telegram_chat_id: cleanChatId,
        telegram_bot_token: cleanToken
      });

      setTestSent(true);
    } catch (err: any) {
      console.error('Error al vincular Telegram:', err);
      setTestError(err.message || 'No se pudo conectar. Por favor verifica tus credenciales.');
    } finally {
      setIsSavingWhatsapp(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!funcionario) return;

    setIsSavingWhatsapp(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), {
        telegram_chat_id: '',
        telegram_bot_token: ''
      });

      setFuncionario({
        ...funcionario,
        telegram_chat_id: '',
        telegram_bot_token: ''
      });

      setTelegramChatId('');
      setTelegramBotToken('');
      setTestSent(false);
      setTestError('');
    } catch (err) {
      console.error('Error al desvincular Telegram:', err);
      alert('Error al desvincular.');
    } finally {
      setIsSavingWhatsapp(false);
    }
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

          {/* Tarjeta de Configuración de Telegram */}
          <div className={styles.whatsappCard}>
            <h3>📲 Alertas de Telegram</h3>
            
            {funcionario?.telegram_chat_id && funcionario?.telegram_bot_token ? (
              <div className={styles.waConnectedState}>
                <div className={styles.waBadge}>
                  <span className={styles.waActiveDot} /> Conectado a Telegram
                </div>
                <p className={styles.waMeta}>
                  <strong>Chat ID:</strong> {funcionario.telegram_chat_id}
                </p>
                <p className={styles.waInstructionText}>
                  Recibirás alertas en tiempo real en Telegram cuando lleguen turnos de <strong>{funcionario.departamento}</strong>.
                </p>
                <button 
                  onClick={handleUnlinkTelegram} 
                  className={styles.waDisconnectBtn}
                  disabled={isSavingWhatsapp}
                >
                  Desconectar Telegram
                </button>
              </div>
            ) : (
              <form onSubmit={handleLinkTelegram} className={styles.waForm}>
                <p className={styles.waDescription}>
                  Recibe notificaciones automáticas e instantáneas en tu celular cuando haya turnos en espera para tu módulo.
                </p>
                
                <div className={styles.waSteps}>
                  <h4>Configuración en 15 segundos:</h4>
                  <ol>
                    <li>
                      Crea un bot institucional hablando con <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"><strong>@BotFather</strong></a> en Telegram, envía `/newbot` y obtén tu <strong>Bot Token</strong>.
                    </li>
                    <li>
                      Busca tu nuevo bot en Telegram y haz clic en <strong>Iniciar (/start)</strong>.
                    </li>
                    <li>
                      Obtén tu ID personal buscando a <a href="https://t.me/GetMyChatID_Bot" target="_blank" rel="noreferrer"><strong>@GetMyChatID_Bot</strong></a> en Telegram e inicia el bot para ver tu <strong>Chat ID</strong>.
                    </li>
                  </ol>
                </div>

                {testError && <div className={styles.waError}>{testError}</div>}
                {testSent && <div className={styles.waSuccess}>¡Telegram vinculado! Revisa el chat de tu bot para ver el mensaje de confirmación.</div>}

                <div className={styles.waInputGroup}>
                  <label>Token del Bot Institucional</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 123456789:ABCdefGh..." 
                    value={telegramBotToken}
                    onChange={e => setTelegramBotToken(e.target.value)}
                    required 
                    disabled={isSavingWhatsapp}
                  />
                </div>

                <div className={styles.waInputGroup}>
                  <label>Tu Chat ID Personal</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 987654321" 
                    value={telegramChatId}
                    onChange={e => setTelegramChatId(e.target.value)}
                    required 
                    disabled={isSavingWhatsapp}
                  />
                </div>

                <button 
                  type="submit" 
                  className={styles.waConnectBtn}
                  disabled={isSavingWhatsapp || !telegramChatId.trim() || !telegramBotToken.trim()}
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
