import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { sameOrigin } from '@/lib/api-security';

// Auto-cierre de turnos trabados:
// Si un funcionario cierra el navegador con un turno en 'llamado', ese turno
// quedaría pegado para siempre. Esta rutina devuelve a 'espera' los turnos
// llamados hace más de `minutos` (default 15) cuyo especialista está inactivo
// (sin latido `last_seen` en los últimos 5 minutos). Los turnos de una
// consulta larga NO se tocan mientras el funcionario siga en línea.
export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === 'production' && !sameOrigin(request)) {
      return NextResponse.json({ success: false, error: 'Origen no autorizado' }, { status: 403 });
    }

    const { institutionId, sedeId, minutos } = await request.json();
    if (!institutionId) {
      return NextResponse.json({ success: false, error: 'Falta institutionId' }, { status: 400 });
    }

    const db = await getFirestoreAdmin();

    const instSnap = await db.collection('institutions').doc(institutionId).get();
    if (!instSnap.exists) {
      return NextResponse.json({ success: false, error: 'Institución no encontrada' }, { status: 404 });
    }
    if (sedeId) {
      const sedeSnap = await db.collection('sedes').doc(sedeId).get();
      if (!sedeSnap.exists || sedeSnap.data()?.institution_id !== institutionId) {
        return NextResponse.json({ success: false, error: 'Dependencia no válida' }, { status: 400 });
      }
    }

    const maxMin = Math.min(Math.max(Number(minutos) || 15, 5), 120);
    const cutoff = Date.now() - maxMin * 60000;
    const heartbeatCutoff = Date.now() - 5 * 60000;

    // Latidos de los especialistas de esta institución
    const espSnap = await db.collection('especialistas').where('institution_id', '==', institutionId).get();
    const lastSeen = new Map<string, any>();
    espSnap.forEach(d => lastSeen.set(d.id, d.data()?.last_seen || null));

    // Turnos en 'llamado' del alcance solicitado
    let q: any = db.collection('turnos')
      .where('institution_id', '==', institutionId)
      .where('estado', '==', 'llamado');
    if (sedeId) q = q.where('sede_id', '==', sedeId);
    const snap = await q.get();

    const { FieldValue } = await import('firebase-admin/firestore');
    const batch = db.batch();
    let reverted = 0;
    snap.forEach((doc: any) => {
      const t = doc.data();
      const calledMs = t.called_at ? new Date(t.called_at).getTime() : 0;
      if (!calledMs || calledMs >= cutoff) return;

      // Dueño del turno: manual/cola usan especialista_id; horas agendadas funcionario_id
      const ownerId = t.especialista_id || t.funcionario_id || '';
      const seen = ownerId ? lastSeen.get(ownerId) : null;
      const ownerActive = seen ? new Date(seen).getTime() >= heartbeatCutoff : false;
      // Sin dueño conocido o dueño desconectado → turno abandonado
      if (ownerActive) return;

      batch.update(doc.ref, {
        estado: 'espera',
        called_at: FieldValue.delete(),
      });
      reverted++;
    });

    if (reverted > 0) await batch.commit();

    return NextResponse.json({ success: true, reverted });
  } catch (error: any) {
    console.error('Error en auto-cierre:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
