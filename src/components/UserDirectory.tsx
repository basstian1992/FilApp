'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';
import { UserData } from './UserForm';
import { Search, Download, Upload, Edit, Save, X } from 'lucide-react';
import UserForm from './UserForm';

interface UserDirectoryProps {
  institutionId: string;
  funcionarioId: string;
  funcionarioName: string;
  role?: string;
}

export default function UserDirectory({ institutionId, funcionarioId, funcionarioName, role = 'funcionario' }: UserDirectoryProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRut, setEditingRut] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'usuarios'), where('institution_id', '==', institutionId));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ ...d.data(), rut: d.id } as UserData));
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (institutionId) {
      fetchUsers();
    }
  }, [institutionId]);

  const handleExport = () => {
    if (users.length === 0) {
      alert('No hay usuarios para exportar.');
      return;
    }
    
    // Ordered columns for Export
    const orderedKeys = [
      'id_ficha', 'rut', 'nacionalidad', 'nombre_completo', 'telefono', 'correo', 'region', 'provincia', 'comuna', 'direccion', 
      'ocupacion', 'discapacidad', 'enfermedad_base', 'funcionarios_atienden', 'nivel_educacional', 'intereses_usuario', 'derivado',
      'prevision_salud', 'prevision_social', 'percapitado', 
      'programa_asiste', 'rsh', 'beneficios_asignados', 'observacion_relevante', 'otro_dato',
      'last_modified_by_name', 'last_modified_at'
    ];

    const separator = ',';
    const csvContent =
      orderedKeys.join(separator) +
      '\n' +
      users.map(row => {
        return orderedKeys.map(k => {
          let cell = (row as any)[k] === null || (row as any)[k] === undefined ? '' : (row as any)[k];
          cell = cell.toString().replace(/"/g, '""');
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
    link.setAttribute("download", `usuarios_${institutionId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('¿Está seguro de importar estos datos? Los usuarios existentes con el mismo RUT serán actualizados.')) {
      e.target.value = '';
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split('\n');
        if (rows.length < 2) throw new Error("CSV vacío");

        const headers = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        const rutIndex = headers.indexOf('rut');
        if (rutIndex === -1) throw new Error("El CSV debe contener una columna 'rut'");

        let successCount = 0;

        for (let i = 1; i < rows.length; i++) {
          if (!rows[i].trim()) continue;
          
          // Basic CSV parsing handling quotes
          const regex = /(".*?"|[^",\s]+)(?=\s*,|\s*$)/g;
          const cols: string[] = [];
          let match;
          // Si la fila está vacía, saltar
          if(rows[i].trim() === '') continue;
          
          // Hacemos un split rudimentario
          let inQuotes = false;
          let currentVal = '';
          for (let char of rows[i]) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              cols.push(currentVal.trim());
              currentVal = '';
            } else {
              currentVal += char;
            }
          }
          cols.push(currentVal.trim());

          const rut = cols[rutIndex];
          if (!rut) continue;

          const docData: any = {
            institution_id: institutionId,
            last_modified_by_id: funcionarioId,
            last_modified_by_name: funcionarioName,
            last_modified_at: new Date().toISOString()
          };

          headers.forEach((h, index) => {
            if (h !== 'rut' && cols[index] !== undefined) {
              // Limpiar quotes
              docData[h] = cols[index].replace(/^"|"$/g, '');
            }
          });

          await setDoc(doc(db, 'usuarios', rut), docData, { merge: true });
          successCount++;
        }

        alert(`Importación completada. Se procesaron ${successCount} usuarios.`);
        fetchUsers();
      } catch (err: any) {
        console.error(err);
        alert('Error al importar: ' + err.message);
      }
      setLoading(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredUsers = users.filter(u => 
    u.rut.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.nombre_completo && u.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.id_ficha && u.id_ficha.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Directorio de Pacientes</h2>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
            <Download size={16} /> Descargar (CSV)
          </button>
          
          <button onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
            <Upload size={16} /> Importar (CSV)
          </button>
          <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImport} />
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
        <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input 
          type="text" 
          placeholder="Buscar por RUT o Nombre..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--surface-hover)', color: 'white' }}
        />
      </div>

      {loading && !users.length ? (
        <p>Cargando directorio...</p>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          {editingRut ? (
            <div style={{ padding: '1rem', position: 'relative' }}>
              <button 
                onClick={() => setEditingRut(null)} 
                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
              <UserForm 
                rut={editingRut} 
                institutionId={institutionId} 
                funcionarioId={funcionarioId} 
                funcionarioName={funcionarioName} 
                onSaved={() => { setEditingRut(null); fetchUsers(); }} 
              />
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <th style={{ padding: '1rem' }}>ID Ficha</th>
                  <th style={{ padding: '1rem' }}>RUT</th>
                  <th style={{ padding: '1rem' }}>Nombre Completo</th>
                  <th style={{ padding: '1rem' }}>Teléfono</th>
                  <th style={{ padding: '1rem' }}>Comuna</th>
                  <th style={{ padding: '1rem' }}>Última Modificación</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No se encontraron usuarios.</td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.rut} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem', color: 'var(--primary-color)' }}>{u.id_ficha || '-'}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>{u.rut}</td>
                      <td style={{ padding: '1rem', color: 'white' }}>{u.nombre_completo || 'Sin nombre'}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{u.telefono || '-'}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{u.comuna || '-'}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {u.last_modified_by_name ? `Por ${u.last_modified_by_name} el ${new Date(u.last_modified_at || '').toLocaleDateString()}` : '-'}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {(role === 'admin' || role === 'gerente' || u.last_modified_by_id === funcionarioId) ? (
                          <button 
                            onClick={() => setEditingRut(u.rut)}
                            style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                          >
                            <Edit size={16} /> Editar
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Solo lectura</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
