'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import styles from './admin.module.css';
import { Settings, BarChart3, Users, Clock, AlertTriangle } from 'lucide-react';

export default function AdminPage() {
  const [mensajeDia, setMensajeDia] = useState('');
  const [departamentosStr, setDepartamentosStr] = useState('OMIL, DIDECO');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [stats, setStats] = useState({
    enEspera: 0,
    atendidosHoy: 0,
    tiempoPromedioEspera: 0, // min
    tiempoPromedioAtencion: 0, // min
  });
  const [loading, setLoading] = useState(true);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);

  useEffect(() => {
    // Suscribirse a configuracion global
    const unsubConfig = onSnapshot(doc(db, 'configuracion', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.mensaje_dia) setMensajeDia(data.mensaje_dia);
        if (data.departamentos) setDepartamentosStr(data.departamentos.join(', '));
        if (data.n8n_webhook_url) setWebhookUrl(data.n8n_webhook_url);
      }
    });

    // Cargar funcionarios
    const fetchFuncionarios = async () => {
      const snap = await getDocs(collection(db, 'especialistas'));
      setFuncionarios(snap.docs.map(d => ({id: d.id, ...d.data()})));
    };
    fetchFuncionarios();

    // Suscribirse a turnos para tiempo real
    const unsubTurnos = onSnapshot(collection(db, 'turnos'), () => {
      fetchStats();
    });

    fetchStats().then(() => setLoading(false));

    return () => {
      unsubConfig();
      unsubTurnos();
    };
  }, []);

  const fetchStats = async () => {
    try {
      const turnosRef = collection(db, 'turnos');
      
      // En espera
      const qWait = query(turnosRef, where('estado', '==', 'espera'));
      const waitSnap = await getDocs(qWait);
      
      // Atendidos
      const qAttended = query(turnosRef, where('estado', '==', 'atendido'));
      const attSnap = await getDocs(qAttended);

      let totalEspera = 0;
      let totalAtencion = 0;
      let count = 0;

      attSnap.forEach(doc => {
        const t = doc.data();
        if (t.called_at && t.created_at) {
          const espera = (new Date(t.called_at).getTime() - new Date(t.created_at).getTime()) / 60000;
          totalEspera += espera;
        }
        if (t.finished_at && t.called_at) {
          const atencion = (new Date(t.finished_at).getTime() - new Date(t.called_at).getTime()) / 60000;
          totalAtencion += atencion;
        }
        count++;
      });

      setStats({
        enEspera: waitSnap.size || 0,
        atendidosHoy: attSnap.size || 0,
        tiempoPromedioEspera: count ? Math.round(totalEspera / count) : 0,
        tiempoPromedioAtencion: count ? Math.round(totalAtencion / count) : 0,
      });

    } catch (e) {
      console.error(e);
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'configuracion', 'global'), { 
        mensaje_dia: mensajeDia,
        departamentos: departamentosStr.split(',').map(s => s.trim()).filter(Boolean),
        n8n_webhook_url: webhookUrl.trim()
      }, { merge: true });
      alert("Configuración guardada");
    } catch (e) {
      console.error(e);
    } finally {
      setSavingConfig(false);
    }
  };

  const updateFuncionario = async (id: string, field: string, value: string) => {
    try {
      await updateDoc(doc(db, 'especialistas', id), { [field]: value });
      setFuncionarios(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    } catch (e) {
      alert("Error al actualizar");
    }
  };

  if (loading) return <div className={styles.centerLoad}>Cargando panel de administración...</div>;

  return (
    <div className={styles.adminContainer}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Settings size={28} />
          <h1>Panel de Administración Global</h1>
        </div>
      </header>

      <main className={styles.content}>
        
        {/* KPI Cards */}
        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span>En Espera</span>
              <Users color="var(--primary)" />
            </div>
            <div className={styles.kpiValue}>{stats.enEspera}</div>
          </div>
          
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span>Atendidos Hoy</span>
              <BarChart3 color="var(--success)" />
            </div>
            <div className={styles.kpiValue}>{stats.atendidosHoy}</div>
          </div>

          <div className={`${styles.kpiCard} ${stats.tiempoPromedioEspera > 15 ? styles.kpiWarning : ''}`}>
            <div className={styles.kpiHeader}>
              <span>Tiempo Promedio Espera (SLA)</span>
              <Clock />
            </div>
            <div className={styles.kpiValue}>{stats.tiempoPromedioEspera} min</div>
            {stats.tiempoPromedioEspera > 15 && <div className={styles.warningAlert}><AlertTriangle size={14}/> SLA Excedido</div>}
          </div>

          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span>T. Promedio Atención</span>
              <Clock color="var(--accent)" />
            </div>
            <div className={styles.kpiValue}>{stats.tiempoPromedioAtencion} min</div>
          </div>
        </section>

        <div className={styles.bottomGrid}>
          {/* Configuración */}
          <section className={styles.configSection}>
            <h2>Configuración Global</h2>
            <div className={styles.formGroup}>
              <label>Mensaje del Día (TV)</label>
              <textarea 
                rows={2}
                value={mensajeDia}
                onChange={e => setMensajeDia(e.target.value)}
                placeholder="Escribe el mensaje que se deslizará en la pantalla principal..."
              />
            </div>
            <div className={styles.formGroup}>
              <label>Departamentos (Separados por coma)</label>
              <input 
                type="text"
                value={departamentosStr}
                onChange={e => setDepartamentosStr(e.target.value)}
                placeholder="Ej: OMIL, DIDECO, SALUD"
              />
            </div>
            <div className={styles.formGroup}>
              <label>Webhook URL (n8n)</label>
              <input 
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://tu-n8n.com/webhook/..."
              />
            </div>
            <button 
              className={styles.primaryBtn} 
              onClick={saveConfig}
              disabled={savingConfig}
            >
              {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </section>

          {/* Gráfico / Reportes Mock */}
          <section className={styles.chartSection} style={{overflowX: 'auto'}}>
            <h2>Gestión de Funcionarios</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Departamento</th>
                  <th>Módulo</th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map(f => (
                  <tr key={f.id}>
                    <td>
                      <input 
                        className={styles.tableInput}
                        value={f.nombre || ''} 
                        onChange={e => updateFuncionario(f.id, 'nombre', e.target.value)} 
                        placeholder="Nombre Funcionario"
                      />
                    </td>
                    <td>
                      <input 
                        className={styles.tableInput}
                        value={f.departamento || ''} 
                        onChange={e => updateFuncionario(f.id, 'departamento', e.target.value)} 
                        placeholder="OMIL"
                      />
                    </td>
                    <td>
                      <input 
                        className={styles.tableInput}
                        value={f.letra_atencion || ''} 
                        onChange={e => updateFuncionario(f.id, 'letra_atencion', e.target.value)} 
                        placeholder="A"
                      />
                    </td>
                  </tr>
                ))}
                {funcionarios.length === 0 && (
                  <tr><td colSpan={3}>No hay funcionarios registrados.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

      </main>
    </div>
  );
}
