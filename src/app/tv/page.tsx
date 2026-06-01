'use client';

import { useEffect, useState, useRef } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import styles from './tv.module.css';
import { Volume2, VolumeX, Play } from 'lucide-react';

interface Turno {
  id: string;
  numero: number;
  letra_especialista?: string;
  nombre_funcionario?: string;
  departamento?: string;
  estado: string;
  created_at?: string;
}

export default function TVPage() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [nuevosIngresos, setNuevosIngresos] = useState<Turno[]>([]);
  const [currentCall, setCurrentCall] = useState<Turno | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [showInitOverlay, setShowInitOverlay] = useState(true);
  const [mensajeDia, setMensajeDia] = useState('Bienvenidos a nuestra institución.');
  
  const audioEnabledRef = useRef(isAudioEnabled);
  useEffect(() => { audioEnabledRef.current = isAudioEnabled; }, [isAudioEnabled]);
  
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Load voices for TTS
  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speak = (texto: string) => {
    if (!isAudioEnabled) return;
    
    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-CL';
    
    // Try to find a Spanish voice, preferably from Chile or Latin America
    const esVoice = voicesRef.current.find(v => v.lang.includes('es-CL') || v.lang.includes('es-419') || v.lang.includes('es'));
    if (esVoice) utterance.voice = esVoice;
    
    utterance.rate = 0.9; // Slightly slower for clarity
    utterance.pitch = 1;
    
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    // Config global
    const unsubConfig = onSnapshot(doc(db, 'configuracion', 'global'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().mensaje_dia) {
        setMensajeDia(docSnap.data().mensaje_dia);
      }
    });

    const turnosRef = collection(db, 'turnos');
    const q = query(
      turnosRef, 
      where('estado', '==', 'llamado'), 
      orderBy('called_at', 'desc'), 
      limit(5)
    );

    // Fetch Llamados
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTurnos: Turno[] = [];
      snapshot.forEach((doc) => {
        fetchedTurnos.push({ id: doc.id, ...doc.data() } as Turno);
      });
      
      setTurnos(fetchedTurnos);
      
      // Check for newly added 'llamado' in this snapshot to trigger TTS
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newTurno = { id: change.doc.id, ...change.doc.data() } as Turno;
          setCurrentCall(newTurno);
          
          // Trigger Audio
          let depStr = newTurno.departamento ? `de ${newTurno.departamento}` : '';
          const funcStr = newTurno.nombre_funcionario || 'Funcionario';
          const textToSpeak = `Turno número ${newTurno.numero}, por favor acercarse a módulo ${newTurno.letra_especialista}, con ${funcStr} ${depStr}`;
          if (audioEnabledRef.current) speak(textToSpeak);
        }
      });
      
      // Set current call if array is not empty and no new ones were added
      if (fetchedTurnos.length > 0 && !snapshot.docChanges().some(c => c.type === 'added')) {
        setCurrentCall(fetchedTurnos[0]);
      }
    });

    // Fetch Espera (Nuevos ingresos)
    const qEspera = query(turnosRef, where('estado', '==', 'espera'), orderBy('created_at', 'desc'), limit(4));
    const unsubEspera = onSnapshot(qEspera, (snapshot) => {
      let isNew = false;
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.created_at) {
             const age = Date.now() - new Date(data.created_at).getTime();
             if (age < 5000) isNew = true; 
          }
        }
      });
      
      const ingresos = snapshot.docs.map(d => ({id: d.id, ...d.data()} as Turno));
      setNuevosIngresos(ingresos);

      if (isNew && audioEnabledRef.current) {
        // Usa un pitido corto si tienes un mp3, de lo contrario esto silencia o podríamos usar AudioContext.
        try {
           const ding = new Audio('/ding.mp3');
           ding.play().catch(e => console.log('Audio ding no reproducido', e));
        } catch(e) {}
      }
    });

    return () => { unsubConfig(); unsubscribe(); unsubEspera(); };
  }, []);

  const startAudio = () => {
    setIsAudioEnabled(true);
    setShowInitOverlay(false);
    
    // Hablar algo en silencio para desbloquear el motor en móviles/smart TVs
    const unlockUtterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(unlockUtterance);
  };

  if (showInitOverlay) {
    return (
      <main className={styles.overlay}>
        <div className={styles.initCard}>
          <h1>Pantalla de Espera</h1>
          <p>Para activar las notificaciones por voz (Text-to-Speech), por favor inicie la pantalla.</p>
          <button className={styles.startBtn} onClick={startAudio}>
            <Play size={24} />
            Iniciar Pantalla
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>FilApp</div>
        <button 
          className={styles.audioToggle} 
          onClick={() => setIsAudioEnabled(!isAudioEnabled)}
          title={isAudioEnabled ? "Desactivar Audio" : "Activar Audio"}
        >
          {isAudioEnabled ? <Volume2 size={32} /> : <VolumeX size={32} color="var(--destructive)" />}
        </button>
      </header>

      <div className={styles.layout}>
        {/* Lado Izquierdo: Llamado Actual */}
        <section className={styles.mainCallSection}>
          <div className={styles.mainCallCard} key={currentCall?.id}>
            <h2 className={styles.pulseText}>TURNO ACTUAL</h2>
            <div className={styles.mainTurno}>
              {currentCall ? currentCall.numero : '--'}
            </div>
            {currentCall && currentCall.letra_especialista && (
              <div className={styles.mainModulo}>
                Pase al Módulo <span>{currentCall.letra_especialista}</span>
                <div className={styles.funcName}>
                  {currentCall.nombre_funcionario} ({currentCall.departamento})
                </div>
              </div>
            )}
          </div>
          
          <div className={styles.nuevosIngresosRow}>
            <h3>Últimos Ingresos a Sala:</h3>
            <div className={styles.ingresosCards}>
              {nuevosIngresos.map(ing => (
                <div key={ing.id} className={styles.ingresoCard}>
                  Turno <strong>{ing.numero}</strong>
                </div>
              ))}
              {nuevosIngresos.length === 0 && <span>Sin ingresos en espera</span>}
            </div>
          </div>
        </section>

        {/* Lado Derecho: Historial */}
        <aside className={styles.historySection}>
          <h3 className={styles.historyTitle}>Últimos Llamados</h3>
          <div className={styles.historyList}>
            {turnos.slice(1).map((turno) => (
              <div key={turno.id} className={styles.historyItem}>
                <div className={styles.historyNumero}>
                  Turno {turno.numero}
                </div>
                <div className={styles.historyModulo}>
                  Módulo {turno.letra_especialista}
                </div>
              </div>
            ))}
            {turnos.length <= 1 && (
              <div className={styles.emptyHistory}>Sin historial reciente</div>
            )}
          </div>
        </aside>
      </div>
      
      <footer className={styles.footerTicker}>
        {/* @ts-expect-error: <marquee> is deprecated but used here for rapid ticker effect */}
        <marquee>{mensajeDia}</marquee>
      </footer>
    </main>
  );
}
