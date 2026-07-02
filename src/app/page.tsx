import styles from "./page.module.css";

const socialLinks = [
  {
    href: "https://open.spotify.com/artist/3l7LxxzdvjfPuGjMsVbKrK",
    src: "/spotify.svg",
    alt: "Spotify",
  },
  {
    href: "https://music.apple.com/",
    src: "/applemusic.svg",
    alt: "Apple Music",
  },
  {
    href: "https://www.instagram.com/",
    src: "/instagram.svg",
    alt: "Instagram",
  },
  {
    href: "https://www.youtube.com/",
    src: "/youtube.svg",
    alt: "YouTube",
  },
] as const;

export default function Home() {
  return <main className={styles.page}>
      <h1 className={styles.title}>BELLWETHER</h1>

      <div className={styles.footer}>
        <p className={styles.copyright}>&copy; {new Date().getFullYear()} BELLWETHER</p>

        <div className={styles.icons}>
          {socialLinks.map((link) => (
            <a key={link.alt} href={link.href} target='_blank' rel='noopener noreferrer' aria-label={link.alt}>
              <img className={styles.icon} src={link.src} alt={link.alt} />
            </a>
          ))}
        </div>
      </div>
    </main>;
}
