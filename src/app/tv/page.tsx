'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useTheme } from 'next-themes';
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
  institution_id?: string;
}

function TVInner() {
  const searchParams = useSearchParams();
  const institutionId = searchParams.get('institution');

  const { theme, setTheme, resolvedTheme } = useTheme();
  const currentTheme = theme === 'system' ? resolvedTheme : theme;
  const isDark = currentTheme === 'dark';

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [nuevosIngresos, setNuevosIngresos] = useState<Turno[]>([]);
  const [currentCall, setCurrentCall] = useState<Turno | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [showInitOverlay, setShowInitOverlay] = useState(true);
  const [mensajeDia, setMensajeDia] = useState('Bienvenidos a nuestra institución.');
  const [tvName, setTvName] = useState('FilApp');
  const [logoUrl, setLogoUrl] = useState('');
  const [tvPrimaryColor, setTvPrimaryColor] = useState('');
  const [tvBackgroundUrl, setTvBackgroundUrl] = useState('');
  const [clock, setClock] = useState('');

  const audioEnabledRef = useRef(isAudioEnabled);
  const isFirstLoadLlamado = useRef(true);
  const isFirstLoadEspera = useRef(true);
  useEffect(() => { audioEnabledRef.current = isAudioEnabled; }, [isAudioEnabled]);

  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  const speak = (texto: string) => {
    if (!isAudioEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-CL';
    // Priorizamos voces de alta calidad (Online/Google/Premium/Natural) sobre las básicas de escritorio
    const spanishVoices = voicesRef.current.filter(v => v.lang.includes('es'));
    let bestVoice = spanishVoices.find(v => 
      v.name.includes('Natural') || 
      v.name.includes('Online') || 
      v.name.includes('Google') || 
      v.name.includes('Premium') ||
      v.name.includes('Multilingual Online')
    );
    
    // Si no hay voz "Premium/Natural", buscamos al menos una latinoamericana
    if (!bestVoice) {
      bestVoice = spanishVoices.find(v => v.lang.includes('es-CL') || v.lang.includes('es-419') || v.lang.includes('es-MX') || v.lang.includes('es-US'));
    }
    // Si nada de lo anterior funciona, usamos la primera en español disponible
    if (!bestVoice && spanishVoices.length > 0) {
      bestVoice = spanishVoices[0];
    }

    if (bestVoice) utterance.voice = bestVoice;
    
    // Ajustes para que suene un poco más fluida y natural
    utterance.rate = 0.95; // Ligeramente más pausado
    utterance.pitch = 1.05; // Un toque más agudo para evitar sonido monótono

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const fetchConfig = async () => {
      if (!institutionId) return;
      try {
        const instSnap = await getDoc(doc(db, 'institutions', institutionId));
        if (instSnap.exists() && instSnap.data().config) {
          const cfg = instSnap.data().config;
          if (cfg.mensaje_dia) setMensajeDia(cfg.mensaje_dia);
          if (cfg.tv_name) setTvName(cfg.tv_name);
          if (cfg.logo_url) setLogoUrl(cfg.logo_url);
          if (cfg.tv_primary_color) setTvPrimaryColor(cfg.tv_primary_color);
          if (cfg.tv_background_url) setTvBackgroundUrl(cfg.tv_background_url);
        }
      } catch (e) {}
    };
    if (institutionId) fetchConfig();

    const turnosRef = collection(db, 'turnos');
    const q = institutionId
      ? query(turnosRef, where('institution_id', '==', institutionId))
      : query(turnosRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allTurnos: Turno[] = [];
      snapshot.forEach(doc => { allTurnos.push({ id: doc.id, ...doc.data() } as Turno); });

      const calledTurnos = allTurnos.filter(t => t.estado === 'llamado' || t.estado === 'atendido');
      calledTurnos.sort((a, b) => new Date(b.called_at || 0).getTime() - new Date(a.called_at || 0).getTime());

      const latestTurnos = calledTurnos.slice(0, 8);
      const firstIsLlamado = latestTurnos.length > 0 && latestTurnos[0].estado === 'llamado';
      setTurnos(latestTurnos);
      setCurrentCall(firstIsLlamado ? latestTurnos[0] : null);

      if (!isFirstLoadLlamado.current) {
        snapshot.docChanges().forEach(change => {
          if ((change.type === 'added' || change.type === 'modified') && change.doc.data().estado === 'llamado') {
            const t = change.doc.data() as Turno;
            const depStr = t.departamento ? `de ${t.departamento}` : '';
            const funcStr = t.nombre_funcionario || 'Funcionario';
            const ticketStr = t.letra_ticket ? `${t.letra_ticket} ` : '';
            const textToSpeak = `Siguiente turno, ${t.letra_ticket ? 'letra ' + t.letra_ticket + ', ' : ''}número ${t.numero}. Dirigirse al módulo ${t.letra_especialista}.`;
            if (audioEnabledRef.current) {
              const ding = new Audio('/ding.mp3');
              ding.play().then(() => setTimeout(() => speak(textToSpeak), 1200)).catch(() => speak(textToSpeak));
            }
          }
        });
      }
      isFirstLoadLlamado.current = false;
    });

    const qEspera = institutionId
      ? query(turnosRef, where('estado', '==', 'espera'), where('institution_id', '==', institutionId))
      : query(turnosRef, where('estado', '==', 'espera'));

    const unsubEspera = onSnapshot(qEspera, (snapshot) => {
      isFirstLoadEspera.current = false;
      const ingresos = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Turno));
      ingresos.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setNuevosIngresos(ingresos.slice(0, 6));

      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' && audioEnabledRef.current) {
          try { new Audio('/ding.mp3').play().catch(() => {}); } catch(e) {}
        }
      });
    });

    return () => { unsubscribe(); unsubEspera(); };
  }, [institutionId]);

  const startAudio = () => {
    setIsAudioEnabled(true);
    setShowInitOverlay(false);
    const unlock = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(unlock);
  };

  if (showInitOverlay) {
    return (
      <main className={styles.overlay}>
        <div className={styles.initCard}>
          <h1>Pantalla de Sala de Espera</h1>
          <p>Active las notificaciones de voz para comenzar a recibir los avisos de turnos llamados a los módulos de atención.</p>
          <button className={styles.startBtn} onClick={startAudio}>
            <Play size={22} />
            Iniciar Pantalla
          </button>
        </div>
      </main>
    );
  }

  const customStyles = {
    '--tv-primary': tvPrimaryColor || '#3b82f6',
    '--tv-bg-image': tvBackgroundUrl ? `url("${tvBackgroundUrl}")` : 'none',
  } as React.CSSProperties;

  return (
    <main className={styles.container} style={customStyles}>
      <header className={styles.header}>
        <div className={styles.logo} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {logoUrl ? <img src={logoUrl} alt="Logo Institución" className={styles.tvLogoImg} /> : null}
          {tvName}
        </div>
        <div className={styles.headerCenter}>
          {clock && <span>{clock}</span>}
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.audioToggle}
            data-active={isAudioEnabled}
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            title={isAudioEnabled ? 'Desactivar Audio' : 'Activar Audio'}
          >
            {isAudioEnabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>
          <button
            className={styles.themeToggle}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title={isDark ? 'Modo Claro' : 'Modo Oscuro'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <div className={styles.mainContent}>
        <section className={styles.callSection}>
          <div className={styles.currentCallCard} key={currentCall?.id || 'empty'}>
            <span className={styles.callLabel}>Turno Actual</span>
            {currentCall ? (
              <>
                <div className={styles.callTurno}>
                  {currentCall.letra_ticket ? `${currentCall.letra_ticket}-` : ''}{currentCall.numero}
                </div>
                {currentCall.letra_especialista && (
                  <div className={styles.callModule}>
                    Diríjase al Módulo{' '}
                    <span className={styles.callModuleHighlight}>{currentCall.letra_especialista}</span>
                  </div>
                )}
                {currentCall.nombre_funcionario && (
                  <div className={styles.callStaff}>
                    Atendido por {currentCall.nombre_funcionario}
                    {currentCall.departamento ? ` (${currentCall.departamento})` : ''}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.callTurnoEmpty}>Esperando...</div>
            )}
          </div>

          <div className={styles.ingresosBar}>
            <span className={styles.ingresosLabel}>Ingresos</span>
            <div className={styles.ingresosList}>
              {nuevosIngresos.length > 0 ? (
                nuevosIngresos.map(ing => (
                  <div key={ing.id} className={styles.ingresoItem}>
                    {ing.letra_ticket ? `${ing.letra_ticket}-` : ''}{ing.numero}
                  </div>
                ))
              ) : (
                <span className={styles.ingresoEmpty}>Sin ingresos recientes</span>
              )}
            </div>
          </div>
        </section>

        <aside className={styles.historySection}>
          <div className={styles.historyTitle}>Últimos Llamados</div>
          <div className={styles.historyList}>
            {turnos.slice(1).map(turno => (
              <div key={turno.id} className={styles.historyItem}>
                <span className={styles.historyTurno}>
                  {turno.letra_ticket ? `${turno.letra_ticket}-` : ''}{turno.numero}
                </span>
                <span className={styles.historyModulo}>
                  Mód. {turno.letra_especialista || '?'}
                </span>
              </div>
            ))}
            {turnos.length <= 1 && (
              <div className={styles.historyEmpty}>Sin historial</div>
            )}
          </div>
        </aside>
      </div>

      <footer className={styles.footerTicker}>
        {/* @ts-expect-error */}
        <marquee>{mensajeDia}</marquee>
      </footer>
    </main>
  );
}

export default function TVPage() {
  return (
    <Suspense fallback={<main className={styles.overlay}><div className={styles.initCard}><p>Cargando...</p></div></main>}>
      <TVInner />
    </Suspense>
  );
}
