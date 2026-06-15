'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { db, auth } from '@/lib/firebase/client';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import styles from './register.module.css';
import {
  Building2, User, Mail, Lock, ArrowLeft, ArrowRight,
  CheckCircle, Eye, EyeOff, Briefcase, Users
} from 'lucide-react';

type Mode = 'select' | 'admin' | 'funcionario';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [mode, setMode] = useState<Mode>('select');
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  // Admin fields
  const [instName, setInstName] = useState('');
  const [adminName, setAdminName] = useState('');

  // Funcionario fields
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loadingInsts, setLoadingInsts] = useState(false);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [funcNombre, setFuncNombre] = useState('');
  const [funcCargo, setFuncCargo] = useState('');

  // Common auth fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Fetch institutions when funcionario mode is selected
  useEffect(() => {
    if (mode === 'funcionario' && institutions.length === 0) {
      setLoadingInsts(true);
      getDocs(query(collection(db, 'institutions'), where('estado', '==', 'activa')))
        .then(snap => setInstitutions(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(() => setError('No se pudieron cargar las instituciones.'))
        .finally(() => setLoadingInsts(false));
    }
  }, [mode]);

  const handleRegisterAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const instRef = await addDoc(collection(db, 'institutions'), {
        name: instName.trim(),
        owner_id: userCred.user.uid,
        owner_email: email,
        created_at: new Date().toISOString(),
        currentTurno: 0,
        estado: 'activa',
        config: {
          tv_name: instName.trim(),
          departamentos: ['OIRS', 'Atención General'],
          tv_primary_color: '#3b82f6',
          mensaje_dia: '',
        }
      });
      await setDoc(doc(db, 'especialistas', userCred.user.uid), {
        user_id: userCred.user.uid,
        institution_id: instRef.id,
        role: 'admin',
        nombre: adminName.trim() || 'Administrador',
        departamento: 'Administración',
        cargo: 'Administrador Principal',
        estado_funcionario: 'activo',
        avatar_url: '',
        letra_atencion: 'A',
        email: email,
        whatsapp_phone: '',
        whatsapp_apikey: '',
      });
      setDone(true);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') setError('Ese correo ya está registrado. Inicia sesión desde la página principal.');
      else if (err.code === 'auth/weak-password') setError('La contraseña debe tener al menos 6 caracteres.');
      else setError(err.message || 'Error al registrar. Intenta de nuevo.');
    }
    setLoading(false);
  };

  const handleRegisterFuncionario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstId) { setError('Debes seleccionar una institución.'); return; }
    setLoading(true); setError('');
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'especialistas', userCred.user.uid), {
        user_id: userCred.user.uid,
        institution_id: selectedInstId,
        role: 'funcionario',
        nombre: funcNombre.trim() || 'Funcionario',
        departamento: '',
        cargo: funcCargo.trim() || 'Funcionario',
        estado_funcionario: 'pendiente',
        avatar_url: '',
        letra_atencion: email.split('@')[0].substring(0, 2).toUpperCase(),
        email: email,
        whatsapp_phone: '',
        whatsapp_apikey: '',
      });
      setDone(true);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') setError('Ese correo ya está registrado.');
      else if (err.code === 'auth/weak-password') setError('La contraseña debe tener al menos 6 caracteres.');
      else setError(err.message || 'Error al registrar.');
    }
    setLoading(false);
  };

  const goBack = () => { setMode('select'); setStep(1); setError(''); setSelectedInstId(''); };

  /* ── Success screen ─────────────────────────────────────────────────────── */
  if (done) {
    return (
      <main className={styles.container}>
        <div className={styles.glow} />
        <div className={styles.card} style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div className={styles.successIcon}><CheckCircle size={48} /></div>
          <h2 className={styles.successTitle} style={{ marginTop: '1rem' }}>
            {mode === 'admin' ? '¡Institución Creada!' : 'Solicitud Enviada'}
          </h2>
          <p className={styles.successDesc} style={{ margin: '1rem 0' }}>
            {mode === 'admin'
              ? 'Tu institución ha sido registrada. Ya puedes iniciar sesión con tus credenciales.'
              : 'Tu solicitud fue enviada con éxito. El administrador de tu institución debe aprobar tu cuenta antes de que puedas ingresar al sistema.'
            }
          </p>
          <div className={styles.successBar} />
          <Link href="/" className={styles.primaryBtn} style={{ marginTop: '1.5rem', justifyContent: 'center' }}>
            Volver al Inicio
          </Link>
        </div>
      </main>
    );
  }

  /* ── Mode selection screen ──────────────────────────────────────────────── */
  if (mode === 'select') {
    return (
      <main className={styles.container}>
        <div className={styles.glow} />
        <div className={styles.card}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={15} /> Volver al inicio
          </Link>
          <div className={styles.cardHeader}>
            <div className={styles.logoMark}>
              <Users size={26} />
            </div>
            <div>
              <h1 className={styles.cardTitle}>Crear Cuenta</h1>
              <p className={styles.cardSubtitle}>¿Cómo deseas registrarte?</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
            <button onClick={() => setMode('admin')} className={styles.modeBtn}>
              <div className={styles.modeBtnIcon}><Building2 size={22} /></div>
              <div style={{ flex: 1 }}>
                <strong>Registrar Institución</strong>
                <p>Soy administrador y quiero registrar una nueva institución en FilApp.</p>
              </div>
              <ArrowRight size={18} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
            </button>
            <button onClick={() => setMode('funcionario')} className={styles.modeBtn}>
              <div className={styles.modeBtnIcon} style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}><Briefcase size={22} /></div>
              <div style={{ flex: 1 }}>
                <strong>Soy Funcionario</strong>
                <p>Trabajo en una institución registrada y necesito acceso al sistema.</p>
              </div>
              <ArrowRight size={18} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
            </button>
          </div>

          <p className={styles.note} style={{ marginTop: '1.25rem' }}>
            ¿Ya tienes cuenta? <Link href="/" className={styles.noteLink}>Inicia sesión aquí</Link>
          </p>
        </div>
      </main>
    );
  }

  /* ── Admin registration flow ────────────────────────────────────────────── */
  if (mode === 'admin') {
    return (
      <main className={styles.container}>
        <div className={styles.glow} />
        <div className={styles.card}>
          <button onClick={goBack} className={styles.backLink} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={15} /> Atrás
          </button>
          <div className={styles.cardHeader}>
            <div className={styles.logoMark}><Building2 size={26} /></div>
            <div>
              <h1 className={styles.cardTitle}>Nueva Institución</h1>
              <p className={styles.cardSubtitle}>Registra tu institución en FilApp OS</p>
            </div>
          </div>

          <div className={styles.progress}>
            <div className={`${styles.progressStep} ${step >= 1 ? styles.progressActive : ''}`}>
              <span>1</span><label>Institución</label>
            </div>
            <div className={styles.progressLine} />
            <div className={`${styles.progressStep} ${step >= 2 ? styles.progressActive : ''}`}>
              <span>2</span><label>Administrador</label>
            </div>
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2); } : handleRegisterAdmin}>
            {step === 1 && (
              <div className={styles.formSection}>
                <h3 className={styles.sectionTitle}>Datos de la Institución</h3>
                <div className={styles.inputGroup}>
                  <label><Building2 size={14} /> Nombre de la Institución</label>
                  <input type="text" value={instName} onChange={e => setInstName(e.target.value)} placeholder="Ej: Municipalidad de Santiago" required autoFocus />
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
                  <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Ej: Juan Pérez" required autoFocus />
                </div>
                <div className={styles.inputGroup}>
                  <label><Mail size={14} /> Correo Electrónico</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@municipio.cl" required />
                </div>
                <div className={styles.inputGroup}>
                  <label><Lock size={14} /> Contraseña</label>
                  <div className={styles.inputWrap}>
                    <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} />
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

  /* ── Funcionario registration flow ─────────────────────────────────────── */
  return (
    <main className={styles.container}>
      <div className={styles.glow} />
      <div className={styles.card}>
        <button onClick={goBack} className={styles.backLink} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={15} /> Atrás
        </button>
        <div className={styles.cardHeader}>
          <div className={styles.logoMark} style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', borderColor: 'rgba(16,185,129,0.2)' }}>
            <Briefcase size={26} />
          </div>
          <div>
            <h1 className={styles.cardTitle}>Registro de Funcionario</h1>
            <p className={styles.cardSubtitle}>Tu administrador aprobará tu cuenta</p>
          </div>
        </div>

        <div className={styles.progress}>
          <div className={`${styles.progressStep} ${step >= 1 ? styles.progressActive : ''}`}>
            <span>1</span><label>Institución</label>
          </div>
          <div className={styles.progressLine} />
          <div className={`${styles.progressStep} ${step >= 2 ? styles.progressActive : ''}`}>
            <span>2</span><label>Tus Datos</label>
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={step === 1
          ? (e) => { e.preventDefault(); if (!selectedInstId) { setError('Debes seleccionar una institución.'); return; } setError(''); setStep(2); }
          : handleRegisterFuncionario
        }>
          {step === 1 && (
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Selecciona tu Institución</h3>
              <div className={styles.inputGroup}>
                <label><Building2 size={14} /> Institución donde trabajas</label>
                {loadingInsts ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '0.5rem 0' }}>Cargando instituciones…</p>
                ) : (
                  <select
                    value={selectedInstId}
                    onChange={e => { setSelectedInstId(e.target.value); setError(''); }}
                    required
                    className={styles.selectField}
                  >
                    <option value="">Seleccionar institución…</option>
                    {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                )}
                {institutions.length === 0 && !loadingInsts && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.3rem' }}>
                    No hay instituciones activas. Pide a tu administrador que te registre directamente.
                  </p>
                )}
              </div>
              <button type="submit" className={styles.primaryBtn} disabled={loadingInsts}>
                Continuar <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>Tus Datos Personales</h3>
              <div className={styles.inputGroup}>
                <label><User size={14} /> Nombre Completo</label>
                <input type="text" value={funcNombre} onChange={e => setFuncNombre(e.target.value)} placeholder="Ej: María García" required autoFocus />
              </div>
              <div className={styles.inputGroup}>
                <label><Briefcase size={14} /> Cargo</label>
                <input type="text" value={funcCargo} onChange={e => setFuncCargo(e.target.value)} placeholder="Ej: Psicólogo, Asistente Social" />
              </div>
              <div className={styles.inputGroup}>
                <label><Mail size={14} /> Correo Electrónico</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.cl" required />
              </div>
              <div className={styles.inputGroup}>
                <label><Lock size={14} /> Contraseña</label>
                <div className={styles.inputWrap}>
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required minLength={6} />
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
                  {loading ? <span className={styles.spinner} /> : <>Enviar Solicitud <ArrowRight size={16} /></>}
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
