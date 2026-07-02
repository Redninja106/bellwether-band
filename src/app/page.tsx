import Image from "next/image";
import styles from "./page.module.css";
import WebGLBackground from "./WebGLBackground";

const YOUR_CALL_LINKS = {
  spotify: "PASTE_SPOTIFY_SONG_URL_HERE",
  appleMusic: "PASTE_APPLE_MUSIC_SONG_URL_HERE",
  youtube: "PASTE_YOUTUBE_SONG_URL_HERE",
} as const;

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
    href: "https://www.instagram.com/bellwether_theband/",
    src: "/instagram.svg",
    alt: "Instagram",
  },
  {
    href: "https://www.youtube.com/",
    src: "/youtube.svg",
    alt: "YouTube",
  },
] as const;

const streamingLinks = [
  {
    href: YOUR_CALL_LINKS.spotify,
    src: "/spotify.svg",
    alt: "Spotify",
  },
  {
    href: YOUR_CALL_LINKS.appleMusic,
    src: "/applemusic.svg",
    alt: "Apple Music",
  },
  {
    href: YOUR_CALL_LINKS.youtube,
    src: "/youtube.svg",
    alt: "YouTube",
  },
] as const;

export default function Home() {
  return <>
    <WebGLBackground />
    <main className={styles.page}>
      <h1 className={styles.title}>BELLWETHER</h1>

      <section
        className={styles.release}
        aria-labelledby="your-call-title"
      >
        <div className={styles.artwork}>
          <Image
            className={styles.cover}
            src="/your-call.png"
            alt="Your Call single cover art by Bellwether"
            width={4284}
            height={4284}
            sizes="(max-width: 700px) 78vw, 460px"
            priority
          />
        </div>

        <div className={styles.releaseDetails}>
          <p className={styles.eyebrow}>New single</p>
          <h2 id="your-call-title" className={styles.releaseTitle}>
            Your Call
          </h2>
          <div className={styles.streamRow}>
            <p className={styles.streamLabel}>Stream now:</p>
            <div className={styles.streamingLinks}>
              {streamingLinks.map((link) => (
                <a
                  className={styles.iconLink}
                  key={link.alt}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Listen to Your Call on ${link.alt}`}
                  title={link.alt}
                >
                  <img
                    className={styles.platformIcon}
                    src={link.src}
                    alt=""
                  />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className={styles.shows}
        aria-labelledby="upcoming-shows-title"
      >
        <p className={styles.eyebrow}>See Us Live</p>
        <h2 id="upcoming-shows-title" className={styles.showsTitle}>
          Upcoming shows
        </h2>
        <p className={styles.showsEmpty}>Coming soon...</p>
      </section>

      <div className={styles.footer}>
        <p className={styles.copyright}>&copy; {new Date().getFullYear()} BELLWETHER</p>

        <div className={styles.icons}>
          {socialLinks.map((link) => (
            <a className={styles.iconLink} key={link.alt} href={link.href} target='_blank' rel='noopener noreferrer' aria-label={link.alt}>
              <img className={styles.platformIcon} src={link.src} alt={link.alt} />
            </a>
          ))}
        </div>
      </div>
    </main>
  </>;
}
