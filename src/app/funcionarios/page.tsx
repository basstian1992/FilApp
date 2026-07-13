'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/client';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, limit, onSnapshot, getDoc, runTransaction, setDoc } from 'firebase/firestore';

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

function formatRutUI(raw: string) {
  if (raw.length <= 1) return raw;
  const body = raw.slice(0, -1);
  const dv = raw.slice(-1);
  return `${body}-${dv}`;
}
import { triggerWebhook } from '@/lib/notify';
import styles from './funcionarios.module.css';
import { LogOut, User, CheckCircle, SkipForward, Megaphone, Download, BellRing, Users, MonitorPlay } from 'lucide-react';
import UserForm from '@/components/UserForm';
import UserDirectory from '@/components/UserDirectory';
import { useToast } from '@/components/Toast';
import { SkeletonScreen } from '@/components/Skeleton';
import { useSoundManager } from '@/hooks/useSoundManager';

const whatsappCooldowns = new Map<string, number>();
const whatsappPending = new Set<string>();
const WHATSAPP_COOLDOWN_MS = 35000;

interface Funcionario {
  id: string;
  user_id: string;
  institution_id: string;
  role: string;
  nombre: string;
  departamento: string;
  cargo?: string;
  estado_funcionario?: string;
  avatar_url?: string;
  letra_atencion: string;
  whatsapp_phone?: string;
  whatsapp_apikey?: string;
  email?: string;
}

interface Turno {
  id: string;
  numero: number;
  letra_ticket?: string;
  rut_usuario: string;
  estado: string;
  departamento_solicitado?: string;
  priority_level?: number;
  is_appointment?: boolean;
  priority?: boolean;
}

interface Notification {
  id: string;
  message: string;
  turno: string;
}

export default function StaffPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { playDing } = useSoundManager();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isEditingLetra, setIsEditingLetra] = useState(false);
  const [newLetra, setNewLetra] = useState('');
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [departamentosDisponibles, setDepartamentosDisponibles] = useState<string[]>(['DIDECO', 'OMIL', 'PRODESAL', 'P.M. Jefas de Hogar', 'Turismo', 'OTEC', 'Fomento', 'Otro']);

  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [currentTurno, setCurrentTurno] = useState<Turno | null>(null);
  const [queueDocs, setQueueDocs] = useState<any[]>([]);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<'atencion' | 'directorio'>('atencion');
  const [isUserProfileComplete, setIsUserProfileComplete] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [resetLogs, setResetLogs] = useState<any[]>([]);
  const [instLogo, setInstLogo] = useState('');
  const [instName, setInstName] = useState('');

  // WhatsApp states
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testError, setTestError] = useState('');

  // Manual Turno State
  const [manualRut, setManualRut] = useState('');

  const funcionarioRef = useRef<Funcionario | null>(null);
  const isFirstEspera = useRef(true);
  const isFirstLoad = useRef(true);
  const socketRef = useRef<any>(null);
  // onSnapshot unsubscribe handles (to avoid memory leaks)
  const unsubProfileRef = useRef<(() => void) | null>(null);
  const unsubQueueRef   = useRef<(() => void) | null>(null);
  const unsubActivoRef  = useRef<(() => void) | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    funcionarioRef.current = funcionario;
  }, [funcionario]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/');
        return;
      }
      setSession(user);
      fetchFuncionarioData(user.uid);
    });
    return () => {
      unsubAuth();
      unsubProfileRef.current?.();
      unsubQueueRef.current?.();
      unsubActivoRef.current?.();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (funcionario?.institution_id) {
      const unsub = onSnapshot(doc(db, 'institutions', funcionario.institution_id), (docSnap: any) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setResetLogs(data.reset_logs || []);
          const cfg = data.config || {};
          setInstLogo(cfg.logo_url || '');
          setInstName(data.name || 'FilApp');
        }
      });
      return () => unsub();
    }
  }, [funcionario?.institution_id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditingLetra(false);
        setIsEditingAvatar(false);
      }
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        llamarSiguiente();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const connectSocket = (institutionId: string, funcionarioUserId: string) => {
    const initSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        const socket = io(window.location.origin);
        socketRef.current = socket;

        socket.emit('join-institution', institutionId);
        socket.emit('join-funcionario', funcionarioUserId);

        socket.on('new-appointment', (ticket: any) => {
          setNotifications(prev => [{
            id: `${Date.now()}`,
            message: `Nuevo paciente con cita: ${ticket.letra_ticket || ''}-${ticket.numero} para ${ticket.departamento || 'su módulo'}`,
            turno: `${ticket.letra_ticket || ''}-${ticket.numero}`,
          }, ...prev].slice(0, 5));

          setTimeout(() => {
            setNotifications(prev => prev.slice(1));
          }, 8000);
        });
      } catch (e) {
        console.log('Socket.io no disponible, usando Firestore en tiempo real');
      }
    };
    initSocket();
  };

  const fetchFuncionarioData = async (userId: string) => {
    try {
      // Clean up any previous listeners before setting up new ones
      unsubQueueRef.current?.();
      unsubActivoRef.current?.();

      const q = query(collection(db, 'especialistas'), where('user_id', '==', userId));
      unsubProfileRef.current = onSnapshot(q, async (querySnapshot) => {
        if (!querySnapshot.empty) {
          const specDoc = querySnapshot.docs[0];
          const specData = { id: specDoc.id, ...specDoc.data() } as Funcionario;

          if (specData.role && specData.role !== 'funcionario') {
            router.replace('/admin');
            return;
          }

          if ((specData as any).estado_funcionario === 'pendiente') {
            router.replace('/');
            return;
          }

          setFuncionario(specData);
          funcionarioRef.current = specData;
          setWhatsappPhone(specData.whatsapp_phone || '');
          setWhatsappApiKey(specData.whatsapp_apikey || '');

          if (isFirstLoad.current) {
            isFirstLoad.current = false;
            await updateDoc(doc(db, 'especialistas', specData.id), { estado_funcionario: 'activo' });
            refreshQueue(specData.id, specData.institution_id);
            if (specData.institution_id && specData.user_id) {
              connectSocket(specData.institution_id, specData.user_id);
            }
          }
          setLoading(false);
        } else {
          await signOut(auth);
          router.replace('/');
        }
      });
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const sendWa = (phone: string, key: string, msg: string) => {
    if (whatsappPending.has(phone)) return;
    const lastSent = whatsappCooldowns.get(phone) || 0;
    if (Date.now() - lastSent <= WHATSAPP_COOLDOWN_MS) return;
    whatsappPending.add(phone);
    whatsappCooldowns.set(phone, Date.now());
    fetch('/api/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message: msg, apikey: key.trim() })
    }).then(r => r.json()).then(d => {
      whatsappPending.delete(phone);
      if (!d.success && !d.error?.includes('Too many requests')) {
        console.error('WhatsApp error:', d.error);
        toast('Error WhatsApp: ' + (d.error || 'desconocido'), 'error');
      } else console.log('WhatsApp enviado a:', phone, 'respuesta:', d);
    }).catch(err => {
      whatsappPending.delete(phone);
      console.error('Error al enviar WhatsApp:', err);
      toast('Error al enviar WhatsApp: ' + err.message, 'error');
    });
  };

  const sendWaNotification = (phone: string, key: string, ticketStr: string, deptoStr: string, queueCount: number, isAppointment?: boolean) => {
    if (!phone || !key) return;
    const priorityTag = isAppointment ? '🔔 *ALTA PRIORIDAD* ' : '';
    const msg = `${priorityTag}🔔 *FilApp - Nuevo Turno*\nSe ha solicitado un nuevo turno en tu módulo de *${deptoStr}*.\n🎫 *Turno:* ${ticketStr}\n👥 *Personas en cola:* ${queueCount}\nIngresa al panel para atender.`;
    sendWa(phone, key, msg);
  };

  const refreshQueue = async (specId: string, institutionId: string) => {
    // Clean up previous listeners before setting up new ones
    unsubQueueRef.current?.();
    unsubActivoRef.current?.();

    const qEspera = query(
      collection(db, 'turnos'),
      where('estado', '==', 'espera'),
      where('institution_id', '==', institutionId)
    );

    const handleEsperaSnap = (snap: any) => {
      const currentFunc = funcionarioRef.current;
      const allDocs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as any));

      const filtered = currentFunc
        ? allDocs.filter((d: any) => d.departamento_solicitado === currentFunc.departamento)
        : allDocs;

      filtered.sort((a: any, b: any) => {
        const pa = a.priority_level ?? (a.priority ? 2 : 0);
        const pb = b.priority_level ?? (b.priority ? 2 : 0);
        if (pb !== pa) return pb - pa;
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeA - timeB;
      });

      const waPhone = currentFunc?.whatsapp_phone || whatsappPhone;
      const waKey = currentFunc?.whatsapp_apikey || whatsappApiKey;

      if (!isFirstEspera.current) {
        snap.docChanges().forEach((change: any) => {
          if (change.type === 'added') {
            const newTurno = change.doc.data();
            if (currentFunc && currentFunc.departamento === newTurno.departamento_solicitado) {
              const queueCount = filtered.length;
              const ticketStr = `${newTurno.letra_ticket || 'T'}-${newTurno.numero}`;
              const deptoStr = newTurno.departamento_solicitado || currentFunc.departamento;
              const isAppt = newTurno.is_appointment || newTurno.priority;

              playDing();
              toast(`${isAppt ? '📅 ' : ''}Nuevo turno ${ticketStr} para ${deptoStr}${isAppt ? ' (Hora Agendada)' : ''}`);

              sendWaNotification(waPhone, waKey, ticketStr, deptoStr, queueCount, isAppt);
            }
          }
        });

        // Re-notify for turnos waiting >10 minutes
        if (waPhone && waKey && currentFunc) {
          const now = Date.now();
          filtered.forEach((t: any) => {
            const created = new Date(t.created_at || 0).getTime();
            if (created > 0 && now - created > 600000) { // >10 min
              const oldTicket = `${t.letra_ticket || 'T'}-${t.numero}`;
              const lastSent = whatsappCooldowns.get(waPhone) || 0;
              if (now - lastSent > WHATSAPP_COOLDOWN_MS) {
                const msg = `⏰ *FilApp - Recordatorio*\nEl turno *${oldTicket}* lleva más de 10 minutos esperando en *${currentFunc.departamento}*.\n👥 *Personas en cola:* ${filtered.length}\nPor favor, revisa el panel para atender.`;
                sendWa(waPhone, waKey, msg);
              }
            }
          });
        }
      }
      isFirstEspera.current = false;

      setQueueDocs(filtered);
    };

    const handleEsperaError = (err: any) => {
      console.error('Error en listener de turnos (posible índice faltante):', err);
      toast('Error en actualización en tiempo real. Usando modo de respaldo.', 'warning');
    };

    // Primary real-time listener
    unsubQueueRef.current = onSnapshot(qEspera, handleEsperaSnap, handleEsperaError);

    // Fallback polling every 8 seconds in case onSnapshot fails silently
    const pollInterval = setInterval(async () => {
      try {
        const snap = await getDocs(qEspera);
        const currentFunc = funcionarioRef.current;
        const allDocs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as any));
        const filtered = currentFunc
          ? allDocs.filter((d: any) => d.departamento_solicitado === currentFunc.departamento)
          : allDocs;
        filtered.sort((a: any, b: any) => {
          const pa = a.priority_level ?? (a.priority ? 2 : 0);
          const pb = b.priority_level ?? (b.priority ? 2 : 0);
          if (pb !== pa) return pb - pa;
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeA - timeB;
        });
        setQueueDocs(prev => {
          // Only update if content actually changed
          if (prev.length !== filtered.length) return filtered;
          for (let i = 0; i < prev.length; i++) {
            if (prev[i].id !== filtered[i]?.id) return filtered;
          }
          return prev;
        });
      } catch (e) { /* polling fallback error, ignore */ }
    }, 8000);

    pollIntervalRef.current = pollInterval;

    const qActivo = query(collection(db, 'turnos'), where('especialista_id', '==', specId));
    unsubActivoRef.current = onSnapshot(qActivo, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Turno));
      const activo = docs.find(d => d.estado === 'llamado');

      if (activo) {
        setCurrentTurno(activo);

        if (activo.rut_usuario) {
          const histQ = query(
            collection(db, 'turnos'),
            where('rut_usuario', '==', activo.rut_usuario),
            where('estado', '==', 'atendido'),
            orderBy('finished_at', 'desc'),
            limit(5)
          );
          const histSnap = await getDocs(histQ);
          setUserHistory(histSnap.docs.map(d => ({id: d.id, ...d.data()})));
        }
      } else {
        setCurrentTurno(null);
        setUserHistory([]);
        setIsUserProfileComplete(false);
      }
    });
  };

  // Look up patient name when currentTurno changes
  useEffect(() => {
    if (currentTurno?.rut_usuario) {
      getDoc(doc(db, 'usuarios', currentTurno.rut_usuario)).then(snap => {
        if (snap.exists()) {
          setPatientName(snap.data().nombre_completo || '');
        } else setPatientName('');
      }).catch(() => setPatientName(''));
    } else setPatientName('');
  }, [currentTurno?.id, currentTurno?.rut_usuario]);

  // Login is now handled only from the landing page (/)

  const handleLogout = async () => {
    if (funcionario) {
      try {
        await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'inactivo' });
      } catch (e) {}
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    // Clean up all Firestore listeners
    unsubProfileRef.current?.();
    unsubQueueRef.current?.();
    unsubActivoRef.current?.();
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    await signOut(auth);
  };

  const handleUpdateLetra = async () => {
    if (!funcionario || !newLetra.trim()) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), { letra_atencion: newLetra.trim() });
      setFuncionario({ ...funcionario, letra_atencion: newLetra.trim() });
      setIsEditingLetra(false);
    } catch (e) {
      console.error(e);
      toast('Error al actualizar módulo', 'error');
    }
    setLoading(false);
  };

  const handleUpdateAvatar = async () => {
    if (!funcionario) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), { avatar_url: newAvatarUrl.trim() });
      setFuncionario({ ...funcionario, avatar_url: newAvatarUrl.trim() });
      setIsEditingAvatar(false);
    } catch (e) {
      console.error(e);
      toast('Error al actualizar avatar', 'error');
    }
    setLoading(false);
  };

  const handleLinkWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funcionario || !whatsappPhone.trim() || !whatsappApiKey.trim()) return;

    setIsSavingWhatsapp(true);
    setTestSent(false);
    setTestError('');

    const cleanPhone = whatsappPhone.trim();
    const cleanKey = whatsappApiKey.trim();

    const testMsg = `📲 *¡FilApp Conectado!*\nHola *${funcionario.nombre}*, tu WhatsApp se ha vinculado correctamente a FilApp.\nRecibirás una notificación en este chat cada vez que ingresen turnos en espera para *${funcionario.departamento}*.\n_Este servicio estará activo mientras mantengas tu panel abierto._`;

    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          message: testMsg,
          apikey: cleanKey
        })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Error al enviar mensaje de prueba');

      await updateDoc(doc(db, 'especialistas', funcionario.id), {
        whatsapp_phone: cleanPhone,
        whatsapp_apikey: cleanKey
      });

      setFuncionario({
        ...funcionario,
        whatsapp_phone: cleanPhone,
        whatsapp_apikey: cleanKey
      });

      setTestSent(true);
    } catch (err: any) {
      console.error('Error al vincular WhatsApp:', err);
      setTestError(err.message || 'No se pudo conectar. Por favor verifica tus credenciales.');
    } finally {
      setIsSavingWhatsapp(false);
    }
  };

  const handleUnlinkWhatsapp = async () => {
    if (!funcionario) return;

    setIsSavingWhatsapp(true);
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), {
        whatsapp_phone: '',
        whatsapp_apikey: ''
      });

      setFuncionario({
        ...funcionario,
        whatsapp_phone: '',
        whatsapp_apikey: ''
      });

      setWhatsappPhone('');
      setWhatsappApiKey('');
      setTestSent(false);
      setTestError('');
    } catch (err) {
      console.error('Error al desvincular WhatsApp:', err);
      toast('Error al desvincular.', 'error');
    } finally {
      setIsSavingWhatsapp(false);
    }
  };

  const handleManualTicket = async () => {
    if (!manualRut || !funcionario) return;
    const formattedRut = formatRutUI(manualRut);
    if (!validateRUT(formattedRut)) {
      toast("RUT Inválido.", 'warning');
      return;
    }
    if (currentTurno) {
      toast("Finaliza la atención actual primero.", 'warning');
      return;
    }
    setLoading(true);

    try {
      const instId = funcionario.institution_id;
      const userRef = doc(db, 'usuarios', formattedRut);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, { rut: formattedRut, institution_id: instId, created_at: new Date().toISOString() });
      }

      const instRef = doc(db, 'institutions', instId);
      const turnoRef = doc(collection(db, 'turnos'));

      const result = await runTransaction(db, async (transaction) => {
        const instDoc = await transaction.get(instRef);
        const santiagoNowStr = new Date().toLocaleString("en-US", {timeZone: "America/Santiago"});
        const nowSCL = new Date(santiagoNowStr);
        const resetTimeSCL = new Date(nowSCL.getFullYear(), nowSCL.getMonth(), nowSCL.getDate(), 7, 0, 0, 0);

        let currentNumero = instDoc.data()?.currentTurno || 0;
        let lastReset = instDoc.data()?.ultimo_reinicio || null;
        let shouldReset = false;

        if (nowSCL >= resetTimeSCL) {
          if (!lastReset) shouldReset = true;
          else {
            const lastResetSCL = new Date(new Date(lastReset).toLocaleString("en-US", {timeZone: "America/Santiago"}));
            if (lastResetSCL < resetTimeSCL) shouldReset = true;
          }
        } else {
          const yesterdayResetSCL = new Date(resetTimeSCL);
          yesterdayResetSCL.setDate(yesterdayResetSCL.getDate() - 1);
          if (!lastReset) shouldReset = true;
          else {
            const lastResetSCL = new Date(new Date(lastReset).toLocaleString("en-US", {timeZone: "America/Santiago"}));
            if (lastResetSCL < yesterdayResetSCL) shouldReset = true;
          }
        }

        if (shouldReset) {
          currentNumero = 0;
          lastReset = new Date().toISOString();
        }

        const newNumero = currentNumero + 1;
        transaction.update(instRef, { currentTurno: newNumero, ultimo_reinicio: lastReset });

        const letraTicket = funcionario.letra_atencion || funcionario.departamento.charAt(0).toUpperCase();

        transaction.set(turnoRef, {
          institution_id: instId,
          numero: newNumero,
          letra_ticket: letraTicket,
          departamento_solicitado: funcionario.departamento,
          rut_usuario: formattedRut,
          estado: 'llamado',
          created_at: nowSCL.toISOString(),
          called_at: nowSCL.toISOString(),
          priority: false,
          especialista_id: funcionario.id || '',
          nombre_funcionario: funcionario.nombre || 'Funcionario',
          departamento: funcionario.departamento || '',
          cargo_funcionario: funcionario.cargo || '',
          letra_especialista: letraTicket
        });

        return { newNumero, letraTicket };
      });

      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'atendiendo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'atendiendo' });
      setManualRut('');

      triggerWebhook('llamado', {
        numero: result.newNumero,
        rut_usuario: formattedRut,
        especialista_id: funcionario.id || '',
        nombre_funcionario: funcionario.nombre || 'Funcionario',
        departamento: funcionario.departamento || '',
        letra_especialista: result.letraTicket
      });

    } catch (err) {
      console.error("Error manual:", err);
      toast("Error al generar turno manual.", 'error');
    }
    setLoading(false);
  };

  const llamarSiguiente = async () => {
    if (!funcionario) return;
    setLoading(true);

    if (currentTurno) {
      toast("Debes finalizar el turno actual primero.", 'warning');
      setLoading(false);
      return;
    }

    const qNext = query(
      collection(db, 'turnos'),
      where('estado', '==', 'espera'),
      where('institution_id', '==', funcionario.institution_id)
    );
    const nextSnap = await getDocs(qNext);

    const docsList = nextSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const esperaDocs = docsList.filter(
      d => d.departamento_solicitado === funcionario.departamento
    );

    if (esperaDocs.length === 0) {
      toast("No hay pacientes en espera para " + funcionario.departamento, 'warning');
      setLoading(false);
      return;
    }

    esperaDocs.sort((a, b) => {
      const pa = a.priority_level ?? (a.priority ? 2 : 0);
      const pb = b.priority_level ?? (b.priority ? 2 : 0);
      if (pb !== pa) return pb - pa;
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeA - timeB;
    });

    const nextTurnoDoc = esperaDocs[0];

    try {
      await updateDoc(doc(db, 'turnos', nextTurnoDoc.id), {
          estado: 'llamado',
          especialista_id: funcionario.id || '',
          nombre_funcionario: funcionario.nombre || 'Funcionario',
          departamento: funcionario.departamento || '',
          cargo_funcionario: funcionario.cargo || '',
          letra_especialista: funcionario.letra_atencion || 'A',
          called_at: new Date().toISOString()
      });

      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'atendiendo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'atendiendo' });

      triggerWebhook('llamado', {
          numero: nextTurnoDoc.numero,
          rut_usuario: nextTurnoDoc.rut_usuario,
          especialista_id: funcionario.id || '',
          nombre_funcionario: funcionario.nombre || 'Funcionario',
          departamento: funcionario.departamento || '',
          letra_especialista: funcionario.letra_atencion || 'A'
      });

    } catch (e) {
      console.error("Error al llamar siguiente:", e);
      toast("Hubo un error al llamar al paciente. Revise consola.", 'error');
    }
    setLoading(false);
  };

  const finalizarTurno = async () => {
    if (!currentTurno || !funcionario) return;
    if (!isUserProfileComplete) {
      const confirmMsg = "Los datos obligatorios del paciente no han sido completados o no se ha hecho clic en 'Registrar Usuario'. ¿Estás seguro de que deseas finalizar la atención sin guardarlos?";
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'turnos', currentTurno.id), {
          estado: 'atendido',
          finished_at: new Date().toISOString()
      });

      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'activo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'activo' });

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const saltarTurno = async () => {
    if (!currentTurno || !funcionario) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'turnos', currentTurno.id), { estado: 'saltado' });

      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: 'activo' });
      setFuncionario({ ...funcionario, estado_funcionario: 'activo' });

    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleEstadoFuncionario = async () => {
    if (!funcionario) return;
    const nuevoEstado = funcionario.estado_funcionario === 'activo' ? 'inactivo' : 'activo';
    try {
      await updateDoc(doc(db, 'especialistas', funcionario.id), { estado_funcionario: nuevoEstado });
      setFuncionario({ ...funcionario, estado_funcionario: nuevoEstado });
    } catch (err) {
      console.error(err);
      toast('Error al cambiar estado.', 'error');
    }
  };

  const handleReiniciarConteo = async () => {
    if (!funcionario?.institution_id) return;
    if (!confirm('¿Estás seguro de que deseas reiniciar el conteo diario a cero? Esta acción quedará registrada.')) return;
    
    try {
      const instRef = doc(db, 'institutions', funcionario.institution_id);
      const instSnap = await getDoc(instRef);
      if (instSnap.exists()) {
        const data = instSnap.data();
        const logs = data.reset_logs || [];
        
        const newLog = {
          nombre: funcionario.nombre,
          fecha: new Date().toISOString()
        };
        
        const updatedLogs = [newLog, ...logs].slice(0, 3);
        
        await updateDoc(instRef, {
          currentTurno: 0,
          ultimo_reinicio: new Date().toISOString(),
          reset_logs: updatedLogs
        });
        
        toast("El conteo se ha reiniciado correctamente.");
      }
    } catch (e) {
      console.error(e);
      toast("Error al reiniciar conteo", 'error');
    }
  };

  const exportToCSV = (filename: string, rows: any[]) => {
    if (!rows || !rows.length) {
      toast("No hay datos para exportar", 'warning');
      return;
    }
    const separator = ';';
    const keys = Object.keys(rows[0]);
    const csvContent =
      keys.join(separator) +
      '\n' +
      rows.map(row => {
        return keys.map(k => {
          let cell = row[k] === null || row[k] === undefined ? '' : row[k];
          cell = cell instanceof Date
            ? cell.toLocaleString()
            : cell.toString().replace(/"/g, '""');
          if (cell.search(/("|,|\n)/g) >= 0) {
            cell = `"${cell}"`;
          }
          return cell;
        }).join(separator);
      }).join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportMyHistory = async () => {
    if (!funcionario) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'turnos'),
        where('especialista_id', '==', funcionario.id),
        where('estado', '==', 'atendido'),
        orderBy('finished_at', 'desc')
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => {
        const t = d.data();
        return {
          ID_Turno: d.id,
          Turno_Visual: `${t.letra_ticket ? t.letra_ticket + '-' : ''}${t.numero}`,
          RUT_Usuario: t.rut_usuario || '',
          Prioridad: t.is_appointment ? 'Alta (Cita)' : 'Normal',
          Fecha_Atencion: t.finished_at ? new Date(t.finished_at).toLocaleString() : '',
          Llamado_En: t.called_at ? new Date(t.called_at).toLocaleString() : ''
        };
      });
      exportToCSV(`atenciones_${funcionario.nombre.replace(/\s+/g, '_')}.csv`, data);
    } catch (e) {
      console.error(e);
      toast("Error al exportar", 'error');
    }
    setLoading(false);
  };

  const queueCount = queueDocs.filter(d => d.departamento_solicitado === funcionario?.departamento).length;

  if (loading) {
    return <SkeletonScreen />;
  }

  if (authError) {
    return (
      <div className={styles.centerLoad}>
        <p style={{ color: 'var(--destructive)' }}>{authError}</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.topBar}>
        {/* ── Identity block ─────────────────────────────────────────── */}
        <div className={styles.userInfo}>
          {isEditingAvatar ? (
            <div className={styles.avatarEditRow}>
              <input
                className={styles.editInput}
                value={newAvatarUrl}
                onChange={e => setNewAvatarUrl(e.target.value)}
                placeholder="URL de tu foto..."
                autoFocus
              />
              <button className={styles.saveBtn} onClick={handleUpdateAvatar}>Guardar</button>
              <button className={styles.cancelBtn} onClick={() => setIsEditingAvatar(false)}>✕</button>
            </div>
          ) : (
            <div className={styles.profileCell}>
              <div
                className={styles.avatarWrapper}
                data-status={funcionario?.estado_funcionario || 'inactivo'}
                onClick={() => { setNewAvatarUrl(funcionario?.avatar_url || ''); setIsEditingAvatar(true); }}
                title="Cambiar foto"
              >
                {funcionario?.avatar_url ? (
                  <img src={funcionario.avatar_url} alt="Avatar" className={styles.avatarImg} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {funcionario?.nombre?.substring(0, 2).toUpperCase() || 'FN'}
                  </div>
                )}
              </div>
              <span
                className={styles.statusDot}
                data-status={funcionario?.estado_funcionario || 'inactivo'}
                title={`Estado: ${funcionario?.estado_funcionario || 'inactivo'} (click para alternar)`}
                onClick={toggleEstadoFuncionario}
              />
            </div>
          )}

          <div className={styles.identityText}>
            <span className={styles.greeting}>Buen día,</span>
            <strong className={styles.userName}>{funcionario?.nombre || 'Funcionario'}</strong>
            <div className={styles.instBadge}>
              {instLogo && <img src={instLogo} alt="Logo" className={styles.instLogoSmall} />}
              <span className={styles.instNameSmall}>{instName}</span>
            </div>
            <div className={styles.metaChips}>
              {funcionario?.cargo && <span className={styles.chip}>{funcionario.cargo}</span>}
              {funcionario?.departamento && <span className={styles.chip} data-variant="dept">{funcionario.departamento}</span>}
              {isEditingLetra ? (
                <span className={styles.moduleEditRow}>
                  <input
                    className={styles.editInputSm}
                    value={newLetra}
                    onChange={e => setNewLetra(e.target.value)}
                    placeholder="Módulo"
                    autoFocus
                  />
                  <button className={styles.saveBtn} onClick={handleUpdateLetra}>OK</button>
                  <button className={styles.cancelBtn} onClick={() => setIsEditingLetra(false)}>✕</button>
                </span>
              ) : (
                <button
                  className={styles.chipModule}
                  onClick={() => { setNewLetra(funcionario?.letra_atencion || ''); setIsEditingLetra(true); }}
                  title="Editar módulo"
                >
                  Módulo {funcionario?.letra_atencion || '—'}
                  <span className={styles.chipEditIcon}>✎</span>
                </button>
              )}
            </div>
            <span className={styles.userEmail}>{session?.email}</span>
          </div>
        </div>

        {/* ── Actions block ──────────────────────────────────────────── */}
        <div className={styles.headerActions}>
          <div className={styles.tabGroup}>
            <button
              onClick={() => setActiveTab('atencion')}
              className={activeTab === 'atencion' ? styles.tabBtnActive : styles.tabBtn}
            >
              <Megaphone size={17} /> Atención
            </button>
            <button
              onClick={() => setActiveTab('directorio')}
              className={activeTab === 'directorio' ? styles.tabBtnActive : styles.tabBtn}
            >
              <Users size={17} /> Base de Datos
            </button>
          </div>

          {funcionario?.institution_id && (
            <a
              href={`/tv?institution=${funcionario.institution_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.tvBtn}
              title="Abrir Pantalla TV"
            >
              <MonitorPlay size={17} /> <span className={styles.btnLabel}>TV</span>
            </a>
          )}

          <div className={styles.actionDivider} />

          {notifications.length > 0 && (
            <div className={styles.notificationArea} title={`${notifications.length} notificaciones`}>
              <BellRing size={18} className={styles.notificationBell} />
              <span className={styles.notificationCount}>{notifications.length}</span>
            </div>
          )}
          <button onClick={handleLogout} className={styles.logoutBtn} title="Cerrar sesión">
            <LogOut size={17} /> <span className={styles.btnLabel}>Salir</span>
          </button>
        </div>
      </header>

      {notifications.length > 0 && (
        <div className={styles.notificationBar}>
          {notifications.map(n => (
            <div key={n.id} className={styles.notificationItem}>
              <BellRing size={16} />
              <span>{n.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.mainLayout}>
        {activeTab === 'directorio' ? (
          <div className={styles.directoryWrapper}>
            <UserDirectory institutionId={funcionario?.institution_id || ''} funcionarioId={funcionario?.id || ''} funcionarioName={funcionario?.nombre || ''} />
          </div>
        ) : (
          <>
            <div className={styles.panelLeft}>
              <div className={styles.statCard}>
            <h3>Pacientes en Espera</h3>
            <div className={styles.bigNumber}>{queueCount}</div>
            {queueDocs.length > 0 && (
              <div className={styles.quickQueue}>
                {queueDocs.slice(0, 8).map(t => (
                  <div key={t.id} className={`${styles.queueItem} ${(t.is_appointment || t.priority) ? styles.queueItemPriority : ''}`}>
                    <span className={styles.queueTurno}>{t.letra_ticket || 'T'}-{t.numero}</span>
                    {(t.is_appointment || t.priority) && <span className={styles.queueBadge}>📅</span>}
                  </div>
                ))}
                {queueDocs.length > 8 && <div className={styles.queueMore}>+{queueDocs.length - 8} más</div>}
              </div>
            )}
            <button
              className={`${styles.actionBtn} ${styles.btnCall}`}
              onClick={llamarSiguiente}
              disabled={loading || currentTurno !== null || queueCount === 0}
            >
              <Megaphone size={24} /> Llamar Siguiente
            </button>
          </div>

          <div className={styles.statCard} style={{ background: 'rgba(37, 99, 235, 0.05)', borderColor: 'rgba(37, 99, 235, 0.2)' }}>
            <h3 style={{ color: 'var(--primary)' }}>Ingreso Manual (Sin Tótem)</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: '0.5rem' }}>
              Registra e ingresa a un paciente directamente a tu escritorio.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="RUT (ej: 12345678-9)"
                value={manualRut ? formatRutUI(manualRut) : ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9kK]/gi, '');
                  if (val.length <= 10) setManualRut(val);
                }}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)' }}
                disabled={currentTurno !== null || loading}
              />
              <button
                className={styles.actionBtn}
                style={{ background: 'var(--primary)', flexShrink: 0, width: 'auto', padding: '0.75rem 1.5rem', margin: 0, opacity: (currentTurno !== null || manualRut.length < 8) ? 0.5 : 1 }}
                onClick={handleManualTicket}
                disabled={currentTurno !== null || loading || manualRut.length < 8}
              >
                Ingresar
              </button>
            </div>
          </div>

          <div className={styles.statCard} style={{ background: 'rgba(220, 38, 38, 0.05)', borderColor: 'rgba(220, 38, 38, 0.2)' }}>
            <h3 style={{ color: 'var(--destructive)' }}>Reinicio de Conteo</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: '0.5rem' }}>
              Usa esto solo si hubo un error en la apertura. El contador volverá a 0.
            </p>
            <button
              className={styles.actionBtn}
              style={{ background: 'var(--destructive)', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)' }}
              onClick={handleReiniciarConteo}
            >
              Reiniciar Conteo a 0
            </button>
            {resetLogs.length > 0 && (
              <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                <strong>Últimos reinicios:</strong>
                <ul style={{ margin: 0, paddingLeft: '1rem', marginTop: '0.25rem' }}>
                  {resetLogs.map((log, i) => (
                    <li key={i}>{log.nombre} - {new Date(log.fecha).toLocaleString()}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className={styles.whatsappCard}>
            <h3>Alertas de WhatsApp</h3>

            {funcionario?.whatsapp_phone && funcionario?.whatsapp_apikey ? (
              <div className={styles.waConnectedState}>
                <div className={styles.waBadge}>
                  <span className={styles.waActiveDot} /> Conectado a WhatsApp
                </div>
                <p className={styles.waMeta}>
                  <strong>Teléfono:</strong> +{funcionario.whatsapp_phone}
                </p>
                <p className={styles.waInstructionText}>
                  Recibirás alertas en tiempo real en tu WhatsApp cuando lleguen turnos de <strong>{funcionario.departamento}</strong>.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={async () => {
                      const testMsg = `🔔 *FilApp - Prueba*\nHola *${funcionario.nombre}*, esta es una prueba de notificación.\nTu WhatsApp está configurado para *${funcionario.departamento}*.\nRecibirás alertas cuando lleguen turnos en espera.`;
                      try {
                        const r = await fetch('/api/whatsapp', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            phone: funcionario.whatsapp_phone,
                            message: testMsg,
                            apikey: funcionario.whatsapp_apikey?.trim()
                          })
                        });
                        const d = await r.json();
                        if (d.success) {
                          toast('WhatsApp de prueba enviado! Revisa tu celular.', 'success');
                        } else {
                          toast('Error: ' + (d.error || 'desconocido'), 'error');
                        }
                      } catch (err: any) {
                        toast('Error de conexión: ' + err.message, 'error');
                      }
                    }}
                    className={styles.waConnectBtn}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    Probar WhatsApp
                  </button>
                  <button
                    onClick={handleUnlinkWhatsapp}
                    className={styles.waDisconnectBtn}
                    disabled={isSavingWhatsapp}
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    Desconectar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLinkWhatsapp} className={styles.waForm}>
                <p className={styles.waDescription}>
                  Recibe notificaciones automáticas e instantáneas en tu celular cuando haya turnos en espera para tu módulo mediante CallMeBot.
                </p>

                <div className={styles.waSteps}>
                  <h4>Configuración en 15 segundos:</h4>
                  <ol>
                    <li>
                      Agrega el número de teléfono <strong>+34 691 62 17 28</strong> a tus contactos.
                    </li>
                    <li>
                      Envíale un mensaje de WhatsApp que diga: <strong>I allow callmebot to send me messages</strong>.
                    </li>
                    <li>
                      El bot responderá con tu <strong>API Key</strong>. Ingresa abajo tu teléfono y esa clave.
                    </li>
                  </ol>
                </div>

                {testError && <div className={styles.waError}>{testError}</div>}
                {testSent && <div className={styles.waSuccess}>¡WhatsApp vinculado! Revisa tu celular para ver el mensaje de confirmación.</div>}

                <div className={styles.waInputGroup}>
                  <label>Número de WhatsApp (con código ej: 56912345678)</label>
                  <input
                    type="text"
                    placeholder="Ej: +56912345678"
                    value={whatsappPhone}
                    onChange={e => setWhatsappPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                    required
                    disabled={isSavingWhatsapp}
                  />
                </div>

                <div className={styles.waInputGroup}>
                  <label>Tu CallMeBot API Key</label>
                  <input
                    type="text"
                    placeholder="Ej: 123456"
                    value={whatsappApiKey}
                    onChange={e => setWhatsappApiKey(e.target.value)}
                    required
                    disabled={isSavingWhatsapp}
                  />
                </div>

                <button
                  type="submit"
                  className={styles.waConnectBtn}
                  disabled={isSavingWhatsapp || !whatsappPhone.trim() || !whatsappApiKey.trim()}
                >
                  {isSavingWhatsapp ? 'Vinculando...' : 'Vincular y Probar'}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className={styles.panelRight}>
          {currentTurno ? (
            <div className={styles.activeTurnoCard}>
              <h2>Atendiendo Actualmente</h2>
              <div className={styles.patientDisplay}>
                {patientName || currentTurno.rut_usuario || 'Paciente'}
              </div>
              <div className={styles.patientInfo}>
                <p>
                  <span className={styles.turnoLabel}>Turno </span>
                  <span className={styles.turnoValue}>
                    {currentTurno.letra_ticket ? `${currentTurno.letra_ticket.charAt(0).toUpperCase()}-` : ''}{currentTurno.numero}
                  </span>
                </p>
                <p><strong>RUT:</strong> {currentTurno.rut_usuario || '—'}</p>
                {(currentTurno.is_appointment || currentTurno.priority) ? (
                  <p className={styles.appointmentTag}>📅 Hora Agendada - Prioridad Alta</p>
                ) : (
                  <p className={styles.generalTag}>Atención General</p>
                )}
              </div>

              {userHistory.length > 0 && (
                <div className={styles.historyBox}>
                  <h3>Historial Reciente del Paciente</h3>
                  <ul>
                    {userHistory.map(h => (
                      <li key={h.id}>
                        <strong>{new Date(h.finished_at).toLocaleDateString()}</strong> -
                        Atendido por: {h.nombre_funcionario || 'Funcionario'} ({h.departamento || 'Sin Depto'})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.actionGrid}>
                <button
                  className={`${styles.actionBtn} ${styles.btnFinish}`}
                  onClick={finalizarTurno}
                  disabled={loading}
                >
                  <CheckCircle size={20} /> Finalizar Atención
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.btnSkip}`}
                  onClick={saltarTurno}
                  disabled={loading}
                >
                  <SkipForward size={20} /> Saltar (No se presenta)
                </button>
              </div>
              
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <UserForm 
                  rut={currentTurno.rut_usuario} 
                  institutionId={funcionario?.institution_id || ''}
                  funcionarioId={funcionario?.id || ''}
                  funcionarioName={funcionario?.nombre || ''}
                  onSaved={(isComplete) => setIsUserProfileComplete(isComplete)} 
                />
              </div>
            </div>
          ) : (
            <div className={styles.emptyStateCard}>
              <div className={styles.emptyCircle}>
                <User size={48} color="var(--border-color)" />
              </div>
              <h3>Disponible</h3>
              <p>Haga clic en "Llamar Siguiente" para comenzar a atender.</p>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
