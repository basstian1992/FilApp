'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/gerencia');
  }, []);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
      <p>Redirigiendo a Gerencia...</p>
    </div>
  );
}
