import { getAdminAuth } from '@/lib/firebase/admin';

// Emails con rol de gerente (deben mantenerse sincronizados con los paneles cliente)
const GERENTE_EMAILS = ['b.alarconatenas@gmail.com', 'contacto@asesoriapublica.cl'];

// Las pantallas públicas (TV/Tótem) llaman estas APIs desde el mismo origen.
// En producción se exige cabecera Origin/Referer coincidente para bloquear
// peticiones externas directas (curl/scripts). En desarrollo se permite todo.
export function sameOrigin(request: Request): boolean {
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');
  if (origin) {
    try { return new URL(origin).host === host; } catch { return false; }
  }
  const referer = request.headers.get('referer');
  if (referer) {
    try { return new URL(referer).host === host; } catch { return false; }
  }
  return process.env.NODE_ENV !== 'production';
}

// Verifica el ID token de Firebase del panel admin/gerencial y que el usuario
// tenga permisos sobre la institución solicitada (gerente global o admin dueño).
export async function requireInstitutionStaff(
  request: Request,
  db: any,
  institutionId: string
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const h = request.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return { ok: false, error: 'No autenticado.' };
  try {
    const auth = await getAdminAuth();
    const decoded = await auth.verifyIdToken(h.slice(7));
    const email = (decoded.email || '').toLowerCase();
    if (GERENTE_EMAILS.includes(email)) return { ok: true, email };
    const profile = await db.collection('especialistas').doc(decoded.uid).get();
    const d = profile.data();
    if (
      profile.exists &&
      d?.role === 'admin' &&
      d?.institution_id === institutionId &&
      d?.estado_funcionario !== 'pendiente'
    ) {
      return { ok: true, email };
    }
    return { ok: false, error: 'Sin permisos sobre esta institución.' };
  } catch {
    return { ok: false, error: 'Token inválido o expirado.' };
  }
}
