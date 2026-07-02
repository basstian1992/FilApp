'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/client';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { regionesChile } from '@/lib/chile-locations';
import { Save } from 'lucide-react';
import { useToast } from '@/components/Toast';

export interface UserData {
  id_ficha: string;
  nombre_completo: string;
  nacionalidad: string;
  rut: string;
  region: string;
  provincia: string;
  comuna: string;
  direccion: string;
  telefono: string;
  discapacidad: string;
  
  ocupacion: string;
  enfermedad_base: string;
  funcionarios_atienden: string;
  nivel_educacional: string;
  intereses_usuario: string;
  derivado: string;
  
  prevision_salud: string;
  prevision_social: string;
  percapitado: string;
  otro_dato: string;
  programa_asiste: string;
  rsh: string;
  correo: string;
  beneficios_asignados: string;
  observacion_relevante: string;
  
  last_modified_by_id?: string;
  last_modified_by_name?: string;
  last_modified_at?: string;
  institution_id?: string;
}

interface UserFormProps {
  rut: string;
  institutionId: string;
  funcionarioId: string;
  funcionarioName: string;
  onSaved: (isComplete: boolean) => void;
}

export default function UserForm({ rut, institutionId, funcionarioId, funcionarioName, onSaved }: UserFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<UserData>({
    id_ficha: `FICHA-${Date.now().toString().slice(-6)}`,
    nombre_completo: '',
    nacionalidad: 'Chilena',
    rut: rut,
    region: '',
    provincia: '',
    comuna: '',
    direccion: '',
    telefono: '',
    discapacidad: 'No',
    ocupacion: '',
    enfermedad_base: '',
    funcionarios_atienden: '',
    nivel_educacional: '',
    intereses_usuario: '',
    derivado: '',
    prevision_salud: '',
    prevision_social: '',
    percapitado: '',
    otro_dato: '',
    programa_asiste: '',
    rsh: '',
    correo: '',
    beneficios_asignados: '',
    observacion_relevante: ''
  });

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'usuarios', rut);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const ud = snap.data() as UserData;
          // Si no tiene id_ficha pero ya existe, le creamos una
          if (!ud.id_ficha) ud.id_ficha = `FICHA-${Date.now().toString().slice(-6)}`;
          if (!ud.nacionalidad) ud.nacionalidad = 'Chilena';
          
          setData(prev => ({ ...prev, ...ud, rut }));
          
          // Check if mandatory fields are complete initially
          if (ud.nombre_completo && ud.region && ud.comuna && ud.direccion && ud.telefono && ud.id_ficha && ud.nacionalidad) {
            onSaved(true);
          } else {
            onSaved(false);
          }
        } else {
          onSaved(false);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchUser();
  }, [rut]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: value }));
  };

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setData(prev => ({ ...prev, region: e.target.value, provincia: '', comuna: '' }));
  };

  const handleProvinciaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setData(prev => ({ ...prev, provincia: e.target.value, comuna: '' }));
  };

  const selectedRegion = regionesChile.find(r => r.region === data.region);
  const selectedProvincia = selectedRegion?.provincias.find(p => p.name === data.provincia);

  const isFormValid = () => {
    return (
      data.nombre_completo.trim() !== '' &&
      data.id_ficha.trim() !== '' &&
      data.nacionalidad.trim() !== '' &&
      data.region !== '' &&
      data.provincia !== '' &&
      data.comuna !== '' &&
      data.direccion.trim() !== '' &&
      data.telefono.trim() !== '' &&
      data.discapacidad !== ''
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) {
      toast('Faltan campos obligatorios por llenar.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const docRef = doc(db, 'usuarios', rut);
      const updateData = {
        ...data,
        institution_id: institutionId,
        last_modified_by_id: funcionarioId,
        last_modified_by_name: funcionarioName,
        last_modified_at: new Date().toISOString()
      };
      // Usamos setDoc con merge para no borrar history_turnos u otros datos base
      await setDoc(docRef, updateData, { merge: true });
      onSaved(true);
      toast('Datos de usuario registrados correctamente.');
    } catch (err) {
      console.error(err);
      toast('Error al guardar datos.', 'error');
    }
    setSaving(false);
  };

  if (loading) return <div>Cargando perfil del usuario...</div>;

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', background: 'var(--surface-color)', padding: '1.5rem', borderRadius: '12px' }}>
      <h3 style={{ margin: 0, color: 'var(--primary-color)' }}>Ficha del Paciente (Obligatorio)</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ID Ficha *</label>
          <input name="id_ficha" value={data.id_ficha} onChange={handleChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>RUT</label>
          <input type="text" value={data.rut} disabled style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nombre Completo *</label>
          <input name="nombre_completo" value={data.nombre_completo} onChange={handleChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nacionalidad *</label>
          <input name="nacionalidad" value={data.nacionalidad} onChange={handleChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Región *</label>
          <select value={data.region} onChange={handleRegionChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
            <option value="">Seleccione Región</option>
            {regionesChile.map(r => <option key={r.region} value={r.region}>{r.region}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Provincia *</label>
          <select value={data.provincia} onChange={handleProvinciaChange} required disabled={!selectedRegion} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
            <option value="">Seleccione Provincia</option>
            {selectedRegion?.provincias.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Comuna *</label>
          <select name="comuna" value={data.comuna} onChange={handleChange} required disabled={!selectedProvincia} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
            <option value="">Seleccione Comuna</option>
            {selectedProvincia?.comunas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Calle y Número *</label>
          <input name="direccion" value={data.direccion} onChange={handleChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Teléfono *</label>
          <input name="telefono" value={data.telefono} onChange={handleChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Discapacidad *</label>
          <select name="discapacidad" value={data.discapacidad} onChange={handleChange} required style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
            <option value="No">No</option>
            <option value="Física">Física</option>
            <option value="Sensorial (Visual/Auditiva)">Sensorial (Visual/Auditiva)</option>
            <option value="Intelectual/Cognitiva">Intelectual/Cognitiva</option>
            <option value="Psíquica">Psíquica</option>
            <option value="Otra">Otra</option>
          </select>
        </div>
      </div>

      <h4 style={{ margin: '1rem 0 0 0', color: 'var(--text-secondary)' }}>Datos Opcionales y Beneficios</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ocupación</label>
          <input name="ocupacion" value={data.ocupacion} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nivel Educacional</label>
          <input name="nivel_educacional" value={data.nivel_educacional} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Enfermedad Base</label>
          <input name="enfermedad_base" value={data.enfermedad_base} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Funcionarios que le atienden</label>
          <input name="funcionarios_atienden" value={data.funcionarios_atienden} onChange={handleChange} placeholder="Ej: Dr. Pérez, Asistente Gómez" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Intereses del Usuario</label>
          <input name="intereses_usuario" value={data.intereses_usuario} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Derivado</label>
          <input name="derivado" value={data.derivado} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Previsión de Salud</label>
          <input name="prevision_salud" value={data.prevision_salud} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Previsión Social (AFP/INP)</label>
          <input name="prevision_social" value={data.prevision_social} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Percapitado N°</label>
          <input name="percapitado" value={data.percapitado} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Correo Electrónico</label>
          <input name="correo" type="email" value={data.correo} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>RSH (Tramo %)</label>
          <input name="rsh" value={data.rsh} onChange={handleChange} placeholder="Ej: 40%" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Programa al que Asiste</label>
          <input name="programa_asiste" value={data.programa_asiste} onChange={handleChange} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Beneficios Asignados y Fecha</label>
          <textarea name="beneficios_asignados" value={data.beneficios_asignados} onChange={handleChange} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', resize: 'vertical' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Otro Dato</label>
          <textarea name="otro_dato" value={data.otro_dato} onChange={handleChange} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', resize: 'vertical' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Observación Relevante</label>
          <textarea name="observacion_relevante" value={data.observacion_relevante} onChange={handleChange} rows={2} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', resize: 'vertical' }} />
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button type="submit" disabled={saving || !isFormValid()} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: (saving || !isFormValid()) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
          <Save size={18} /> {saving ? 'Registrando...' : 'Registrar Usuario'}
        </button>
      </div>
    </form>
  );
}
