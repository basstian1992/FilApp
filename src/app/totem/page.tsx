'use client';

import { useState, useEffect } from 'react';
import styles from './totem.module.css';
import { db } from '@/lib/firebase/client';
import { collection, doc, runTransaction, setDoc, getDoc } from 'firebase/firestore';
import { triggerWebhook } from '@/lib/notify';

// Utilidad para validar RUT Chileno (Módulo 11)
function validateRUT(rut: string) {
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
}

export default function TotemPage() {
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<{ numero: number, letra_ticket: string, departamento: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [departamentos, setDepartamentos] = useState<string[]>(['DIDECO', 'OMIL', 'PRODESAL', 'P.M. Jefas de Hogar', 'Turismo', 'OTEC', 'Fomento', 'Otro']);
  const [selectedDepto, setSelectedDepto] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'configuracion', 'global'));
        if (snap.exists() && snap.data().departamentos) {
          setDepartamentos(snap.data().departamentos);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchConfig();
  }, []);

  const handleKeypad = (val: string) => {
    setErrorMsg('');
    if (val === 'DEL') {
      setRut(prev => prev.slice(0, -1));
    } else if (val === 'C') {
      setRut('');
    } else {
      if (rut.length < 10) setRut(prev => prev + val);
    }
  };

  const formatRutUI = (raw: string) => {
    if (raw.length <= 1) return raw;
    const body = raw.slice(0, -1);
    const dv = raw.slice(-1);
    return `${body}-${dv}`;
  };

  const handleSubmit = async () => {
    if (!rut) return;
    
    const formattedRut = formatRutUI(rut);
    if (!validateRUT(formattedRut)) {
      setErrorMsg('RUT Inválido. Intente nuevamente.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Upsert User in Firestore
      const userRef = doc(db, 'usuarios', formattedRut);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, { rut: formattedRut, created_at: new Date().toISOString() });
      }

      // 2. Transaction to get incremented Turno
      const configRef = doc(db, 'configuracion', 'global');
      const turnoRef = doc(collection(db, 'turnos'));
      
      let newNumero = 1;
      let letraTicket = selectedDepto ? selectedDepto.charAt(0).toUpperCase() : 'T';
      
      await runTransaction(db, async (transaction) => {
        const configDoc = await transaction.get(configRef);
        
        const now = new Date();
        const resetTime = new Date();
        resetTime.setHours(7, 30, 0, 0);
        
        let currentNumero = 0;
        let lastReset = null;
        const turnosKey = `currentTurno_${selectedDepto || 'general'}`;

        if (!configDoc.exists()) {
          transaction.set(configRef, { [turnosKey]: 0, mensaje_dia: 'Bienvenidos' });
        } else {
          currentNumero = configDoc.data()[turnosKey] || 0;
          lastReset = configDoc.data().ultimo_reinicio || null;
        }
        
        // Reset Logic
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
        transaction.update(configRef, { [turnosKey]: newNumero, ultimo_reinicio: lastReset });
        
        transaction.set(turnoRef, {
          numero: newNumero,
          letra_ticket: letraTicket,
          departamento_solicitado: selectedDepto,
          rut_usuario: formattedRut,
          estado: 'espera',
          created_at: new Date().toISOString()
        });
      });

      setTicket({ numero: newNumero, letra_ticket: letraTicket, departamento: selectedDepto || '' });
      
      // Notificar a n8n
      triggerWebhook('ingreso', { numero: newNumero, rut_usuario: formattedRut });
      
      // Auto reset después de 8 segundos
      setTimeout(() => {
        setTicket(null);
        setRut('');
        setSelectedDepto(null);
      }, 8000);
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al generar el turno.');
    } finally {
      setLoading(false);
    }
  };

  if (ticket) {
    return (
      <main className={styles.container}>
        <div className={`${styles.glassPanel} ${styles.ticketView}`}>
          <h1 className={styles.successTitle}>¡Turno Generado!</h1>
          <p className={styles.instruction}>Por favor, espere su llamado en la pantalla.</p>
          
          <div className={styles.ticketNumber}>
            {ticket.letra_ticket}-{ticket.numero}
          </div>
          <div className={styles.ticketDepto}>
            Módulo: {ticket.departamento}
          </div>
          
          <p className={styles.autoCloseText}>Esta pantalla se cerrará automáticamente...</p>
          <button className={styles.primaryBtn} onClick={() => { setTicket(null); setRut(''); setSelectedDepto(null); }}>
            Nuevo Turno
          </button>
        </div>
      </main>
    );
  }

  if (!selectedDepto) {
    return (
      <main className={styles.container}>
        <div className={styles.glassPanel}>
          <h1 className={styles.title}>Bienvenido</h1>
          <p className={styles.subtitle}>Seleccione el módulo al que desea dirigirse</p>
          
          <div className={styles.deptoGrid}>
            {departamentos.map(dep => (
              <button key={dep} className={styles.deptoBtn} onClick={() => setSelectedDepto(dep)}>
                {dep}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.glassPanel}>
        <button className={styles.backBtn} onClick={() => { setSelectedDepto(null); setRut(''); setErrorMsg(''); }}>
          ← Volver
        </button>
        <h1 className={styles.title}>{selectedDepto}</h1>
        <p className={styles.subtitle}>Ingrese su RUT para obtener un número de atención</p>
        
        <input 
          type="text"
          className={styles.realInput}
          value={rut ? formatRutUI(rut) : ''}
          placeholder="12345678-9"
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9kK]/gi, '');
            if (val.length <= 10) setRut(val);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && rut.length >= 8 && !loading) {
              handleSubmit();
            }
          }}
          autoFocus
        />
        
        {errorMsg && <p style={{ color: 'var(--destructive)', fontWeight: 'bold' }}>{errorMsg}</p>}

        <div className={styles.keypad}>
          {['1','2','3','4','5','6','7','8','9','C','0','k','DEL'].map((key) => (
            <button 
              key={key} 
              className={`${styles.keyBtn} ${key === 'DEL' ? styles.delBtn : ''} ${key === 'C' ? styles.clearBtn : ''}`}
              onClick={() => handleKeypad(key)}
            >
              {key === 'DEL' ? 'Borrar' : key === 'C' ? 'Limpiar' : key}
            </button>
          ))}
        </div>

        <button 
          className={styles.primaryBtn} 
          onClick={handleSubmit} 
          disabled={rut.length < 8 || loading}
        >
          {loading ? 'Generando...' : 'Obtener Turno'}
        </button>
      </div>
    </main>
  );
}
