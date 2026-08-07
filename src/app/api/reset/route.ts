import { NextResponse } from 'next/server';

let adminInitialized = false;

async function getFirestoreAdmin() {
  const adminMod = await import('firebase-admin/app');
  const { initializeApp, cert, getApps } = adminMod;
  const firestoreMod = await import('firebase-admin/firestore');
  const { getFirestore } = firestoreMod;

  if (getApps().length === 0) {
    let serviceAccount: any;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (process.env.NODE_ENV === 'development') {
      const fs = await import('fs');
      const path = await import('path');
      const cwd = process.cwd();
      const files = fs.readdirSync(cwd).filter(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
      if (files.length === 0) {
        throw new Error('No se encontraron credenciales de servicio de Firebase (FIREBASE_SERVICE_ACCOUNT o archivo *-firebase-adminsdk-*.json)');
      }
      serviceAccount = JSON.parse(fs.readFileSync(path.join(cwd, files[0]), 'utf-8'));
    } else {
      throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT en producción');
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  adminInitialized = true;
  return getFirestore();
}

export async function POST(request: Request) {
  try {
    const { institutionId, nombre } = await request.json();

    if (!institutionId) {
      return NextResponse.json({ success: false, error: 'Falta institutionId' }, { status: 400 });
    }

    const db = await getFirestoreAdmin();

    const instRef = db.collection('institutions').doc(institutionId);
    const instSnap = await instRef.get();
    if (!instSnap.exists) {
      return NextResponse.json({ success: false, error: 'Institución no encontrada' }, { status: 404 });
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
