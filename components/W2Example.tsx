/**
 * The hero's picture: part of a W-2 with the boxes Pikalo reads, and the
 * result stamped on it. Figures are an example (6.2% and 1.45% of $18,400).
 */
const BOXES = [
  { n: "1", label: "Wages, tips, other comp.", value: "18,400.00" },
  { n: "2", label: "Federal income tax withheld", value: "1,212.00" },
  { n: "3", label: "Social security wages", value: "18,400.00" },
  { n: "4", label: "Social security tax withheld", value: "1,140.80", hit: true },
  { n: "5", label: "Medicare wages and tips", value: "18,400.00" },
  { n: "6", label: "Medicare tax withheld", value: "266.80", hit: true },
];

export default function W2Example() {
  return (
    <figure className="relative mx-auto w-full max-w-md pb-20 lg:mx-0">
      <div className="rounded-xl border border-line bg-surface p-4 shadow-[0_24px_48px_-24px_rgb(22_36_58/0.35)] sm:p-5">
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="text-sm font-bold">
            Form W-2{" "}
            <span className="font-normal text-slate">Wage and Tax Statement</span>
          </span>
          <span className="text-sm font-bold">2026</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {BOXES.map((b) => (
            <div
              key={b.n}
              className={`rounded-md border px-2.5 py-2 ${
                b.hit ? "border-stamp bg-stamp-soft" : "border-line"
              }`}
            >
              <dt className="text-[11px] leading-tight text-slate">
                <span className="font-bold text-ink">{b.n}</span> {b.label}
              </dt>
              <dd className="mt-1 text-right text-[15px] font-semibold tabular-nums">
                {b.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate">
          F-1 student, CPT internship, second year in the U.S.
        </p>
      </div>
      <div className="absolute right-2 bottom-0 w-56 -rotate-3 rounded-lg border-2 border-stamp bg-surface px-4 py-3 shadow-md sm:-right-6">
        <p className="text-sm font-semibold text-stamp">Exempt from FICA</p>
        <p className="text-2xl font-bold tracking-tight text-ink tabular-nums">
          $1,407.60
        </p>
        <p className="text-xs text-slate">you can ask to get back</p>
      </div>
      <figcaption className="sr-only">
        Example: an F-1 student on CPT had $1,140.80 of Social Security and $266.80 of
        Medicare tax withheld. Both are refundable, $1,407.60 in total.
      </figcaption>
    </figure>
  );
}
