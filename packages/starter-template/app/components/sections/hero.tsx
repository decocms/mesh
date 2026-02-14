export interface HeroProps {
  /** Main headline text */
  title: string;
  /** Supporting description */
  subtitle: string;
  /** Call-to-action button text */
  ctaText: string;
  /** CTA button link URL */
  ctaUrl: string;
  /** Optional background image URL */
  backgroundImage?: string;
}

export default function Hero({
  title,
  subtitle,
  ctaText,
  ctaUrl,
  backgroundImage,
}: HeroProps) {
  return (
    <section
      className="relative flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 px-6 py-24 text-center text-white"
      style={
        backgroundImage
          ? {
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {backgroundImage && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/80 to-purple-700/80" />
      )}
      <div className="relative z-10 mx-auto max-w-3xl">
        <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl">
          {title}
        </h1>
        <p className="mb-8 text-lg text-white/90 md:text-xl">{subtitle}</p>
        <a
          href={ctaUrl}
          className="inline-block rounded-lg bg-white px-8 py-3 font-semibold text-blue-700 shadow-lg transition hover:bg-gray-100"
        >
          {ctaText}
        </a>
      </div>
    </section>
  );
}
