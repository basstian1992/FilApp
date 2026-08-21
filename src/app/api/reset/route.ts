import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { sameOrigin } from '@/lib/api-security';

export async function POST(request: Request) {
  try {
    // Pantalla pública: se exige que la petición venga del propio sitio
    if (process.env.NODE_ENV === 'production' && !sameOrigin(request)) {
      return NextResponse.json({ success: false, error: 'Origen no autorizado' }, { status: 403 });
    }

    const { institutionId, sedeId, nombre } = await request.json();

    if (!institutionId) {
      return NextResponse.json({ success: false, error: 'Falta institutionId' }, { status: 400 });
    }

    const db = await getFirestoreAdmin();

    const instRef = db.collection('institutions').doc(institutionId);
    const instSnap = await instRef.get();
    if (!instSnap.exists) {
      return NextResponse.json({ success: false, error: 'Institución no encontrada' }, { status: 404 });
    }

    // Reinicio por dependencia (sede): el contador vive en el documento de la sede
    if (sedeId) {
      const sedeRef = db.collection('sedes').doc(sedeId);
      const sedeSnap = await sedeRef.get();
      if (!sedeSnap.exists || sedeSnap.data()?.institution_id !== institutionId) {
        return NextResponse.json({ success: false, error: 'Dependencia no encontrada' }, { status: 404 });
      }
      const sedeData = sedeSnap.data();
      const logs = (sedeData && sedeData.reset_logs) || [];
      const newLog = { nombre: nombre || 'Pantalla TV', fecha: new Date().toISOString() };
      const updatedLogs = [newLog, ...logs].slice(0, 3);
      await sedeRef.update({
        currentTurno: 0,
        ultimo_reinicio: new Date().toISOString(),
        reset_logs: updatedLogs,
      });
      return NextResponse.json({ success: true, reset_logs: updatedLogs });
    }

    const data = instSnap.data();
    const logs = (data && data.reset_logs) || [];
    const newLog = { nombre: nombre || 'Pantalla TV', fecha: new Date().toISOString() };
    const updatedLogs = [newLog, ...logs].slice(0, 3);

    await instRef.update({
      currentTurno: 0,
      ultimo_reinicio: new Date().toISOString(),
      reset_logs: updatedLogs,
    });

    return NextResponse.json({ success: true, reset_logs: updatedLogs });
  } catch (error: any) {
    console.error('Error al reiniciar conteo:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
