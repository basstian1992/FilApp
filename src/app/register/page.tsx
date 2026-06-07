'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import styles from './register.module.css';
import { Plus, X } from 'lucide-react';

const DEFAULT_CATEGORIES: string[] = [];

export default function RegisterPage() {
  const router = useRouter();
  const [institutionName, setInstitutionName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [newCategory, setNewCategory] = useState('');
  const [oirsDepto, setOirsDepto] = useState('OIRS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories(prev => [...prev, trimmed]);
      setNewCategory('');
    }
  };

  const removeCategory = (cat: string) => {
    setCategories(prev => prev.filter(c => c !== cat));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (categories.length === 0) {
      setError('Debe agregar al menos una categoría de atención.');
      setLoading(false);
      return;
    }

    try {
      const institutionRef = await addDoc(collection(db, 'institutions'), {
        name: institutionName.trim(),
        created_at: new Date().toISOString(),
        currentTurno: 0,
        ultimo_reinicio: null,
        config: {
          mensaje_dia: 'Bienvenidos a ' + institutionName.trim(),
          departamentos: categories,
          oirs_departamento: oirsDepto.trim() || 'OIRS',
        }
      });

      const institutionId = institutionRef.id;
      const userCred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);

      await setDoc(doc(db, 'especialistas', userCred.user.uid), {
        user_id: userCred.user.uid,
        institution_id: institutionId,
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

      setSuccess(`Institución "${institutionName}" registrada exitosamente con ${categories.length} categorías. Redirigiendo...`);
      setTimeout(() => router.push('/admin'), 2000);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('El correo ya está registrado. Intente iniciar sesión.');
      } else {
        setError(err.message || 'Error al registrar la institución.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <h1>Registrar Institución</h1>
        <p>Complete los datos para crear su institución y quedar como administrador.</p>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        {!success && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className={styles.section}>
              <span className={styles.sectionTitle}>Datos de la Institución</span>
              <div className={styles.inputGroup}>
                <label>Nombre de la Institución</label>
                <input type="text" value={institutionName} onChange={e => setInstitutionName(e.target.value)} placeholder="Ej: Municipalidad de Santiago" required />
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}>Categorías de Atención</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                Defina las categorías o departamentos donde los ciudadanos pueden ser atendidos.
              </p>
              <div className={styles.categoryRow}>
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="Ej: Atención General, DIDECO..."
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                />
                <button type="button" className={styles.addBtn} onClick={addCategory}>
                  <Plus size={16} /> Agregar
                </button>
              </div>
              <div className={styles.categoryList}>
                {categories.map(cat => (
                  <span key={cat} className={styles.categoryTag}>
                    {cat}
                    <button type="button" onClick={() => removeCategory(cat)}><X size={12} /></button>
                  </span>
                ))}
              </div>
              <div className={styles.inputGroup}>
                <label>Departamento de Orientación (OIRS)</label>
                <input type="text" value={oirsDepto} onChange={e => setOirsDepto(e.target.value)} placeholder="OIRS" />
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}>Administrador</span>
              <div className={styles.inputGroup}>
                <label>Nombre del Administrador</label>
                <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Ej: Juan Pérez" required />
              </div>
              <div className={styles.inputGroup}>
                <label>Correo Electrónico</label>
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@institucion.cl" required />
              </div>
              <div className={styles.inputGroup}>
                <label>Contraseña</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} required />
              </div>
            </div>

            <button type="submit" className={styles.primaryBtn} disabled={loading}>
              {loading ? 'Registrando...' : 'Crear Institución'}
            </button>
          </form>
        )}

        <div className={styles.backLink}>
          ¿Ya tienes cuenta? <a href="/">Iniciar Sesión</a>
        </div>
      </div>
    </main>
  );
}
