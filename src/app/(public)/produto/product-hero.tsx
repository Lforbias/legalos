import Image from "next/image";
import { ArrowUpRight, FolderOpen, MessageCircle, Sparkles } from "lucide-react";
import styles from "./product-hero.module.css";

/** Editorial composition: product imagery and illustrative module cards. */
export function ProductHero() {
  return <div className={styles.scene} aria-label="LegalOS Desktop, Func, Chat e RUTE em um ecossistema integrado">
    <div className={styles.halo} aria-hidden />
    <div className={styles.orbit} aria-hidden />
    <div className={styles.orbitInner} aria-hidden />
    <div className={styles.wordmark} aria-hidden>LEGALOS</div>
    <div className={styles.screen}>
      <div className={styles.screenBar}><span /><span /><span /><p>LegalOS Desktop</p><FolderOpen size={14} /></div>
      <Image src="/produto/desktop.webp" alt="Área de trabalho LegalOS Desktop com pastas de clientes fictícios" width={1440} height={900} priority className={styles.screenImage} />
    </div>
    <div className={`${styles.tile} ${styles.func}`}><span className={styles.tileIcon}><FolderOpen size={19} /></span><div><p>LegalOS Func</p><small>A operação do seu escritório.</small></div><ArrowUpRight size={16} /></div>
    <div className={`${styles.tile} ${styles.chat}`}><span className={styles.tileIcon}><MessageCircle size={19} /></span><div><p>LegalOS Chat</p><small>Conversas que conectam.</small></div><ArrowUpRight size={16} /></div>
    <div className={`${styles.tile} ${styles.rute}`}><span className={styles.tileIcon}><Sparkles size={19} /></span><div><p>RUTE</p><small>Inteligência com o seu contexto.</small></div><ArrowUpRight size={16} /></div>
    <p className={styles.caption}>UM ECOSSISTEMA. INFINITAS CONEXÕES.</p>
  </div>;
}
