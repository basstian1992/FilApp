export async function getFirestoreAdmin() {
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
  return getFirestore();
}

export async function getAdminAuth() {
  await getFirestoreAdmin();
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth();
}
