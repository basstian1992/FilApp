import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { sameOrigin, requireInstitutionStaff } from '@/lib/api-security';

// Pone en 0 las estadísticas de una institución: elimina TODOS sus turnos y
// bitácora, y deja los contadores (institución y cada dependencia) en cero.
// Se ejecuta con credenciales de administrador para no exponer borrado masivo
// desde el cliente ni abrir reglas de Firestore.
//
// Seguridad:
//  - Solo se aceptan peticiones del propio sitio (same-origin).
//  - Requiere ID token de Firebase de un usuario autorizado: gerente global
//    o administrador dueño de la institución.
export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === 'production' && !sameOrigin(request)) {
      return NextResponse.json({ success: false, error: 'Origen no autorizado' }, { status: 403 });
    }

    const { institutionId } = await request.json();

    if (!institutionId) {
      return NextResponse.json({ success: false, error: 'Falta institutionId' }, { status: 400 });
    }

    const db = await getFirestoreAdmin();

    const perm = await requireInstitutionStaff(request, db, institutionId);
    if (!perm.ok) {
      return NextResponse.json({ success: false, error: perm.error || 'No autorizado' }, { status: 401 });
    }

    const instRef = db.collection('institutions').doc(institutionId);
    const instSnap = await instRef.get();
    if (!instSnap.exists) {
      return NextResponse.json({ success: false, error: 'Institución no encontrada' }, { status: 404 });
    }

    // Borrar turnos por lotes (límite de 500 ops por batch)
    let deleted = 0;
    const turnosCol = db.collection('turnos');
    for (;;) {
      const snap = await turnosCol.where('institution_id', '==', institutionId).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
    }

    // Borrar bitácora de la institución (los reportes también quedan en 0)
    let deletedBitacora = 0;
    const bitacoraCol = db.collection('bitacora');
    for (;;) {
      const snap = await bitacoraCol.where('institution_id', '==', institutionId).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedBitacora += snap.size;
    }

    // Contadores en 0 (institución y cada dependencia)
    const nowIso = new Date().toISOString();
    await instRef.update({ currentTurno: 0, ultimo_reinicio: nowIso, reset_logs: [] });
    const sedesSnap = await db.collection('sedes').where('institution_id', '==', institutionId).get();
    await Promise.all(sedesSnap.docs.map(sd => sd.ref.update({ currentTurno: 0, ultimo_reinicio: nowIso })));

    return NextResponse.json({ success: true, deleted, deletedBitacora });
  } catch (error: any) {
    console.error('Error al reiniciar estadísticas:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
