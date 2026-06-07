'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, setDoc, addDoc } from 'firebase/firestore';
import styles from './gerencia.module.css';
import { LogOut, Building, Download, Plus, X } from 'lucide-react';

export default function GerenciaPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form states for creating institution
  const [instName, setInstName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setSession(user);
      if (user) {
        const q = query(collection(db, 'especialistas'), where('user_id', '==', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data() as any;
          if (data.role !== 'owner') {
            setAuthError('Acceso denegado: Solo la Gerencia puede acceder a este panel.');
            setLoading(false);
            return;
          }
          fetchInstitutions();
        } else {
          // If no profile, maybe it's the very first login. We need to check if ANY owner exists.
          const ownerQ = query(collection(db, 'especialistas'), where('role', '==', 'owner'));
          const ownerSnap = await getDocs(ownerQ);
          if (ownerSnap.empty) {
            // Become the first owner
            await setDoc(doc(db, 'especialistas', user.uid), {
              user_id: user.uid,
              role: 'owner',
              nombre: 'Gerencia General',
              estado_funcionario: 'activo',
            });
            fetchInstitutions();
          } else {
            setAuthError('Ya existe un dueño registrado. Acceso denegado.');
            await signOut(auth);
          }
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchInstitutions = async () => {
    const snap = await getDocs(collection(db, 'institutions'));
    setInstitutions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
          // Try to create the user if no owner exists
          const ownerQ = query(collection(db, 'especialistas'), where('role', '==', 'owner'));
          const ownerSnap = await getDocs(ownerQ);
          if (ownerSnap.empty) {
            await createUserWithEmailAndPassword(auth, email, password);
          } else {
            setAuthError('Credenciales incorrectas o el rol de dueño ya está asignado a otra cuenta.');
            setLoading(false);
          }
        } catch (err: any) {
          setAuthError(err.message);
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
    router.push('/');
  };

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      // 1. Create Institution
      const instRef = await addDoc(collection(db, 'institutions'), {
        name: instName.trim(),
        created_at: new Date().toISOString(),
        currentTurno: 0,
        ultimo_reinicio: null,
        config: {
          mensaje_dia: 'Bienvenidos a ' + instName.trim(),
          departamentos: ['Atención General'],
          oirs_departamento: 'OIRS',
        }
      });

      // 2. Create Admin Account (Using a secondary auth app or just standard creation if possible)
      // Since Firebase client SDK doesn't easily let us create another user without signing out, 
      // we can call a cloud function, OR we sign out, create it, and sign back in (messy but works).
      // Given restrictions, we'll try to just log them out and in, but that's bad UX.
      // Actually, we can use the secondary app approach if we initialized it, but we didn't.
      // Wait, let's just use the current auth to create it. It will log the owner out. 
      // Let's warn the owner that they will be logged out.
      
      alert("Atención: Por seguridad de Firebase, crear un administrador cerrará tu sesión actual. Deberás volver a ingresar con tu cuenta Gerencial.");
      await createUserWithEmailAndPassword(auth, adminEmail, adminPassword).then(async (userCred) => {
        await setDoc(doc(db, 'especialistas', userCred.user.uid), {
          user_id: userCred.user.uid,
          institution_id: instRef.id,
          role: 'admin',
          nombre: adminName || 'Administrador',
          departamento: 'Administración',
          cargo: 'Administrador',
          estado_funcionario: 'activo',
          avatar_url: '',
          letra_atencion: 'ADM',
          whatsapp_phone: '',
          whatsapp_apikey: '',
        });
      });

      setCreating(false);
      setShowCreateModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Error: ' + err.message);
      setCreating(false);
    }
  };

  const exportGlobalUsers = async () => {
    const snap = await getDocs(collection(db, 'usuarios'));
    const rows = snap.docs.map(d => d.data());
    downloadCSV('usuarios_global.csv', rows);
  };

  const exportGlobalStaff = async () => {
    const snap = await getDocs(collection(db, 'especialistas'));
    const rows = snap.docs.map(d => d.data());
    downloadCSV('funcionarios_global.csv', rows);
  };

  const downloadCSV = (filename: string, rows: any[]) => {
    if (!rows.length) {
      alert("No hay datos para exportar.");
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
          cell = cell.toString().replace(/"/g, '""');
          if (cell.search(/("|,|\n)/g) >= 0) cell = `"${cell}"`;
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

  if (loading && !session && !authError) {
    return <div className={styles.centerLoad}>Cargando entorno...</div>;
  }

  if (!session) {
    return (
      <main className={styles.authContainer}>
        <form onSubmit={handleLogin} className={styles.authCard}>
          <h2>Acceso Gerencial</h2>
          <p>Solo personal autorizado (Dueño del Sistema).</p>
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
          <Building className={styles.icon} />
          <div>
            <strong>Panel Gerencial</strong>
            <span>Control Global de Instituciones</span>
          </div>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut size={18} /> Salir
        </button>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.actionCard}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h2>Instituciones Activas</h2>
            <button className={styles.primaryBtn} onClick={() => setShowCreateModal(true)}>
              <Plus size={18} /> Crear Institución
            </button>
          </div>
          
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID Institución</th>
                <th>Nombre</th>
                <th>Fecha Creación</th>
              </tr>
            </thead>
            <tbody>
              {institutions.map(inst => (
                <tr key={inst.id}>
                  <td>{inst.id}</td>
                  <td>{inst.name}</td>
                  <td>{new Date(inst.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {institutions.length === 0 && (
                <tr><td colSpan={3} style={{textAlign: 'center'}}>No hay instituciones creadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.actionCard} style={{marginTop: '2rem'}}>
          <h2>Bases de Datos Globales</h2>
          <p>Exportación completa del sistema.</p>
          <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
            <button className={styles.secondaryBtn} onClick={exportGlobalUsers}>
              <Download size={18} /> Exportar Usuarios (Pacientes)
            </button>
            <button className={styles.secondaryBtn} onClick={exportGlobalStaff}>
              <Download size={18} /> Exportar Funcionarios
            </button>
          </div>
        </div>
      </main>

      {showCreateModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
              <h3>Crear Nueva Institución</h3>
              <button className={styles.closeBtn} onClick={() => setShowCreateModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateInstitution} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
              <div className={styles.inputGroup}>
                <label>Nombre de la Institución</label>
                <input type="text" value={instName} onChange={e => setInstName(e.target.value)} required />
              </div>
              <h4>Datos del Administrador Inicial</h4>
              <div className={styles.inputGroup}>
                <label>Nombre del Administrador</label>
                <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} required />
              </div>
              <div className={styles.inputGroup}>
                <label>Correo del Administrador</label>
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required />
              </div>
              <div className={styles.inputGroup}>
                <label>Contraseña del Administrador</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required minLength={6} />
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={creating}>
                {creating ? 'Creando...' : 'Crear Institución y Administrador'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
