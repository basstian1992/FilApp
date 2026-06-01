'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot, updateDoc, orderBy } from 'firebase/firestore';
import styles from './admin.module.css';
import { Settings, BarChart3, Users, Clock, AlertTriangle, Download } from 'lucide-react';

export default function AdminPage() {
  const [mensajeDia, setMensajeDia] = useState('');
  const [departamentosStr, setDepartamentosStr] = useState('DIDECO, OMIL, PRODESAL, PMJH, FOMENTO, OTEC, TURISMO, OTRO');
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

  const exportToCSV = (filename: string, rows: any[]) => {
    if (!rows || !rows.length) {
      alert("No hay datos para exportar");
      return;
    }
    const separator = ',';
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

  const handleExportUsuarios = async () => {
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
      const data = snap.docs.map(d => {
        const docData = d.data();
        return {
          RUT: d.id,
          Fecha_Ingreso: docData.created_at ? new Date(docData.created_at).toLocaleString() : ''
        };
      });
      exportToCSV('usuarios_filapp.csv', data);
    } catch (e) {
      alert("Error exportando usuarios");
    }
  };

  const handleExportTurnos = async () => {
    try {
      const q = query(collection(db, 'turnos'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => {
        const t = d.data();
        return {
          ID_Turno: d.id,
          Estado: t.estado,
          RUT_Usuario: t.usuario_id || '',
          Departamento: t.departamento || '',
          Funcionario: t.nombre_funcionario || '',
          Cargo: t.cargo_funcionario || '',
          Modulo: t.letra_especialista || '',
          Creado_En: t.created_at ? new Date(t.created_at).toLocaleString() : '',
          Llamado_En: t.called_at ? new Date(t.called_at).toLocaleString() : '',
          Finalizado_En: t.finished_at ? new Date(t.finished_at).toLocaleString() : ''
        };
      });
      exportToCSV('turnos_filapp.csv', data);
    } catch (e) {
      alert("Error exportando turnos");
    }
  };

  const handleExportFuncionarios = () => {
    const data = funcionarios.map(f => ({
      Nombre: f.nombre || '',
      Departamento: f.departamento || '',
      Cargo: f.cargo || '',
      Modulo: f.letra_atencion || ''
    }));
    exportToCSV('funcionarios_filapp.csv', data);
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

          {/* Gestión de Funcionarios */}
          <section className={styles.chartSection} style={{overflowX: 'auto'}}>
            <h2>Gestión de Funcionarios por Departamento</h2>
            
            {departamentosStr.split(',').map(s => s.trim()).filter(Boolean).map(depto => {
              const funcs = funcionarios.filter(f => f.departamento === depto);
              return (
                <div key={depto} className={styles.deptoGroup}>
                  <h3 className={styles.deptoTitle}>{depto}</h3>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{width: '100px'}}>Perfil</th>
                        <th>Nombre</th>
                        <th>Cargo o Función</th>
                        <th>Módulo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funcs.map(f => (
                        <tr key={f.id}>
                          <td>
                            <div className={styles.adminProfileCell}>
                              <div className={styles.adminAvatarWrapper}>
                                {f.avatar_url ? (
                                  <img src={f.avatar_url} alt="Avatar" className={styles.adminAvatarImg} />
                                ) : (
                                  <div className={styles.adminAvatarPlaceholder}>
                                    {f.nombre?.substring(0, 2).toUpperCase() || 'FN'}
                                  </div>
                                )}
                              </div>
                              <span 
                                className={styles.statusDot} 
                                data-status={f.estado_funcionario || 'inactivo'}
                                title={`Estado: ${f.estado_funcionario || 'inactivo'}`}
                              />
                            </div>
                          </td>
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
                              value={f.cargo || ''} 
                              onChange={e => updateFuncionario(f.id, 'cargo', e.target.value)} 
                              placeholder="Psicólogo, Asistente..."
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
                      {funcs.length === 0 && (
                        <tr><td colSpan={4}>Sin funcionarios registrados en este departamento.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* Funcionarios sin departamento o con departamento eliminado */}
            {funcionarios.filter(f => !departamentosStr.split(',').map(s => s.trim()).includes(f.departamento)).length > 0 && (
              <div className={styles.deptoGroup}>
                <h3 className={styles.deptoTitle} style={{color: 'var(--destructive)'}}>Otros / Sin Asignar</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{width: '100px'}}>Perfil</th>
                      <th>Nombre</th>
                      <th>Cargo o Función</th>
                      <th>Departamento Actual</th>
                      <th>Módulo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionarios.filter(f => !departamentosStr.split(',').map(s => s.trim()).includes(f.departamento)).map(f => (
                      <tr key={f.id}>
                        <td>
                          <div className={styles.adminProfileCell}>
                            <div className={styles.adminAvatarWrapper}>
                              {f.avatar_url ? (
                                <img src={f.avatar_url} alt="Avatar" className={styles.adminAvatarImg} />
                              ) : (
                                <div className={styles.adminAvatarPlaceholder}>
                                  {f.nombre?.substring(0, 2).toUpperCase() || 'FN'}
                                </div>
                              )}
                            </div>
                            <span 
                              className={styles.statusDot} 
                              data-status={f.estado_funcionario || 'inactivo'}
                              title={`Estado: ${f.estado_funcionario || 'inactivo'}`}
                            />
                          </div>
                        </td>
                        <td>
                          <input className={styles.tableInput} value={f.nombre || ''} onChange={e => updateFuncionario(f.id, 'nombre', e.target.value)} />
                        </td>
                        <td>
                          <input className={styles.tableInput} value={f.cargo || ''} onChange={e => updateFuncionario(f.id, 'cargo', e.target.value)} />
                        </td>
                        <td>
                          <input className={styles.tableInput} value={f.departamento || ''} onChange={e => updateFuncionario(f.id, 'departamento', e.target.value)} />
                        </td>
                        <td>
                          <input className={styles.tableInput} value={f.letra_atencion || ''} onChange={e => updateFuncionario(f.id, 'letra_atencion', e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Sección de Exportación */}
        <section className={styles.exportSection}>
          <h2>Reportes y Exportación de Datos</h2>
          <div className={styles.exportGroup}>
            <button className={styles.exportBtn} onClick={handleExportUsuarios}>
              <Download size={20} />
              Exportar Usuarios (CSV)
            </button>
            <button className={styles.exportBtn} onClick={handleExportTurnos}>
              <Download size={20} />
              Exportar Turnos e Historial (CSV)
            </button>
            <button className={styles.exportBtn} onClick={handleExportFuncionarios}>
              <Download size={20} />
              Exportar Funcionarios (CSV)
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}
