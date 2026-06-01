'use client';

import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, runTransaction, setDoc, getDoc, addDoc } from 'firebase/firestore';
import { triggerWebhook } from '@/lib/notify';
import styles from './central.module.css';
import { LogOut, UserPlus, Info, CheckCircle, Search } from 'lucide-react';

export default function CentralPage() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const [rut, setRut] = useState('');
  const [nombre, setNombre] = useState('');
  const [actionMessage, setActionMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSession(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
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
    await signOut(auth);
  };

  const showMessage = (text: string, type: 'success' | 'error') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage({ text: '', type: '' }), 4000);
  };

  const formatRutUI = (raw: string) => {
    const clean = raw.replace(/[^0-9kK]/g, '');
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${body}-${dv}`;
  };

  const upsertUser = async (rutUser: string, nombreUser: string) => {
    const userRef = doc(db, 'usuarios', rutUser);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, { rut: rutUser, nombre: nombreUser, created_at: new Date().toISOString() });
    } else if (nombreUser) {
      await setDoc(userRef, { nombre: nombreUser }, { merge: true });
    }
  };

  const handleGenerarTurno = async () => {
    if (!rut) {
      showMessage('Debe ingresar un RUT', 'error');
      return;
    }
    setLoading(true);
    try {
      const formattedRut = formatRutUI(rut);
      await upsertUser(formattedRut, nombre);

      const configRef = doc(db, 'configuracion', 'global');
      const turnoRef = doc(collection(db, 'turnos'));
      
      let newNumero = 1;
      await runTransaction(db, async (transaction) => {
        const configDoc = await transaction.get(configRef);
        
        const now = new Date();
        const resetTime = new Date();
        resetTime.setHours(7, 30, 0, 0);
        
        let currentNumero = 0;
        let lastReset = null;

        if (!configDoc.exists()) {
          transaction.set(configRef, { currentTurno: 0, mensaje_dia: 'Bienvenidos' });
        } else {
          currentNumero = configDoc.data().currentTurno || 0;
          lastReset = configDoc.data().ultimo_reinicio || null;
        }
        
        if (now >= resetTime) {
          if (!lastReset || new Date(lastReset) < resetTime) {
            currentNumero = 0;
            lastReset = now.toISOString();
          }
        } else {
          const yesterdayReset = new Date(resetTime);
          yesterdayReset.setDate(yesterdayReset.getDate() - 1);
          if (!lastReset || new Date(lastReset) < yesterdayReset) {
            currentNumero = 0;
            lastReset = now.toISOString();
          }
        }
        
        newNumero = currentNumero + 1;
        transaction.update(configRef, { currentTurno: newNumero, ultimo_reinicio: lastReset });
        
        transaction.set(turnoRef, {
          numero: newNumero,
          rut_usuario: formattedRut,
          estado: 'espera',
          created_at: new Date().toISOString()
        });
      });

      // Notificar a n8n
      triggerWebhook('ingreso', { numero: newNumero, rut_usuario: formattedRut, nombre });

      showMessage(`¡Turno ${newNumero} generado exitosamente para ${formattedRut}!`, 'success');
      setRut('');
      setNombre('');
    } catch (e) {
      console.error(e);
      showMessage('Error al generar turno', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOrientacion = async () => {
    if (!rut) {
      showMessage('Debe ingresar un RUT para registro de orientación', 'error');
      return;
    }
    setLoading(true);
    try {
      const formattedRut = formatRutUI(rut);
      await upsertUser(formattedRut, nombre);

      // Registrar como atendido instantáneamente
      const now = new Date().toISOString();
      await addDoc(collection(db, 'turnos'), {
          rut_usuario: formattedRut,
          estado: 'atendido',
          numero: 0, // Orientación no ocupa número real
          called_at: now,
          finished_at: now,
          created_at: now
      });

      showMessage(`Registro de Orientación guardado para ${formattedRut}.`, 'success');
      setRut('');
      setNombre('');
    } catch (e) {
      console.error(e);
      showMessage('Error al guardar registro', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !session && !authError) {
    return <div className={styles.centerLoad}>Cargando entorno...</div>;
  }

  if (!session) {
    return (
      <main className={styles.authContainer}>
        <form onSubmit={handleLogin} className={styles.authCard}>
          <h2>Acceso Central / Recepción</h2>
          <p>Ingrese con credenciales de Central para gestionar turnos manualmente.</p>
          
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

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.topBar}>
        <div className={styles.userInfo}>
          <Search className={styles.icon} />
          <div>
            <strong>Módulo Central</strong>
            <span>Recepción y Orientación</span>
          </div>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} /> Salir
        </button>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.actionCard}>
          <h2>Gestión Manual de Usuarios</h2>
          <p className={styles.subtitle}>Ingrese los datos del usuario si el Tótem no está disponible o requiere orientación directa.</p>
          
          {actionMessage.text && (
            <div className={actionMessage.type === 'success' ? styles.successAlert : styles.errorAlert}>
              {actionMessage.text}
            </div>
          )}

          <div className={styles.formGrid}>
            <div className={styles.inputGroup}>
              <label>RUT del Paciente / Usuario</label>
              <input 
                type="text" 
                placeholder="Ej: 12345678-9" 
                value={rut} 
                onChange={e => setRut(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.inputGroup}>
              <label>Nombre Completo (Opcional)</label>
              <input 
                type="text" 
                placeholder="Nombre para registro" 
                value={nombre} 
                onChange={e => setNombre(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.buttonGrid}>
            <button 
              className={`${styles.actionBtn} ${styles.btnPrimary}`} 
              onClick={handleGenerarTurno}
              disabled={loading}
            >
              <UserPlus size={24} />
              <div>
                <strong>Generar Turno Normal</strong>
                <span>Enviar a sala de espera pública</span>
              </div>
            </button>
            
            <button 
              className={`${styles.actionBtn} ${styles.btnSecondary}`} 
              onClick={handleOrientacion}
              disabled={loading}
            >
              <Info size={24} />
              <div>
                <strong>Registrar Orientación</strong>
                <span>Resolver duda sin enviar a la fila</span>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
