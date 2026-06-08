'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import styles from './page.module.css';
import { Building2, LogOut, Users, MonitorUp, Settings, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setSession(user);
      if (user) {
        const q = query(collection(db, 'especialistas'), where('user_id', '==', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data() as any;
          setUserProfile(data);
          if (data.institution_id) {
            const instSnap = await getDoc(doc(db, 'institutions', data.institution_id));
            if (instSnap.exists()) setInstitutionName(instSnap.data().name || '');
          }
          if (data.role === 'admin' || data.role === 'gerente') router.push('/admin');
          else if (data.role === 'funcionario') router.push('/funcionarios');
        }
      } else {
        setUserProfile(null);
        setInstitutionName('');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setShowLogin(false);
    } catch (err: any) {
      setLoginError(err.message || 'Credenciales inválidas.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserProfile(null);
    setInstitutionName('');
  };

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.loadingScreen}>
          <div className={styles.loadingDot} />
        </div>
      </main>
    );
  }

  if (session && userProfile) {
    return (
      <main className={styles.container}>
        <div className={styles.userBar}>
          <div className={styles.userBarLeft}>
            <Building2 size={18} />
            <span className={styles.instName}>{institutionName}</span>
            <span className={styles.roleBadge} data-role={userProfile.role}>
              {userProfile.role === 'admin' ? 'Administrador' : 'Funcionario'}
            </span>
          </div>
          <div className={styles.userBarRight}>
            <span className={styles.userEmail}>{session.email}</span>
            <button onClick={handleLogout} className={styles.logoutBtn}>
              <LogOut size={15} /> Salir
            </button>
          </div>
        </div>

        <div className={styles.heroSmall}>
          <div className={styles.badge}>FilApp OS</div>
          <h1 className={styles.titleSmall}>Buen día, {userProfile.nombre || 'usuario'}</h1>
          <p className={styles.subtitle}>Seleccione un portal para continuar.</p>
        </div>

        <div className={styles.portalGrid}>
          {userProfile.role === 'admin' && (
            <Link href="/admin" className={styles.portalCard}>
              <div className={styles.portalIcon}><Settings size={28} /></div>
              <span className={styles.portalLabel}>Administración</span>
              <span className={styles.portalDesc}>Configuración, métricas y usuarios</span>
            </Link>
          )}
          {userProfile.role === 'funcionario' && (
            <Link href="/funcionarios" className={styles.portalCard}>
              <div className={styles.portalIcon}><Users size={28} /></div>
              <span className={styles.portalLabel}>Atención</span>
              <span className={styles.portalDesc}>Panel de atención de usuarios</span>
            </Link>
          )}
          <Link href="/tv" className={styles.portalCard}>
            <div className={styles.portalIcon}><MonitorUp size={28} /></div>
            <span className={styles.portalLabel}>Pantalla TV</span>
            <span className={styles.portalDesc}>Visualización para sala de espera</span>
          </Link>
          <Link href={`/totem?institution=${userProfile.institution_id || ''}`} className={styles.portalCard}>
            <div className={styles.portalIcon}><Users size={28} /></div>
            <span className={styles.portalLabel}>Tótem</span>
            <span className={styles.portalDesc}>Autoatención de pacientes</span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.landingSplit}>
        <div className={styles.landingHero}>
          <div className={styles.badge}>FilApp OS</div>
          <h1 className={styles.landingTitle}>Sistema Multi-Institución<br />de Gestión de Filas</h1>
          <p className={styles.landingDesc}>
            Administre la atención de ciudadanos en sus oficinas con una plataforma moderna, en tiempo real y multi-inquilino.
          </p>
          <div className={styles.featureList}>
            <div className={styles.featureItem}>Múltiples instituciones</div>
            <div className={styles.featureItem}>Roles y permisos</div>
            <div className={styles.featureItem}>Tótem autoatendido</div>
            <div className={styles.featureItem}>Pantalla de sala de espera</div>
          </div>
        </div>

        <div className={styles.landingActions}>
          <div className={styles.actionCard}>
            <h2>Crear Institución</h2>
            <p>Registre su institución y configure sus categorías de atención, funcionarios y módulos.</p>
            <Link href="/register" className={styles.primaryBtn}>
              Registrar Institución <ArrowRight size={18} />
            </Link>
          </div>

          <div className={styles.dividerRow}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>o</span>
            <span className={styles.dividerLine} />
          </div>

          <div className={styles.actionCard}>
            <h2>Iniciar Sesión</h2>
            <p>Acceda como administrador o funcionario a su institución.</p>
            <form onSubmit={handleLogin} className={styles.loginForm}>
              {loginError && <div className={styles.loginError}>{loginError}</div>}
              <input type="email" placeholder="Correo electrónico" value={email} onChange={e => setEmail(e.target.value)} required />
              <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required />
              <button type="submit" className={styles.primaryBtn} disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Ingresando...' : 'Ingresar al panel'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
