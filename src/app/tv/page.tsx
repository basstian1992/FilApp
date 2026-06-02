'use client';

import { useEffect, useState, useRef } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import styles from './tv.module.css';
import { Volume2, VolumeX, Play, Moon, Sun } from 'lucide-react';

interface Turno {
  id: string;
  numero: number;
  letra_especialista?: string;
  nombre_funcionario?: string;
  departamento?: string;
  letra_ticket?: string;
  estado: string;
  created_at?: string;
  called_at?: string;
}

export default function TVPage() {
  // Dark mode state
  const [isDark, setIsDark] = useState(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tv-dark-mode');
      return stored === 'true';
    }
    return false;
  });

  // Apply theme attribute to root element
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    // Persist preference
    localStorage.setItem('tv-dark-mode', String(isDark));
  }, [isDark]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [nuevosIngresos, setNuevosIngresos] = useState<Turno[]>([]);
  const [currentCall, setCurrentCall] = useState<Turno | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [showInitOverlay, setShowInitOverlay] = useState(true);
  const [mensajeDia, setMensajeDia] = useState('Bienvenidos a nuestra institución.');
  
  const audioEnabledRef = useRef(isAudioEnabled);
  const isFirstLoadLlamado = useRef(true);
  const isFirstLoadEspera = useRef(true);
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
    const q = query(turnosRef);

    // Fetch ALL turnos and filter locally to bypass index errors
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allTurnos: Turno[] = [];
      snapshot.forEach((doc) => {
        allTurnos.push({ id: doc.id, ...doc.data() } as Turno);
      });
      
      const calledTurnos = allTurnos.filter(t => t.estado === 'llamado' || t.estado === 'atendido');
      
      // Ordenar localmente por called_at desc (mas reciente primero)
      calledTurnos.sort((a, b) => {
        const timeA = new Date(a.called_at || 0).getTime();
        const timeB = new Date(b.called_at || 0).getTime();
        return timeB - timeA;
      });
      
      const latestTurnos = calledTurnos.slice(0, 6); // current + 5 history
      
      // The currently active turn should be the one in 'llamado' state.
      // Since it's sorted by called_at desc, if the most recent is 'llamado', it's the current call.
      const firstIsLlamado = latestTurnos.length > 0 && latestTurnos[0].estado === 'llamado';
      setTurnos(latestTurnos);
      
      if (firstIsLlamado) {
        setCurrentCall(latestTurnos[0]);
      } else {
        setCurrentCall(null);
      }
      
      // Check for newly added 'llamado' in this snapshot to trigger TTS
      if (isFirstLoadLlamado.current) {
        isFirstLoadLlamado.current = false;
      } else {
        snapshot.docChanges().forEach((change) => {
          if ((change.type === 'added' || change.type === 'modified') && change.doc.data().estado === 'llamado') {
            const newTurno = { id: change.doc.id, ...change.doc.data() } as Turno;
            
            // Trigger Audio
            const depStr = newTurno.departamento ? `de ${newTurno.departamento}` : '';
            const funcStr = newTurno.nombre_funcionario || 'Funcionario';
            const letraTicketStr = newTurno.letra_ticket ? `${newTurno.letra_ticket} ` : '';
            const textToSpeak = `Turno ${letraTicketStr}${newTurno.numero}, por favor acercarse a módulo ${newTurno.letra_especialista}, con ${funcStr} ${depStr}`;
                        if (audioEnabledRef.current) {
                const playDingAndSpeak = () => {
                  const ding = new Audio('/ding.mp3');
                  ding.play()
                    .then(() => {
                      setTimeout(() => {
                        speak(textToSpeak);
                      }, 1200);
                    })
                    .catch((err) => {
                      console.log('Error playing ding.mp3', err);
                      speak(textToSpeak);
                    });
                };
              playDingAndSpeak();
            }
          }
        });
      }
    });

    // Fetch Espera (Nuevos ingresos) sin orderBy para evitar error de indice compuesto
    const qEspera = query(turnosRef, where('estado', '==', 'espera'));
    const unsubEspera = onSnapshot(qEspera, (snapshot) => {
      let isNew = false;
      if (isFirstLoadEspera.current) {
        isFirstLoadEspera.current = false;
      } else {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            isNew = true; 
          }
        });
      }
      
      const ingresos = snapshot.docs.map(d => ({id: d.id, ...d.data()} as Turno));
      
      // Ordenar localmente descendente (mas recientes primero)
      ingresos.sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });
      
      setNuevosIngresos(ingresos.slice(0, 4));

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
        {/* Dark mode toggle */}
        <button
          className={styles.themeToggle}
          onClick={() => setIsDark(!isDark)}
          title={isDark ? "Modo Claro" : "Modo Oscuro"}
        >
          {isDark ? <Sun size={24} /> : <Moon size={24} />}
        </button>
      </header>

      <div className={`${styles.layout} ${styles.glass}`}>
        {/* Lado Izquierdo: Llamado Actual */}
        <section className={styles.mainCallSection}>
          <div className={`${styles.mainCallCard} ${styles.glass}`} key={currentCall?.id}>
            <h2 className={styles.pulseText}>TURNO ACTUAL</h2>
            <div className={styles.mainTurno}>
              {currentCall ? (
                <>{currentCall.letra_ticket ? `${currentCall.letra_ticket}-` : ''}{currentCall.numero}</>
              ) : '--'}
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
                  Turno <strong>{ing.letra_ticket ? `${ing.letra_ticket}-` : ''}{ing.numero}</strong>
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
                  Turno {turno.letra_ticket ? `${turno.letra_ticket}-` : ''}{turno.numero}
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
