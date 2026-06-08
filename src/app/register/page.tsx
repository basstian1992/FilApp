'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import styles from './register.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [instName, setInstName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // 1. Create auth user
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. Create institution
      const instRef = await addDoc(collection(db, 'institutions'), {
        name: instName.trim(),
        owner_id: userCred.user.uid,
        owner_email: email,
        created_at: new Date().toISOString(),
        currentTurno: 0,
        config: {
          tv_name: instName.trim(),
          departamentos: ['OIRS', 'Atención General'],
          tv_primary_color: '#3b82f6'
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
        estado_funcionario: 'activo',
        email: email
      });

      router.push('/admin');
    } catch (err: any) {
      setError(err.message || 'Error al registrar.');
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <form onSubmit={handleRegister} className={styles.card}>
        <h2>Registrar Nueva Institución</h2>
        <p>Crea tu cuenta de Administrador para gestionar tu institución.</p>
        {error && <div className={styles.error}>{error}</div>}
        
        <div className={styles.inputGroup}>
          <label>Nombre de la Institución</label>
          <input type="text" value={instName} onChange={e=>setInstName(e.target.value)} required placeholder="Ej: Municipalidad de Santiago" />
        </div>
        <div className={styles.inputGroup}>
          <label>Tu Nombre Completo</label>
          <input type="text" value={adminName} onChange={e=>setAdminName(e.target.value)} required placeholder="Ej: Juan Pérez" />
        </div>
        <div className={styles.inputGroup}>
          <label>Correo Electrónico</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        </div>
        <div className={styles.inputGroup}>
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} />
        </div>
        
        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Creando entorno...' : 'Registrar y Continuar'}
        </button>
      </form>
    </main>
  );
}
