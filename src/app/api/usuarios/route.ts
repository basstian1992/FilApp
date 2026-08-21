import { NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { sameOrigin } from '@/lib/api-security';

// Base de usuarios ESTANDARIZADA por institución: la clave es el RUT y cada
// documento se etiqueta con institution_id (nunca con sede_id), de modo que
// todas las dependencias comparten la misma base segura.
// Las pantallas públicas (Tótem/TV) no tienen sesión, por lo que acceden a
// `usuarios` solo a través de esta ruta con credenciales de administrador.

const RUT_RE = /^[0-9]+[-|‐]{1}[0-9kK]{1}$/;

export async function POST(request: Request) {
  try {
    // Pantalla pública: se exige que la petición venga del propio sitio
    if (process.env.NODE_ENV === 'production' && !sameOrigin(request)) {
      return NextResponse.json({ success: false, error: 'Origen no autorizado' }, { status: 403 });
    }

    const { rut, ruts, institutionId, sedeId, createIfMissing } = await request.json();

    if (!institutionId) {
      return NextResponse.json({ success: false, error: 'Falta institutionId' }, { status: 400 });
    }

    const db = await getFirestoreAdmin();

    // Validar institución y que la sede (si viene) pertenezca a ella
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

    // Modo lote: resuelve nombres de usuarios ya registrados (para pantallas públicas).
    // Nunca devuelve RUT ni datos sensiles: solo { rut → nombre_completo } cuando existe.
    if (Array.isArray(ruts) && ruts.length > 0) {
      const nombres: Record<string, string> = {};
      await Promise.all(
        ruts.slice(0, 60).map(async (r: string) => {
          if (typeof r !== 'string' || !RUT_RE.test(r)) return;
          const s = await db.collection('usuarios').doc(r).get();
          if (s.exists) nombres[r] = s.data()?.nombre_completo || '';
        })
      );
      return NextResponse.json({ success: true, nombres });
    }

    if (!rut) {
      return NextResponse.json({ success: false, error: 'Faltan datos requeridos' }, { status: 400 });
    }
    if (!RUT_RE.test(rut)) {
      return NextResponse.json({ success: false, error: 'RUT inválido' }, { status: 400 });
    }

    const ref = db.collection('usuarios').doc(rut);
    const snap = await ref.get();

    if (snap.exists) {
      return NextResponse.json({
        success: true,
        exists: true,
        nombre_completo: snap.data()?.nombre_completo || '',
      });
    }

    if (createIfMissing) {
      await ref.set(
        {
          rut,
          institution_id: institutionId,
          created_at: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, exists: false, nombre_completo: '' });
  } catch (error: any) {
    console.error('Error en lookup de usuario:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
