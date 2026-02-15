export interface FooterLink {
  /** Link display text */
  label: string;
  /** Link URL */
  url: string;
}

export interface FooterProps {
  /** Company or site name */
  siteName: string;
  /** Copyright year */
  year?: number;
  /** Navigation links */
  links: FooterLink[];
}

export default function Footer({ siteName, year, links }: FooterProps) {
  const displayYear = year ?? new Date().getFullYear();

  return (
    <footer className="bg-gray-900 px-6 py-12 text-gray-300">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-lg font-semibold text-white">{siteName}</div>
          <nav className="flex flex-wrap gap-6">
            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                className="transition hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-8 border-t border-gray-800 pt-6 text-center text-sm text-gray-500">
          &copy; {displayYear} {siteName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
