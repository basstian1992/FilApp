'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db, auth } from '@/lib/firebase/client';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import styles from './register.module.css';
import {
  Building2, User, Mail, Lock, ArrowLeft, ArrowRight, CheckCircle, Eye, EyeOff
} from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState(1); // 1=inst, 2=admin, 3=done

  const [instName, setInstName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // 1. Create Firebase Auth user
      const userCred = await createUserWithEmailAndPassword(auth, email, password);

      // 2. Create institution
      const instRef = await addDoc(collection(db, 'institutions'), {
        name: instName.trim(),
        owner_id: userCred.user.uid,
        owner_email: email,
        created_at: new Date().toISOString(),
        currentTurno: 0,
        estado: 'pendiente',
        config: {
          tv_name: instName.trim(),
          departamentos: ['OIRS', 'Atención General'],
          tv_primary_color: '#3b82f6',
          mensaje_dia: '',
        }
      });

      // 3. Create admin profile
      await setDoc(doc(db, 'especialistas', userCred.user.uid), {
        user_id: userCred.user.uid,
        institution_id: instRef.id,
        role: 'admin',
        nombre: adminName.trim() || 'Administrador',
        departamento: 'Administración',
        cargo: 'Administrador Principal',
        estado_funcionario: 'pendiente',
        avatar_url: '',
        letra_atencion: 'A',
        email: email,
        whatsapp_phone: '',
        whatsapp_apikey: '',
      });

      setStep(3);
    } catch (err: any) {
      const code = err.code;
      if (code === 'auth/email-already-in-use') {
        setError('Ese correo ya está registrado. Inicia sesión desde la página principal.');
      } else if (code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setError(err.message || 'Error al registrar. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  /* ─── Success screen ─────────────────────────────────────────────────────── */
  if (step === 3) {
    return (
      <main className={styles.container}>
        <div className={styles.card} style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div className={styles.successIcon}>
            <CheckCircle size={48} />
          </div>
          <h2 className={styles.successTitle} style={{ marginTop: '1rem' }}>Solicitud Enviada</h2>
          <p className={styles.successDesc} style={{ margin: '1rem 0' }}>
            Tu institución ha sido registrada y está <strong>pendiente de autorización</strong>.
            <br/><br/>
            Un gerente revisará tu solicitud. Una vez aprobada, podrás iniciar sesión con tu correo y contraseña.
          </p>
          <Link href="/" className={styles.primaryBtn} style={{ marginTop: '1rem', justifyContent: 'center' }}>
            Volver al Inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.glow} />

      <div className={styles.card}>
        {/* Back link */}
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={15} /> Volver al inicio
        </Link>

        {/* Header */}
        <div className={styles.cardHeader}>
          <div className={styles.logoMark}>
            <Building2 size={26} />
          </div>
          <div>
            <h1 className={styles.cardTitle}>Nueva Institución</h1>
            <p className={styles.cardSubtitle}>Registra tu institución en FilApp OS</p>
          </div>
        </div>

        {/* Progress */}
        <div className={styles.progress}>
          <div className={`${styles.progressStep} ${step >= 1 ? styles.progressActive : ''}`}>
            <span>1</span>
            <label>Institución</label>
          </div>
          <div className={styles.progressLine} />
          <div className={`${styles.progressStep} ${step >= 2 ? styles.progressActive : ''}`}>
            <span>2</span>
            <label>Administrador</label>
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : handleRegister}>
          {step === 1 && (
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Datos de la Institución</h3>
              <div className={styles.inputGroup}>
                <label><Building2 size={14} /> Nombre de la Institución</label>
                <input
                  type="text"
                  value={instName}
                  onChange={e => setInstName(e.target.value)}
                  placeholder="Ej: Municipalidad de Santiago"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className={styles.primaryBtn}>
                Continuar <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Cuenta de Administrador</h3>
              <div className={styles.inputGroup}>
                <label><User size={14} /> Nombre Completo</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={e => setAdminName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  required
                  autoFocus
                />
              </div>
              <div className={styles.inputGroup}>
                <label><Mail size={14} /> Correo Electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@municipio.cl"
                  required
                />
              </div>
              <div className={styles.inputGroup}>
                <label><Lock size={14} /> Contraseña</label>
                <div className={styles.inputWrap}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className={styles.btnRow}>
                <button type="button" className={styles.backBtn} onClick={() => setStep(1)}>
                  <ArrowLeft size={15} /> Atrás
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={loading}>
                  {loading ? <span className={styles.spinner} /> : <>Crear Institución <ArrowRight size={16} /></>}
                </button>
              </div>
            </div>
          )}
        </form>

        <p className={styles.note}>
          ¿Ya tienes cuenta? <Link href="/" className={styles.noteLink}>Inicia sesión aquí</Link>
        </p>
      </div>
    </main>
  );
}
