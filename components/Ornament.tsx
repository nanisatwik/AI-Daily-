type SvgProps = { className?: string };

export function CornerFlourish({ className = "" }: SvgProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 116 L4 34 C4 17 17 4 34 4 L116 4" strokeWidth="2.4" />
      <path d="M12 108 L12 36 C12 23 23 12 36 12 L108 12" />
      <path d="M24 24 C40 24 52 30 58 42 C62 50 58 58 50 58 C44 58 40 53 42 47 C44 42 50 41 53 45" />
      <path d="M24 24 C24 40 30 52 42 58 C50 62 58 58 58 50 C58 44 53 40 47 42 C42 44 41 50 45 53" />
      <path d="M70 12 C74 22 82 27 94 27" />
      <path d="M12 70 C22 74 27 82 27 94" />
      <path d="M66 20 C70 20 73 17 73 13" />
      <path d="M20 66 C20 70 17 73 13 73" />
      <circle cx="50" cy="50" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="94" cy="27" r="2" fill="currentColor" stroke="none" />
      <circle cx="27" cy="94" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function OrnateFrame({ className = "" }: SvgProps) {
  const corners = [
    "top-0 left-0",
    "top-0 right-0 -scale-x-100",
    "bottom-0 left-0 -scale-y-100",
    "bottom-0 right-0 -scale-100",
  ];
  return (
    <div
      className={`pointer-events-none absolute inset-0 text-[var(--rule)] ${className}`}
      aria-hidden="true"
    >
      {corners.map((pos) => (
        <CornerFlourish
          key={pos}
          className={`absolute ${pos} w-14 h-14 sm:w-20 sm:h-20`}
        />
      ))}
    </div>
  );
}

export function Fleuron({ className = "" }: SvgProps) {
  return (
    <svg
      viewBox="0 0 48 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M24 4 C29 9 34 10 40 8 C36 14 36 18 40 22 C33 21 28 17 24 12" />
      <path d="M24 4 C19 9 14 10 8 8 C12 14 12 18 8 22 C15 21 20 17 24 12" />
      <circle cx="24" cy="14" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FleuronRule({ className = "" }: { className?: string }) {
  return (
    <div className={`ornament-rule ${className}`}>
      <Fleuron className="w-10 h-5 shrink-0" />
    </div>
  );
}

export function PointingHand({ className = "" }: SvgProps) {
  return (
    <svg
      viewBox="0 0 40 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 11 h14 v-4 l8 5 -8 5 v-4 H2 z" />
      <path d="M26 6 c4 0 7 2 8 6 c-1 4 -4 6 -8 6 c2 -2 3 -4 3 -6 c0 -2 -1 -4 -3 -6 z" />
    </svg>
  );
}

export function Seal({
  top,
  bottom,
  className = "",
}: {
  top: string;
  bottom: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-full border-2 border-current ${className}`}
    >
      <div className="absolute inset-[5px] rounded-full border border-current opacity-60" />
      <div className="text-center leading-none px-2">
        <div
          className="font-label uppercase"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          {top}
        </div>
        <div
          className="font-label uppercase mt-[3px]"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          {bottom}
        </div>
      </div>
    </div>
  );
}
