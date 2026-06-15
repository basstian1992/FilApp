'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import styles from './page.module.css';
import {
  Building2, LogOut, Users, MonitorPlay, Settings, ArrowRight,
  ShieldCheck, UserCog, Briefcase, Eye, EyeOff, ChevronRight
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setSession(user);
      if (user) {
        let q = query(collection(db, 'especialistas'), where('user_id', '==', user.uid));
        let snap = await getDocs(q);

        const isGerente = user.email?.toLowerCase() === 'b.alarconatenas@gmail.com' || user.email?.toLowerCase() === 'contacto@asesoriapublica.cl';

        // Auto-fix special emails
        const isAdmin = user.email?.toLowerCase() === 'contacto@asesoriapublica.cl'; // Fallback check
        const isForceFuncionario = user.email?.toLowerCase() === 'sanappchile@gmail.com' || user.email?.toLowerCase() === 'cvappchile@gmail.com';
        
        const forcedRole = isGerente ? 'gerente' : (isAdmin ? 'admin' : (isForceFuncionario ? 'funcionario' : null));
        const expectedName = isGerente ? 'Gerente General' : (isAdmin ? 'Administrador Principal' : 'Funcionario');

        if (forcedRole) {
          if (snap.empty) {
            await setDoc(doc(db, 'especialistas', user.uid), {
              user_id: user.uid,
              role: forcedRole,
              nombre: expectedName,
              email: user.email,
              estado_funcionario: 'activo',
              departamento: forcedRole === 'funcionario' ? 'Atención General' : 'Administración',
              cargo: expectedName,
              letra_atencion: 'A',
            });
            snap = await getDocs(q);
          } else {
            const data = snap.docs[0].data() as any;
            if (data.role !== forcedRole || data.nombre !== expectedName) {
              await updateDoc(doc(db, 'especialistas', snap.docs[0].id), { role: forcedRole, nombre: expectedName });
              snap = await getDocs(q);
            }
          }
        }

        if (!snap.empty) {
          const data = snap.docs[0].data() as any;

          // Block pending users — show a waiting screen instead of auto-approving
          if (data.estado_funcionario === 'pendiente') {
            setUserProfile({ ...data, _isPending: true });
            setLoading(false);
            return;
          }

          setUserProfile(data);
          if (data.institution_id) {
            const instSnap = await getDoc(doc(db, 'institutions', data.institution_id));
            if (instSnap.exists()) setInstitutionName(instSnap.data().name || '');
          }
          // Auto-redirect on login
          if (data.role === 'admin' || data.role === 'gerente') {
            router.push('/admin');
          } else if (data.role === 'funcionario') {
            router.push('/funcionarios');
          }
        } else {
          // If a random user logs in but has no profile, log them out.
          await signOut(auth);
          setLoginError('Cuenta no registrada. Comuníquese con administración.');
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
    setLoginLoading(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // redirect handled by useEffect above
    } catch (err: any) {
      const code = err.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setLoginError('Correo o contraseña incorrectos.');
      } else {
        setLoginError(err.message || 'Error al iniciar sesión.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserProfile(null);
    setInstitutionName('');
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner}>
          <div className={styles.spinnerRing} />
          <div className={styles.spinnerDot} />
        </div>
        <p className={styles.loadingText}>FilApp OS</p>
      </div>
    );
  }

  /* ─── Pending account screen ────────────────────────────────────────────── */
  if (session && userProfile?._isPending) {
    return (
      <main className={styles.container}>
        <div className={styles.landingSplit} style={{ justifyContent: 'center' }}>
          <div className={styles.landingActions} style={{ borderLeft: 'none', maxWidth: '480px', margin: '0 auto' }}>
            <div className={styles.actionCard} style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
              <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: '1rem' }}>⏳</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                Cuenta Pendiente
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Tu solicitud de acceso está siendo revisada por el administrador de tu institución.
                Una vez aprobada, podrás ingresar al sistema.
              </p>
              <button onClick={handleLogout} className={styles.primaryBtn} style={{ width: '100%', justifyContent: 'center' }}>
                <LogOut size={15} /> Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ─── Logged-in portal selector ─────────────────────────────────────────── */
  if (session && userProfile) {
    const roleLabel =
      userProfile.role === 'gerente' ? 'Gerente General' :
      userProfile.role === 'admin'   ? 'Administrador'   : 'Funcionario';
    const roleColor =
      userProfile.role === 'gerente' ? 'gerente' :
      userProfile.role === 'admin'   ? 'admin'   : 'funcionario';

    return (
      <main className={styles.container}>
        <div className={styles.userBar}>
          <div className={styles.userBarLeft}>
            <Building2 size={18} />
            <span className={styles.instName}>{institutionName || 'FilApp OS'}</span>
            <span className={styles.roleBadge} data-role={roleColor}>
              {roleLabel}
            </span>
          </div>
          <div className={styles.userBarRight}>
            <span className={styles.userEmail}>{session.email}</span>
            <button onClick={handleLogout} className={styles.logoutBtn}>
              <LogOut size={15} /> Cerrar Sesión
            </button>
          </div>
        </div>

        <div className={styles.heroSmall}>
          <div className={styles.badge}>FilApp OS</div>
          <h1 className={styles.titleSmall}>Bienvenido, {userProfile.nombre || 'usuario'}</h1>
          <p className={styles.subtitle}>Seleccione un portal para continuar.</p>
        </div>

        <div className={styles.portalGrid}>
          {(userProfile.role === 'admin' || userProfile.role === 'gerente') && (
            <Link href="/admin" className={`${styles.portalCard} ${styles.portalAdmin}`}>
              <div className={styles.portalIconWrap} data-variant="admin">
                {userProfile.role === 'gerente'
                  ? <ShieldCheck size={30} />
                  : <UserCog size={30} />}
              </div>
              <span className={styles.portalLabel}>
                {userProfile.role === 'gerente' ? 'Panel Gerencial' : 'Administración'}
              </span>
              <span className={styles.portalDesc}>
                {userProfile.role === 'gerente'
                  ? 'Gestión global de instituciones y admins'
                  : 'Configuración, métricas y usuarios'}
              </span>
              <ChevronRight size={16} className={styles.portalArrow} />
            </Link>
          )}

          {userProfile.role === 'funcionario' && (
            <Link href="/funcionarios" className={`${styles.portalCard} ${styles.portalFuncionario}`}>
              <div className={styles.portalIconWrap} data-variant="funcionario">
                <Briefcase size={30} />
              </div>
              <span className={styles.portalLabel}>Panel de Atención</span>
              <span className={styles.portalDesc}>Gestión de turnos y atención de usuarios</span>
              <ChevronRight size={16} className={styles.portalArrow} />
            </Link>
          )}

          {userProfile.institution_id && (
            <a
              href={`/tv?institution=${userProfile.institution_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.portalCard} ${styles.portalTv}`}
            >
              <div className={styles.portalIconWrap} data-variant="tv">
                <MonitorPlay size={30} />
              </div>
              <span className={styles.portalLabel}>Pantalla TV</span>
              <span className={styles.portalDesc}>Visualización sala de espera</span>
              <ChevronRight size={16} className={styles.portalArrow} />
            </a>
          )}

          {userProfile.institution_id && (
            <a
              href={`/totem?institution=${userProfile.institution_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.portalCard} ${styles.portalTotem}`}
            >
              <div className={styles.portalIconWrap} data-variant="totem">
                <Users size={30} />
              </div>
              <span className={styles.portalLabel}>Tótem</span>
              <span className={styles.portalDesc}>Autoatención de pacientes</span>
              <ChevronRight size={16} className={styles.portalArrow} />
            </a>
          )}
        </div>
      </main>
    );
  }

  /* ─── Public landing (not logged in) ────────────────────────────────────── */
  return (
    <main className={styles.container}>
      <div className={styles.landingSplit}>
        {/* LEFT — Hero */}
        <div className={styles.landingHero}>
          <div className={styles.heroGlow} />
          <div className={styles.badge}>FilApp OS · v2.0</div>
          <h1 className={styles.landingTitle}>
            Sistema Multi-Institución<br />
            <span className={styles.gradientText}>de Gestión de Filas</span>
          </h1>
          <p className={styles.landingDesc}>
            Administre la atención de ciudadanos con una plataforma moderna, en tiempo real y multi-inquilino. Roles diferenciados, TV en vivo, tótem y reportes.
          </p>
          <div className={styles.featureList}>
            {[
              'Panel Gerencial Global',
              'Multi-institución',
              'Roles y permisos',
              'Tótem autoatendido',
              'TV en tiempo real',
              'Exportación CSV'
            ].map(f => (
              <div key={f} className={styles.featureItem}>{f}</div>
            ))}
          </div>

          <div className={styles.roleCards}>
            <div className={styles.roleCard} data-role="gerente">
              <ShieldCheck size={18} />
              <div>
                <strong>Gerente</strong>
                <span>Gestión global</span>
              </div>
            </div>
            <div className={styles.roleCard} data-role="admin">
              <UserCog size={18} />
              <div>
                <strong>Administrador</strong>
                <span>Su institución</span>
              </div>
            </div>
            <div className={styles.roleCard} data-role="funcionario">
              <Briefcase size={18} />
              <div>
                <strong>Funcionario</strong>
                <span>Panel de atención</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Actions */}
        <div className={styles.landingActions}>
          {/* Register new institution */}
          <div className={styles.actionCard}>
            <div className={styles.actionCardHeader}>
              <Building2 size={22} className={styles.actionCardIcon} />
              <h2>Nueva Institución</h2>
            </div>
            <p>Registre su institución y configure categorías de atención, funcionarios y módulos.</p>
            <Link href="/register" className={styles.primaryBtn}>
              Registrar Institución <ArrowRight size={16} />
            </Link>
          </div>

          <div className={styles.dividerRow}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>o inicia sesión</span>
            <span className={styles.dividerLine} />
          </div>

          {/* Login */}
          <div className={styles.actionCard}>
            <div className={styles.actionCardHeader}>
              <Settings size={22} className={styles.actionCardIcon} />
              <h2>Iniciar Sesión</h2>
            </div>
            <p>Accede a tu panel como Gerente, Administrador o Funcionario.</p>
            <form onSubmit={handleLogin} className={styles.loginForm}>
              {loginError && <div className={styles.loginError}>{loginError}</div>}
              <div className={styles.inputWrap}>
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className={styles.inputWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={loginLoading}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loginLoading ? (
                  <span className={styles.btnSpinner} />
                ) : (
                  <>Ingresar al Panel <ChevronRight size={16} /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
