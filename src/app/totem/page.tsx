'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './totem.module.css';
import { db } from '@/lib/firebase/client';
import { collection, doc, runTransaction, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { triggerWebhook } from '@/lib/notify';

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

type Screen = 'menu' | 'categories' | 'oirs' | 'appointment' | 'rut' | 'ticket';

function TotemInner() {
  const searchParams = useSearchParams();
  const institutionId = searchParams.get('institution');

  const [screen, setScreen] = useState<Screen>('menu');
  const [selectedMode, setSelectedMode] = useState<'general' | 'oirs' | 'appointment' | null>(null);
  const [selectedFuncionario, setSelectedFuncionario] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<{ numero: number; letra_ticket: string; departamento: string; priority: boolean; funcionario_nombre?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [categories, setCategories] = useState<string[]>([]);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [oirsDepartamento, setOirsDepartamento] = useState('OIRS');
  const [configLoaded, setConfigLoaded] = useState(false);

  const institutionIdRef = useRef(institutionId);

  useEffect(() => {
    institutionIdRef.current = institutionId;
  }, [institutionId]);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!institutionId) return;
      try {
        const instSnap = await getDoc(doc(db, 'institutions', institutionId));
        if (instSnap.exists()) {
          const data = instSnap.data();
          const config = data.config || {};
          setCategories(config.departamentos || ['Atención General']);
          setOirsDepartamento(config.oirs_departamento || 'OIRS');
          setConfigLoaded(true);
        }

        const funcSnap = await getDocs(query(
          collection(db, 'especialistas'),
          where('institution_id', '==', institutionId),
          where('role', '==', 'funcionario')
        ));
        setFuncionarios(funcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
        setCategories(['Atención General']);
        setConfigLoaded(true);
      }
    };
    fetchConfig();
  }, [institutionId]);

  const resetFlow = () => {
    setScreen('menu');
    setSelectedMode(null);
    setSelectedFuncionario(null);
    setSelectedCategory('');
    setRut('');
    setTicket(null);
    setErrorMsg('');
  };

  const handleModeSelect = (mode: 'general' | 'oirs' | 'appointment') => {
    setSelectedMode(mode);
    setScreen('rut');
  };

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    handleSubmit(cat);
  };

  const handleFuncionarioSelect = (f: any) => {
    setSelectedFuncionario(f);
    // Ya tenemos el RUT, así que directamente registramos
    handleSubmit(undefined, f);
  };

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

  const handleSubmit = async (overrideCategory?: string, overrideFuncionario?: any) => {
    const instId = institutionIdRef.current;
    if (!rut || !instId) return;

    const formattedRut = formatRutUI(rut);
    if (!validateRUT(formattedRut)) {
      setErrorMsg('RUT Inválido. Intente nuevamente.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const userRef = doc(db, 'usuarios', formattedRut);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, { rut: formattedRut, institution_id: instId, created_at: new Date().toISOString() });
      }

      const instRef = doc(db, 'institutions', instId);
      const turnoRef = doc(collection(db, 'turnos'));

      let newNumero = 1;
      const isAppointment = selectedMode === 'appointment';
      
      const finalCategory = overrideCategory || selectedCategory;
      const finalFunc = overrideFuncionario || selectedFuncionario;

      const departamento = selectedMode === 'oirs'
        ? oirsDepartamento
        : selectedMode === 'appointment'
          ? (finalFunc ? (finalFunc.departamento || 'Hora Agendada') : (finalCategory || 'Hora Agendada'))
          : finalCategory;

      let letraTicket = departamento.charAt(0).toUpperCase();
      if (selectedMode === 'appointment' && finalFunc) {
        letraTicket = finalFunc.letra_atencion || departamento.charAt(0).toUpperCase();
      }

      const result = await runTransaction(db, async (transaction) => {
        const instDoc = await transaction.get(instRef);
        const santiagoNowStr = new Date().toLocaleString("en-US", {timeZone: "America/Santiago"});
        const nowSCL = new Date(santiagoNowStr);
        const resetTimeSCL = new Date(nowSCL.getFullYear(), nowSCL.getMonth(), nowSCL.getDate(), 7, 0, 0, 0);

        let currentNumero = 0;
        let lastReset = null;

        if (!instDoc.exists()) {
          transaction.set(instRef, { currentTurno: 0, ultimo_reinicio: null }, { merge: true });
        } else {
          currentNumero = instDoc.data()?.currentTurno || 0;
          lastReset = instDoc.data()?.ultimo_reinicio || null;
        }

        let shouldReset = false;

        if (nowSCL >= resetTimeSCL) {
          if (!lastReset) {
            shouldReset = true;
          } else {
            const lastResetSCL = new Date(new Date(lastReset).toLocaleString("en-US", {timeZone: "America/Santiago"}));
            if (lastResetSCL < resetTimeSCL) shouldReset = true;
          }
        } else {
          const yesterdayResetSCL = new Date(resetTimeSCL);
          yesterdayResetSCL.setDate(yesterdayResetSCL.getDate() - 1);
          if (!lastReset) {
            shouldReset = true;
          } else {
            const lastResetSCL = new Date(new Date(lastReset).toLocaleString("en-US", {timeZone: "America/Santiago"}));
            if (lastResetSCL < yesterdayResetSCL) shouldReset = true;
          }
        }

        if (shouldReset) {
          currentNumero = 0;
          lastReset = new Date().toISOString();
        }

        newNumero = currentNumero + 1;
        transaction.update(instRef, { currentTurno: newNumero, ultimo_reinicio: lastReset });

        const departamento = selectedMode === 'oirs'
          ? oirsDepartamento
          : selectedMode === 'appointment'
            ? (finalFunc ? (finalFunc.departamento || 'Hora Agendada') : 'Hora Agendada')
            : finalCategory;

        let letraTicket = departamento.charAt(0).toUpperCase();
        if (selectedMode === 'appointment' && finalFunc) {
          letraTicket = finalFunc.letra_atencion || departamento.charAt(0).toUpperCase();
        }

        transaction.set(turnoRef, {
          institution_id: instId,
          numero: newNumero,
          letra_ticket: letraTicket,
          departamento_solicitado: departamento,
          rut_usuario: formattedRut,
          estado: 'espera',
          created_at: nowSCL.toISOString(),
          priority: isAppointment,
          funcionario_id: isAppointment && finalFunc ? finalFunc.id : null,
          funcionario_nombre: isAppointment && finalFunc ? finalFunc.nombre : null,
          llamado_en: null,
          box: null
        });

        return { newNumero, letraTicket, departamento, isAppointment, finalFunc };
      });

      setTicket({ 
        numero: result.newNumero, 
        letra_ticket: result.letraTicket, 
        departamento: result.departamento, 
        priority: result.isAppointment,
        funcionario_nombre: result.finalFunc ? result.finalFunc.nombre : undefined
      });
      setScreen('ticket');

      triggerWebhook('ingreso', {
        numero: result.newNumero,
        rut_usuario: formattedRut,
        institution_id: instId,
        is_appointment: isAppointment,
      });

      const { io } = await import('socket.io-client');
      const socket = io(window.location.origin);
      socket.emit('appointment-arrived', {
        institutionId: instId,
        funcionarioId: selectedFuncionario?.user_id,
        ticket: { numero: newNumero, letra_ticket: letraTicket, departamento, rut_usuario: formattedRut },
      });
      setTimeout(() => socket.disconnect(), 2000);

      setTimeout(resetFlow, 10000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error al generar el turno.');
    } finally {
      setLoading(false);
    }
  };

  if (screen === 'ticket' && ticket) {
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
          {ticket.priority && (
            <div className={styles.priorityBadge}>
              Cita Agendada - {ticket.funcionario_nombre || ticket.departamento}
            </div>
          )}

          <p className={styles.autoCloseText}>Esta pantalla se cerrará automáticamente...</p>
          <button className={styles.primaryBtn} onClick={resetFlow}>
            Nuevo Turno
          </button>
        </div>
      </main>
    );
  }

  if (screen === 'menu') {
    return (
      <main className={styles.container}>
        <div className={styles.glassPanel}>
          <h1 className={styles.title}>Bienvenido</h1>
          <p className={styles.subtitle}>Seleccione el tipo de atención que necesita</p>

          <div className={styles.menuGrid}>
            <button className={styles.menuBtn} onClick={() => handleModeSelect('general')}>
              <span className={styles.menuIcon}>&#x1F4CB;</span>
              <span className={styles.menuLabel}>Atención General</span>
              <span className={styles.menuDesc}>Orden de llegada</span>
            </button>
            <button className={`${styles.menuBtn} ${styles.menuOirs}`} onClick={() => handleModeSelect('oirs')}>
              <span className={styles.menuIcon}>&#x1F4AC;</span>
              <span className={styles.menuLabel}>Orientación de Trámites</span>
              <span className={styles.menuDesc}>Consultas rápidas (OIRS)</span>
            </button>
            <button className={`${styles.menuBtn} ${styles.menuAppointment}`} onClick={() => handleModeSelect('appointment')}>
              <span className={styles.menuIcon}>&#x1F4C5;</span>
              <span className={styles.menuLabel}>Hora Agendada</span>
              <span className={styles.menuDesc}>Tengo una cita programada</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (screen === 'categories') {
    return (
      <main className={styles.container}>
        <div className={styles.glassPanel}>
          <button className={styles.backBtn} onClick={resetFlow}>← Volver</button>
          <h1 className={styles.title}>Atención General</h1>
          <p className={styles.subtitle}>Seleccione el motivo de su atención</p>

          <div className={styles.deptoGrid}>
            {categories.map(cat => (
              <button key={cat} className={styles.deptoBtn} onClick={() => handleCategorySelect(cat)}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }


  if (screen === 'appointment') {
    return (
      <main className={styles.container}>
        <div className={styles.glassPanel}>
          <button className={styles.backBtn} onClick={resetFlow}>← Volver</button>
          <h1 className={styles.title}>Hora Agendada</h1>
          <p className={styles.subtitle}>Seleccione el funcionario con quien tiene la cita</p>

          <div className={styles.deptoGrid}>
            {funcionarios.map(f => (
              <button key={f.id} className={styles.deptoBtn} onClick={() => handleFuncionarioSelect(f)}>
                <strong>{f.nombre}</strong>
                <small style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7 }}>{f.departamento}</small>
              </button>
            ))}
            {funcionarios.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', gridColumn: '1/-1', textAlign: 'center' }}>
                No hay funcionarios disponibles para agendar.
              </p>
            )}
            <button className={styles.deptoBtn} style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px dashed rgba(255,255,255,0.4)' }} onClick={() => {
              setSelectedFuncionario(null);
              setScreen('categories');
            }}>
              <strong>No sé el nombre</strong>
              <small style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7 }}>Elegir por categoría</small>
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.glassPanel}>
        <button className={styles.backBtn} onClick={() => setScreen('menu')}>← Volver</button>
        <h1 className={styles.title}>
          {selectedMode === 'general' ? selectedCategory : selectedMode === 'appointment' ? `Cita con ${selectedFuncionario?.nombre || 'Funcionario'}` : oirsDepartamento}
        </h1>
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
              const formattedRut = formatRutUI(rut);
              if (!validateRUT(formattedRut)) {
                setErrorMsg('RUT Inválido. Intente nuevamente.');
                return;
              }
              if (selectedMode === 'general') {
                setScreen('categories');
              } else if (selectedMode === 'appointment') {
                setScreen('appointment');
              } else {
                handleSubmit();
              }
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

        <button className={styles.primaryBtn} onClick={() => {
          const formattedRut = formatRutUI(rut);
          if (!validateRUT(formattedRut)) {
            setErrorMsg('RUT Inválido. Intente nuevamente.');
            return;
          }
          if (selectedMode === 'general') {
            setScreen('categories');
          } else if (selectedMode === 'appointment') {
            setScreen('appointment');
          } else {
            handleSubmit();
          }
        }} disabled={rut.length < 8 || loading}>
          {selectedMode === 'general' || selectedMode === 'appointment' ? 'Continuar' : (loading ? 'Generando...' : 'Obtener Turno')}
        </button>
      </div>
    </main>
  );
}

export default function TotemPage() {
  return (
    <Suspense fallback={<div className={styles.container}><div className={styles.glassPanel}><p>Cargando...</p></div></div>}>
      <TotemInner />
    </Suspense>
  );
}
