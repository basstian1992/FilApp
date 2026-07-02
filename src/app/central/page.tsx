'use client';

import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, runTransaction, setDoc, getDoc, addDoc, query, where, getDocs } from 'firebase/firestore';
import { triggerWebhook } from '@/lib/notify';
import styles from './central.module.css';
import { LogOut, UserPlus, Info, CheckCircle, Search } from 'lucide-react';
import { SkeletonScreen } from '@/components/Skeleton';

export default function CentralPage() {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const [rut, setRut] = useState('');
  const [nombre, setNombre] = useState('');
  const [actionMessage, setActionMessage] = useState({ text: '', type: '' });

  const validateRUT = (rut: string) => {
    if (!/^[0-9]+[-|‐]{1}[0-9kK]{1}$/.test(rut)) return false;
    const tmp = rut.split('-');
    let digv = tmp[1].toLowerCase();
    const rutNum = tmp[0];
    if (digv === 'k') digv = 'k';
    let M = 0, S = 1;
    let num = parseInt(rutNum, 10);
    for (; num; num = Math.floor(num / 10)) {
      S = (S + num % 10 * (9 - M++ % 6)) % 11;
    }
    const expectedDv = S ? (S - 1).toString() : 'k';
    return expectedDv === digv;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setSession(user);
      if (user) {
        const q = query(collection(db, 'especialistas'), where('user_id', '==', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data() as any;
          setUserProfile(data);
          setInstitutionId(data.institution_id || null);
        }
      }
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

  const showMessage = (text: string, type: 'success' | 'error' | 'warning') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage({ text: '', type: '' }), 5000);
  };

  const cleanRutInput = (raw: string) => raw.replace(/[^0-9kK]/gi, '').slice(0, 10);

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
      await setDoc(userRef, { rut: rutUser, nombre: nombreUser, institution_id: institutionId, created_at: new Date().toISOString() });
    } else if (nombreUser) {
      await setDoc(userRef, { nombre: nombreUser }, { merge: true });
    }
  };

  const handleGenerarTurno = async () => {
    if (!rut || !institutionId) {
      showMessage('Debe ingresar un RUT', 'error');
      return;
    }
    const formattedRut = formatRutUI(rut);
    if (!validateRUT(formattedRut)) {
      showMessage('⚠️ El RUT ingresado no corresponde a un formato chileno válido. Puede continuar si es un documento extranjero.', 'warning');
    }
    setLoading(true);
    try {
      await upsertUser(formattedRut, nombre);

      const instRef = doc(db, 'institutions', institutionId);
      const turnoRef = doc(collection(db, 'turnos'));

      let newNumero = 1;
      await runTransaction(db, async (transaction) => {
        const instDoc = await transaction.get(instRef);

        const now = new Date();
        const resetTime = new Date();
        resetTime.setHours(7, 30, 0, 0);

        let currentNumero = 0;
        let lastReset = null;

        if (!instDoc.exists()) {
          transaction.set(instRef, { currentTurno: 0, ultimo_reinicio: null }, { merge: true });
        } else {
          currentNumero = instDoc.data()?.currentTurno || 0;
          lastReset = instDoc.data()?.ultimo_reinicio || null;
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
        transaction.update(instRef, { currentTurno: newNumero, ultimo_reinicio: lastReset });

        transaction.set(turnoRef, {
          institution_id: institutionId,
          numero: newNumero,
          rut_usuario: formattedRut,
          estado: 'espera',
          created_at: new Date().toISOString(),
        });
      });

      triggerWebhook('ingreso', { numero: newNumero, rut_usuario: formattedRut, nombre, institution_id: institutionId });

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
    if (!rut || !institutionId) {
      showMessage('Debe ingresar un RUT para registro de orientación', 'error');
      return;
    }
    const formattedRut = formatRutUI(rut);
    if (!validateRUT(formattedRut)) {
      showMessage('⚠️ El RUT ingresado no corresponde a un formato chileno válido. Puede continuar si es un documento extranjero.', 'warning');
    }
    setLoading(true);
    try {
      await upsertUser(formattedRut, nombre);

      const now = new Date().toISOString();
      await addDoc(collection(db, 'turnos'), {
          institution_id: institutionId,
          rut_usuario: formattedRut,
          estado: 'atendido',
          numero: 0,
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
    return <SkeletonScreen />;
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
            <div className={
              actionMessage.type === 'success' ? styles.successAlert :
              actionMessage.type === 'warning' ? styles.warningAlert :
              styles.errorAlert
            }>
              {actionMessage.text}
            </div>
          )}

          <div className={styles.formGrid}>
            <div className={styles.inputGroup}>
                <label>RUT del Paciente / Usuario</label>
                <input
                  type="text"
                  placeholder="Ej: 12345678-9"
                  value={rut ? formatRutUI(rut) : ''}
                  onChange={e => setRut(cleanRutInput(e.target.value))}
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
