/** The assma grape with ellma's four-point star and glint (docs/brand/assma.svg). */
export function GrapeMark({ size = 32, label }: { size?: number; label?: string }) {
  return (
    <svg
      className="grape-mark"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <g className="grape-back">
        <circle cx="17.6" cy="29" r="10.6" />
        <circle cx="46.1" cy="29" r="10.6" />
        <circle cx="32" cy="51.6" r="9.5" />
      </g>
      <g className="grape-front">
        <circle cx="32" cy="26.7" r="12.3" />
        <circle cx="22.8" cy="42.4" r="9.4" />
        <circle cx="41.2" cy="42.4" r="9.4" />
      </g>
      <path fill="#438447" d="M31 12.5C27.8 6 22 4.1 15.8 5.3c1.6 6.4 8 9.6 15.2 7.2Z" />
      <path
        fill="none"
        d="M31.8 17c.05-5.3 2.4-9.7 6.7-13"
        stroke="#805329"
        strokeWidth="3.65"
        strokeLinecap="round"
      />
      <g fill="#fff" transform="translate(6.4 3.5) scale(.8)">
        <path d="M32 25.5c.9 7 4 10.1 11 11-7 .9-10.1 4-11 11-.9-7-4-10.1-11-11 7-.9 10.1-4 11-11z" />
        <path d="M43.5 22.5c.35 2.7 1.55 3.9 4.25 4.25-2.7.35-3.9 1.55-4.25 4.25-.35-2.7-1.55-3.9-4.25-4.25 2.7-.35 3.9-1.55 4.25-4.25z" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <GrapeMark size={30} />
      assma
    </span>
  );
}
