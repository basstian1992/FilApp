import { db } from '@/lib/firebase/client';
import { doc, getDoc } from 'firebase/firestore';

export const triggerWebhook = async (action: 'ingreso' | 'llamado', turnoData: any) => {
  try {
    const configDoc = await getDoc(doc(db, 'configuracion', 'global'));
    const url = configDoc.data()?.n8n_webhook_url;
    if (!url) return;

    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: url, payload: { action, ...turnoData } })
    });
  } catch(e) {
    console.error("Webhook error:", e);
  }
};
