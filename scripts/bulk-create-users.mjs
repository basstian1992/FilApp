import { readFileSync } from 'fs';

const SA_PATH = 'C:\\Users\\i7 11th\\Desktop\\Proyectos Programación\\FilApp\\filapp-f5682-firebase-adminsdk-fbsvc-204ee347d4.json';
const BULK_PASSWORD = '123456';
const EXCEL_PATH = 'C:\\Users\\i7 11th\\Downloads\\base datos\\base de datos consolidada 22 07 2026.xlsx';
const CONCURRENCY = 10;

const adminMod = await import('firebase-admin/app');
const { initializeApp, cert } = adminMod;
const firestoreMod = await import('firebase-admin/firestore');
const { getFirestore } = firestoreMod;
const authMod = await import('firebase-admin/auth');
const { getAuth } = authMod;

const XLSXMod = await import('xlsx');
const XLSX = XLSXMod.default || XLSXMod;

function str(v) { return v != null ? String(v).trim() : ''; }

initializeApp({
  credential: cert(SA_PATH),
});

const auth = getAuth();
const db = getFirestore();

async function processRow(row, index, total) {
  const email = str(row.correo).toLowerCase();
  const progress = `[${index + 1}/${total}]`;

  try {
    const userRecord = await auth.createUser({
      email,
      password: BULK_PASSWORD,
      emailVerified: false,
      disabled: false,
    });
    const uid = userRecord.uid;

    await db.collection('usuarios').doc(uid).set({
      user_id: uid,
      email,
      nombre: str(row.nombre_completo),
      rut: str(row.rut),
      telefono: str(row.telefono),
      comuna: str(row.comuna),
      region: str(row.region),
      provincia: str(row.provincia),
      direccion: str(row.direccion),
      ocupacion: str(row.ocupacion),
      discapacidad: str(row.discapacidad),
      antecedentes_penales: str(row.antecedentes_penales),
      enfermedad_base: str(row.enfermedad_base),
      nivel_educacional: str(row.nivel_educacional),
      intereses_usuario: str(row.intereses_usuario),
      prevision_salud: str(row.prevision_salud),
      fecha_nacimiento: str(row.fecha_nacimiento),
      id_ficha: str(row.id_ficha),
      nacionalidad: str(row.nacionalidad),
      created_at: new Date().toISOString(),
    }, { merge: true });

    return { email, status: 'ok' };
  } catch (err) {
    return { email, status: 'fail', error: err.message || String(err) };
  }
}

async function runBatch(items, concurrency, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function main() {
  console.log('=== Carga Masiva Firebase Admin ===');
  console.log(`  Concorrencia: ${CONCURRENCY} usuarios simultáneos\n`);

  console.log('[1/3] Leyendo Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log(`  ${rows.length} filas totales`);

  const validRows = rows.filter(r => {
    const email = str(r.correo);
    return email.includes('@') && !email.includes(' ') && !email.includes(',') && !email.includes(';') && !email.includes('..');
  });
  console.log(`  ${validRows.length} con correo válido\n`);

  console.log('[2/3] Creando Auth + Firestore...');
  const startTime = Date.now();

  const results = await runBatch(validRows, CONCURRENCY, (row, idx) => processRow(row, idx, validRows.length));

  const ok = results.filter(r => r?.status === 'ok');
  const fail = results.filter(r => r?.status === 'fail');
  const emailExists = fail.filter(f => f.error?.includes('EMAIL_EXISTS'));
  const otherFail = fail.filter(f => !f.error?.includes('EMAIL_EXISTS'));

  console.log(`\n[3/3] Resumen:`);
  console.log(`  ✅ Creados nuevos: ${ok.length}`);
  console.log(`  ⚠ Ya existían (Auth): ${emailExists.length}`);
  console.log(`  ❌ Otros errores: ${otherFail.length}`);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ⏱ Tiempo: ${elapsed}s`);

  if (otherFail.length > 0) {
    console.log('\n  Errores:');
    otherFail.forEach(f => console.log(`    - ${f.email}: ${f.error}`));
  }
  console.log('\n=== Completado ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
