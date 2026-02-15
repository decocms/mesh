import { cn } from "../../lib/utils";

export interface Feature {
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Icon name (optional) */
  icon?: string;
}

export interface FeaturesProps {
  /** Section heading */
  heading: string;
  /** List of features to display */
  features: Feature[];
  /** Number of columns (2, 3, or 4) */
  columns?: 2 | 3 | 4;
}

const iconMap: Record<string, string> = {
  edit: "\u270F\uFE0F",
  code: "\uD83D\uDCBB",
  "git-branch": "\uD83D\uDD00",
  star: "\u2B50",
  rocket: "\uD83D\uDE80",
  shield: "\uD83D\uDEE1\uFE0F",
};

const gridClasses: Record<number, string> = {
  2: "grid grid-cols-1 gap-8 md:grid-cols-2",
  3: "grid grid-cols-1 gap-8 md:grid-cols-3",
  4: "grid grid-cols-1 gap-8 md:grid-cols-4",
};

export default function Features({
  heading,
  features,
  columns = 3,
}: FeaturesProps) {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">
          {heading}
        </h2>
        <div className={cn(gridClasses[columns] ?? gridClasses[3])}>
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-gray-200 p-6 transition hover:shadow-lg"
            >
              {feature.icon && (
                <div className="mb-4 text-3xl">
                  {iconMap[feature.icon] ?? feature.icon}
                </div>
              )}
              <h3 className="mb-2 text-xl font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="leading-relaxed text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
