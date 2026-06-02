import Link from 'next/link';
import styles from './page.module.css';
import { MonitorUp, UserRound, Users, Settings, PhoneForwarded } from 'lucide-react';

export default function LandingPage() {
  return (
    <main className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.badge}>FilApp OS</div>
        <h1 className={styles.title}>Buen día para ayudar personas.</h1>
        <p className={styles.subtitle}>Seleccione el portal al que desea acceder para iniciar su jornada.</p>
      </div>

      <div className={styles.grid}>
        <Link href="/funcionarios" className={styles.card}>
          <div className={styles.iconWrapper}><UserRound size={32} /></div>
          <h2>Funcionarios</h2>
          <p>Atención de usuarios, llamadas y control de fila.</p>
        </Link>

        <Link href="/central" className={styles.card}>
          <div className={styles.iconWrapper}><PhoneForwarded size={32} /></div>
          <h2>Módulo Central</h2>
          <p>Ingreso manual, recepción y orientación rápida.</p>
        </Link>

        <Link href="/admin" className={styles.card}>
          <div className={styles.iconWrapper}><Settings size={32} /></div>
          <h2>Administración</h2>
          <p>Métricas, SLA y configuración general.</p>
        </Link>

        <Link href="/tv" className={styles.card}>
          <div className={styles.iconWrapper}><MonitorUp size={32} /></div>
          <h2>Pantalla TV</h2>
          <p>Visualización pública para sala de espera.</p>
        </Link>

        <Link href="/totem" className={styles.card}>
          <div className={styles.iconWrapper}><Users size={32} /></div>
          <h2>Tótem (Autoatención)</h2>
          <p>Ingreso de pacientes mediante RUT.</p>
        </Link>
      </div>
    </main>
  );
}
