'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useTheme } from 'next-themes';
import styles from './tv.module.css';
import { Volume2, VolumeX, Play, Moon, Sun, Mic, Maximize2, RotateCcw, CheckCircle2 } from 'lucide-react';

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
  rut_usuario?: string;
  nombre_paciente?: string;
}

/* ─── Premium Voice Engine ─────────────────────────────────────────────── */
const VOICE_PRIORITY_PATTERNS = [
  'Microsoft Raul',
  'Microsoft Jorge',
  'Microsoft Catalina',
  'Microsoft Lorenzo',
  'Microsoft Dalia',
  'Microsoft Pablo',
  'Microsoft Tomas',
  'Microsoft Elena',
  'Microsoft Gonzalo',
  'Microsoft Salome',
  'Microsoft Francisco',
  'Microsoft Beatriz',
  'Microsoft Carlota',
  'Microsoft Cecilia',
  'Microsoft Larissa',
  'Microsoft Liberto',
  'Microsoft Helena',
  'Microsoft Sabina',
  'Natural',
  'Premium',
  'Google español',
  'Google Español',
  'español',
  'espanol',
  'Google',
  'Microsoft',
  'Online',
  'Multilingual Online',
];

const LATAM_LANG = /es-(CL|MX|AR|CO|PE|VE|EC|BO|PY|UY|GT|HN|SV|NI|CR|PA|DO|PR|CU|419)/;

const LANG_LABEL: Record<string, string> = {
  'es-CL': 'Chile', 'es-MX': 'México', 'es-AR': 'Argentina', 'es-CO': 'Colombia',
  'es-PE': 'Perú', 'es-VE': 'Venezuela', 'es-EC': 'Ecuador', 'es-BO': 'Bolivia',
  'es-PY': 'Paraguay', 'es-UY': 'Uruguay', 'es-GT': 'Guatemala', 'es-HN': 'Honduras',
  'es-SV': 'El Salvador', 'es-NI': 'Nicaragua', 'es-CR': 'Costa Rica', 'es-PA': 'Panamá',
  'es-DO': 'Rep. Dominicana', 'es-PR': 'Puerto Rico', 'es-CU': 'Cuba', 'es-419': 'Latinoamérica',
  'es-ES': 'España',
};

function isLatamVoice(v: SpeechSynthesisVoice): boolean {
  return LATAM_LANG.test(v.lang);
}

function voiceScore(v: SpeechSynthesisVoice): number {
  for (let i = 0; i < VOICE_PRIORITY_PATTERNS.length; i++) {
    if (v.name.includes(VOICE_PRIORITY_PATTERNS[i])) return VOICE_PRIORITY_PATTERNS.length - i;
  }
  return 0;
}

function voiceLabel(v: SpeechSynthesisVoice): string {
  const country = LANG_LABEL[v.lang] || v.lang;
  const name = v.name.replace(/^Microsoft /, '').replace(/^Google /, '');
  return `${name} · ${country}`;
}

function sortSpanishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => {
    const aLatam = isLatamVoice(a) ? 1 : 0;
    const bLatam = isLatamVoice(b) ? 1 : 0;
    if (aLatam !== bLatam) return bLatam - aLatam;
    return voiceScore(b) - voiceScore(a);
  });
}

let _cachedVoices: SpeechSynthesisVoice[] = [];
let _voiceLoadPromise: Promise<SpeechSynthesisVoice[]> | null = null;
const _utteranceRefs: SpeechSynthesisUtterance[] = [];

function ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  if (_cachedVoices.length > 0) return Promise.resolve(_cachedVoices);
  if (_voiceLoadPromise) return _voiceLoadPromise;

  _voiceLoadPromise = new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      _cachedVoices = voices;
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      const v = window.speechSynthesis.getVoices();
      _cachedVoices = v;
      resolve(v);
    };
    setTimeout(() => {
      if (_cachedVoices.length === 0) {
        _cachedVoices = window.speechSynthesis.getVoices();
        resolve(_cachedVoices);
      }
    }, 3000);
  });

  return _voiceLoadPromise;
}

function selectBestSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const spanish = voices.filter(v => v.lang.startsWith('es') && !v.lang.startsWith('es-US'));
  if (spanish.length === 0) return null;

  const latam = spanish.filter(v => LATAM_LANG.test(v.lang));

  const matchByPriority = (pool: SpeechSynthesisVoice[]) => {
    for (const pattern of VOICE_PRIORITY_PATTERNS) {
      const found = pool.find(v => v.name.includes(pattern));
      if (found) return found;
    }
    return null;
  };

  const best = matchByPriority(latam);
  if (best) return best;

  if (latam.length > 0) return latam[0];

  const bestAny = matchByPriority(spanish);
  if (bestAny) return bestAny;

  return spanish[0];
}

let _voiceAvailable: boolean | null = null;

function isVoiceAvailable(): boolean {
  if (_voiceAvailable !== null) return _voiceAvailable;
  _voiceAvailable = typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.speechSynthesis.speak === 'function';
  return _voiceAvailable;
}

function speakText(texto: string, audioEnabled: boolean, forcedVoice?: SpeechSynthesisVoice | null) {
  if (!audioEnabled || !isVoiceAvailable() || !texto.trim()) {
    if (!audioEnabled) console.warn('[Voz TV] Audio desactivado');
    else if (!isVoiceAvailable()) console.warn('[Voz TV] speechSynthesis no disponible');
    return;
  }

  window.speechSynthesis.cancel();
  _utteranceRefs.length = 0;

  const voices = window.speechSynthesis.getVoices();
  _cachedVoices = voices.length > 0 ? voices : _cachedVoices;
  const bestVoice = forcedVoice ?? (_cachedVoices.length > 0 ? selectBestSpanishVoice(_cachedVoices) : null);
  if (!bestVoice) console.warn('[Voz TV] no se encontró voz española, usando fallback');

  const segments = texto.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [texto];

  const speakSegment = (index: number) => {
    if (index >= segments.length) return;
    const seg = segments[index].trim();
    if (!seg) { speakSegment(index + 1); return; }

    const wordCount = seg.split(/\s+/).length;
    let rate = 1.05;
    if (wordCount > 15) rate = 1.1;
    else if (wordCount > 8) rate = 1.05;
    else rate = 1.0;

    const utterance = new SpeechSynthesisUtterance(seg);
    if (bestVoice) {
      utterance.voice = bestVoice;
      utterance.lang = bestVoice.lang;
    } else {
      utterance.lang = 'es-MX';
    }
    utterance.rate = rate;
    utterance.volume = 1;
    utterance.onend = () => speakSegment(index + 1);
    utterance.onerror = (e) => { console.warn('[Voz TV] error en segmento:', e.error); speakSegment(index + 1); };

    _utteranceRefs.push(utterance);
    window.speechSynthesis.speak(utterance);
  };

  speakSegment(0);
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
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(-1);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetBanner, setResetBanner] = useState('');
const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [resetCutoff, setResetCutoff] = useState<number | null>(null);
  const resetCutoffRef = useRef<number | null>(null);
  useEffect(() => { resetCutoffRef.current = resetCutoff; }, [resetCutoff]);

  const audioEnabledRef = useRef(isAudioEnabled);
  const isFirstLoadLlamado = useRef(true);
  const isFirstLoadEspera = useRef(true);
  useEffect(() => { audioEnabledRef.current = isAudioEnabled; }, [isAudioEnabled]);
  useEffect(() => {
    selectedVoiceRef.current = (selectedVoiceIndex >= 0 && selectedVoiceIndex < availableVoices.length) ? availableVoices[selectedVoiceIndex] : null;
  }, [selectedVoiceIndex, availableVoices]);

  // ── Fullscreen (kiosko) ──────────────────────────────────────────────────
  const [fsSupported, setFsSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    setFsSupported(!!document.documentElement.requestFullscreen);
    const tryFS = () => {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    };
    tryFS();
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  // Lookup user name when currentCall changes
  useEffect(() => {
    if (currentCall?.rut_usuario) {
      getDoc(doc(db, 'usuarios', currentCall.rut_usuario)).then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setCurrentUserName(d.nombre_completo || '');
        } else setCurrentUserName('');
      }).catch(() => setCurrentUserName(''));
    } else setCurrentUserName('');
  }, [currentCall?.id, currentCall?.rut_usuario]);

  // Apply CSS variables directly to root element (most reliable approach)
  useEffect(() => {
    const root = document.documentElement;
    const vars = isDark ? {
      '--tv-text-primary': '#f8fafc',
      '--tv-text-secondary': 'rgba(255,255,255,0.7)',
      '--tv-text-muted': 'rgba(255,255,255,0.4)',
      '--tv-text-dim': 'rgba(255,255,255,0.05)',
      '--tv-bg-deepest': '#020617',
      '--tv-bg-dark': '#0f172a',
      '--tv-bg-medium': '#1e293b',
      '--tv-glass-bg-strong': 'rgba(15,23,42,0.5)',
      '--tv-glass-bg': 'rgba(15,23,42,0.6)',
      '--tv-header-bg': 'rgba(2,6,23,0.85)',
      '--tv-history-title-bg': '#1e293b',
      '--tv-border': 'rgba(255,255,255,0.05)',
      '--tv-border-strong': 'rgba(255,255,255,0.08)',
      '--tv-footer-bg': '#0f172a',
    } : {
      '--tv-text-primary': '#0f172a',
      '--tv-text-secondary': '#334155',
      '--tv-text-muted': '#64748b',
      '--tv-text-dim': '#94a3b8',
      '--tv-bg-deepest': '#f1f5f9',
      '--tv-bg-dark': '#ffffff',
      '--tv-bg-medium': '#e2e8f0',
      '--tv-glass-bg-strong': 'rgba(255,255,255,0.7)',
      '--tv-glass-bg': 'rgba(255,255,255,0.8)',
      '--tv-header-bg': 'rgba(255,255,255,0.9)',
      '--tv-history-title-bg': '#e2e8f0',
      '--tv-border': 'rgba(0,0,0,0.12)',
      '--tv-border-strong': 'rgba(0,0,0,0.2)',
      '--tv-footer-bg': '#e2e8f0',
    };
    Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val));
  }, [isDark]);

  useEffect(() => {
    console.log('[TV] theme:', theme, '| resolvedTheme:', resolvedTheme, '| isDark:', isDark);
    console.log('[TV] TV text-primary (computed):', getComputedStyle(document.documentElement).getPropertyValue('--tv-text-primary').trim());
    ensureVoicesLoaded().then((v) => {
      const sp = selectBestSpanishVoice(v);
      const spanishVoices = sortSpanishVoices(v.filter(v => v.lang.startsWith('es') && !v.lang.startsWith('es-US')));
      setAvailableVoices(spanishVoices);
      setSelectedVoiceIndex(-1);
      console.log('[Voz TV] voces cargadas:', v.length, '| español:', spanishVoices.length, '| mejor voz:', sp?.name || 'ninguna');
    });
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


  useEffect(() => {
    const fetchConfig = async () => {
      if (!institutionId) return;
      try {
        const instSnap = await getDoc(doc(db, 'institutions', institutionId));
        if (instSnap.exists()) {
          const data = instSnap.data();
          const cfg = data.config || {};
          if (cfg.mensaje_dia) setMensajeDia(cfg.mensaje_dia);
          if (cfg.tv_name) setTvName(cfg.tv_name);
          if (cfg.logo_url) setLogoUrl(cfg.logo_url);
          if (cfg.tv_primary_color) setTvPrimaryColor(cfg.tv_primary_color);
          if (cfg.tv_background_url) setTvBackgroundUrl(cfg.tv_background_url);
          if (data.ultimo_reinicio) setResetCutoff(new Date(data.ultimo_reinicio).getTime());
        }
      } catch (e) {}
    };
    if (institutionId) fetchConfig();

    const turnosRef = collection(db, 'turnos');
    const q = institutionId
      ? query(turnosRef, where('institution_id', '==', institutionId))
      : query(turnosRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cutoff = resetCutoffRef.current;
      const allTurnos: Turno[] = [];
      snapshot.forEach(doc => {
        const t = { id: doc.id, ...doc.data() } as Turno;
        const created = t.created_at ? new Date(t.created_at).getTime() : 0;
        if (!cutoff || created >= cutoff) allTurnos.push(t);
      });

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
            const ticket = t.letra_ticket ? `letra ${t.letra_ticket}, ` : '';
            const modulo = t.letra_especialista ? ` al módulo ${t.letra_especialista}` : '';
            const textToSpeak = `Atención. Siguiente turno, ${ticket}número ${t.numero}. Diríjase${modulo}.`;
            if (audioEnabledRef.current) {
              const ding = new Audio('/ding.mp3');
              ding.play().catch(() => {});
              setTimeout(() => speakText(textToSpeak, audioEnabledRef.current, selectedVoiceRef.current), 600);
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
      const cutoff = resetCutoffRef.current;
      const ingresos = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Turno))
        .filter(t => {
          const created = t.created_at ? new Date(t.created_at).getTime() : 0;
          return !cutoff || created >= cutoff;
        });
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

  const handleResetTV = async () => {
    if (!institutionId) {
      alert('No hay institución seleccionada para reiniciar.');
      return;
    }
    if (!window.confirm('¿Reiniciar el conteo a cero y limpiar los datos de la pantalla? Esta acción no se puede deshacer.')) return;

    setResetting(true);
    const actor = auth.currentUser?.displayName || auth.currentUser?.email || 'Pantalla TV';
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId, nombre: actor }),
      });
      const data = await res.json();
      if (data.success) {
        setTurnos([]);
        setNuevosIngresos([]);
        setCurrentCall(null);
        setCurrentUserName('');
        setResetCutoff(Date.now());
        setResetBanner('Conteo reiniciado a 0');
        window.speechSynthesis?.cancel();
        setTimeout(() => setResetBanner(''), 5000);
      } else {
        alert('Error al reiniciar el conteo: ' + (data.error || 'Desconocido'));
      }
    } catch (e) {
      console.error(e);
      alert('Error al conectar con el servidor para reiniciar el conteo.');
    } finally {
      setResetting(false);
    }
  };

  if (showInitOverlay) {
    return (
      <main className={styles.overlay}>
        <div className={styles.initCard}>
          <h1>Pantalla de Sala de Espera</h1>
          <p>Active las notificaciones de voz para comenzar a recibir los avisos de turnos llamados a los módulos de atención.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <button className={styles.startBtn} onClick={startAudio}>
              <Play size={22} />
              Iniciar Pantalla
            </button>
            <button className={styles.startBtn} style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', background: 'linear-gradient(135deg, #64748b, #475569)' }} onClick={() => {
              const voice = (selectedVoiceIndex >= 0 && selectedVoiceIndex < availableVoices.length) ? availableVoices[selectedVoiceIndex] : null;
              speakText('Prueba de voz. Uno, dos, tres. Audio funcionando.', true, voice);
            }}>
              Probar Voz
            </button>
            {availableVoices.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center', marginTop: '0.25rem' }}>
                <select
                  value={selectedVoiceIndex}
                  onChange={e => setSelectedVoiceIndex(parseInt(e.target.value))}
                  style={{ padding: '0.5rem 1rem', borderRadius: '10px', border: '1px solid var(--tv-border-strong)', background: 'var(--tv-bg-medium)', color: 'var(--tv-text-primary)', fontSize: '0.85rem', maxWidth: '350px', cursor: 'pointer' }}
                >
                  <option value={-1}>Auto · Recomendada</option>
                  {availableVoices.map((v, i) => (
                    <option key={i} value={i}>{voiceLabel(v)}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--tv-text-muted)' }}>Selecciona la voz para la TV (latinas primero)</span>
                {!availableVoices.some(isLatamVoice) && (
                  <span style={{ fontSize: '0.8rem', color: '#f59e0b', maxWidth: '340px', textAlign: 'center' }}>
                    ⚠️ Tu navegador no tiene voces latinas. Abre esta página en <strong>Microsoft Edge</strong> para escuchar voces de Chile/México (Raul, Jorge, Catalina…).
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: '1rem', color: 'var(--tv-text-muted)', marginTop: '0.5rem', fontFamily: 'monospace' }}>
              {theme} | {resolvedTheme} | {isDark ? '🌙' : '☀️'}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const themeForced = isDark ? 'dark' : 'light';
  const forcedColors = isDark
    ? { text: '#f8fafc', textSec: 'rgba(255,255,255,0.7)', bg: '#0f172a', cardBg: 'rgba(15,23,42,0.6)', titleBg: '#1e293b', border: 'rgba(255,255,255,0.05)', footer: '#0f172a' }
    : { text: '#0f172a', textSec: '#334155', bg: '#f1f5f9', cardBg: 'rgba(255,255,255,0.8)', titleBg: '#e2e8f0', border: 'rgba(0,0,0,0.12)', footer: '#e2e8f0' };

  const customStyles = {
    '--tv-primary': tvPrimaryColor || '#3b82f6',
    '--tv-bg-image': tvBackgroundUrl ? `url("${tvBackgroundUrl}")` : 'none',
  } as React.CSSProperties;

  return (
    <main className={styles.container} style={customStyles} data-tv-theme={themeForced}>
      <style>{`
        main[data-tv-theme="light"] .${styles.historyTurno} { color: #0f172a !important }
        main[data-tv-theme="light"] .${styles.historyTitle} { color: #334155 !important; background: #e2e8f0 !important }
        main[data-tv-theme="light"] .${styles.historyItem} { background: rgba(255,255,255,0.8) !important; border-color: rgba(0,0,0,0.12) !important }
        main[data-tv-theme="light"] .${styles.historySection} { background: rgba(255,255,255,0.7) !important; border-color: rgba(0,0,0,0.12) !important }
        main[data-tv-theme="light"] .${styles.ingresosBar} { background: rgba(255,255,255,0.8) !important; border-color: rgba(0,0,0,0.12) !important }
        main[data-tv-theme="light"] .${styles.ingresoItem} { background: color-mix(in srgb, var(--tv-primary, #3b82f6) 12%, #ffffff) !important; border: 3px solid color-mix(in srgb, var(--tv-primary, #3b82f6) 55%, #ffffff) !important; color: #0f172a !important; box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important }
        main[data-tv-theme="light"] .${styles.ingresoRut} { color: #334155 !important }
        main[data-tv-theme="light"] .${styles.ingresosLabel} { color: #475569 !important }
        main[data-tv-theme="light"] .${styles.container} { background: #f1f5f9 !important }
        main[data-tv-theme="light"] .${styles.header} { background: rgba(255,255,255,0.9) !important; border-color: rgba(0,0,0,0.12) !important }
        main[data-tv-theme="light"] .${styles.footerTicker} { background: #e2e8f0 !important }
        main[data-tv-theme="light"] .${styles.callPatient} { color: #0f172a !important; background: rgba(255,255,255,0.9) !important; -webkit-text-fill-color: unset !important; -webkit-background-clip: unset !important; background-clip: unset !important; }
        main[data-tv-theme="light"] .${styles.callStaff} { color: #334155 !important }
        main[data-tv-theme="light"] .${styles.historyModulo} { color: #3b82f6 !important }
        main[data-tv-theme="dark"] .${styles.historyTurno} { color: #f8fafc !important }
        main[data-tv-theme="dark"] .${styles.historyTitle} { color: rgba(255,255,255,0.7) !important; background: #1e293b !important }
        main[data-tv-theme="dark"] .${styles.historyItem} { background: rgba(15,23,42,0.6) !important; border-color: rgba(255,255,255,0.05) !important }
        main[data-tv-theme="dark"] .${styles.historySection} { background: rgba(15,23,42,0.5) !important; border-color: rgba(255,255,255,0.05) !important }
        main[data-tv-theme="dark"] .${styles.header} { background: rgba(2,6,23,0.85) !important; border-color: rgba(255,255,255,0.05) !important }
        main[data-tv-theme="dark"] .${styles.footerTicker} { background: #0f172a !important }
      `}</style>
      <header className={styles.header}>
        <div className={styles.logo} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {logoUrl ? <img src={logoUrl} alt="Logo Institución" className={styles.tvLogoImg} /> : null}
          {tvName}
        </div>
        <div className={styles.headerCenter}>
          {clock && <span>{clock}</span>}
        </div>
        <div className={styles.headerActions}>
          {availableVoices.length > 0 && (
            <div className={styles.voiceSelectorWrap}>
              <select
                value={selectedVoiceIndex}
                onChange={e => setSelectedVoiceIndex(parseInt(e.target.value))}
                className={styles.voiceSelect}
                title={availableVoices.some(isLatamVoice) ? 'Cambiar voz' : 'Sin voces latinas en este navegador. Abre en Microsoft Edge para voces de Chile/México.'}
              >
                <option value={-1}>Auto · Recomendada</option>
                {availableVoices.map((v, i) => (
                  <option key={i} value={i}>{voiceLabel(v)}</option>
                ))}
              </select>
              <button
                className={styles.voicePreviewBtn}
                onClick={() => {
                  const voice = (selectedVoiceIndex >= 0 && selectedVoiceIndex < availableVoices.length) ? availableVoices[selectedVoiceIndex] : null;
                  speakText('Hola, soy la voz de la pantalla de atención.', true, voice);
                }}
                title="Probar voz seleccionada"
              >
                <Mic size={22} />
              </button>
            </div>
          )}
          <button
            className={styles.audioToggle}
            data-active={isAudioEnabled}
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            title={isAudioEnabled ? 'Desactivar Audio' : 'Activar Audio'}
          >
            {isAudioEnabled ? <Volume2 size={26} /> : <VolumeX size={26} />}
          </button>
          <button
            className={styles.themeToggle}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title={isDark ? 'Modo Claro' : 'Modo Oscuro'}
          >
            {isDark ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          <button
            className={styles.resetBtn}
            onClick={handleResetTV}
            disabled={resetting}
            title="Reiniciar conteo a cero y limpiar pantalla"
          >
            <RotateCcw size={20} />
            {resetting ? 'Reiniciando...' : 'Reiniciar'}
          </button>
          {fsSupported && !isFullscreen && (
            <button
              className={styles.themeToggle}
              onClick={() => document.documentElement.requestFullscreen()?.then(() => setIsFullscreen(true)).catch(() => {})}
              title="Pantalla Completa"
              style={{ borderColor: 'var(--tv-primary, #3b82f6)', color: 'var(--tv-primary, #3b82f6)' }}
            >
              <Maximize2 size={22} />
            </button>
          )}
        </div>
      </header>

      {resetBanner && (
        <div className={styles.resetBanner}>
          <CheckCircle2 size={18} />
          {resetBanner}
        </div>
      )}

      <div className={styles.mainContent}>
        <section className={styles.callSection}>
          <div className={styles.currentCallCard} key={currentCall?.id || 'empty'}>
            <span className={styles.callLabel}>Atendiendo a</span>
            {currentCall ? (
              <>
                <div className={styles.callPatient}>
                  {currentCall.nombre_paciente || currentUserName || currentCall.rut_usuario || `Turno ${currentCall.letra_ticket ? currentCall.letra_ticket.charAt(0).toUpperCase() + '-' : ''}${currentCall.numero}`}
                </div>
                {(currentCall.departamento || currentCall.letra_especialista) && (
                  <div className={styles.callModule}>
                    Diríjase{' '}
                    {currentCall.letra_especialista ? (
                      <>al Módulo <span className={styles.callModuleHighlight}>{currentCall.letra_especialista}</span></>
                    ) : (
                      <>al Módulo <span className={styles.callModuleHighlight}>{currentCall.departamento}</span></>
                    )}
                    {currentCall.departamento && currentCall.letra_especialista && (
                      <> — <span className={styles.callDeptName}>{currentCall.departamento}</span></>
                    )}
                    {currentCall.departamento && !currentCall.letra_especialista && (
                      <></>
                    )}
                  </div>
                )}
                <div className={styles.callTurnoSmall}>
                  Su turno es {currentCall.letra_ticket ? `${currentCall.letra_ticket.charAt(0).toUpperCase()}-` : ''}{currentCall.numero}
                </div>
                {currentCall.nombre_funcionario && (
                  <div className={styles.callStaff}>
                    Atendido por {currentCall.nombre_funcionario}
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
                nuevosIngresos.map(ing => {
                  const ingTicketLetter = ing.letra_ticket ? ing.letra_ticket.charAt(0).toUpperCase() : '';
                  return (
                    <div key={ing.id} className={styles.ingresoItem}>
                      <span>{ingTicketLetter ? `${ingTicketLetter}-` : ''}{ing.numero}</span>
                      <span className={styles.ingresoRut}>{ing.nombre_paciente || ing.rut_usuario || ''}</span>
                    </div>
                  );
                })
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
                <span className={styles.historyPatient}>
                  {turno.nombre_paciente || turno.rut_usuario || '—'}
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
        <div className={styles.tickerTrack}>
          <span className={styles.tickerText}>{mensajeDia}</span>
        </div>
      </footer>
    </main>
  );
}

export default function TVPage() {
  return (
    <Suspense fallback={<main className={styles.overlay}><div className={styles.initCard}><div style={{width:'200px',height:'20px',background:'var(--skeleton-base)',borderRadius:'8px',animation:'skeletonPulse 1.5s ease-in-out infinite',margin:'0 auto'}} /></div></main>}>
      <TVInner />
    </Suspense>
  );
}
