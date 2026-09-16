export default function PaperTexture() {
  return (
    <>
      <svg
        className="absolute w-0 h-0 pointer-events-none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/*
            A guillotine cut is never perfectly true. Displacing the sheet's
            outline by a couple of pixels gives the edge the slight waver of
            paper that has been trimmed and handled.
          */}
          <filter id="cut-edge" x="-3%" y="-3%" width="106%" height="106%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.014 0.055"
              numOctaves="3"
              seed="11"
              result="wobble"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="wobble"
              scale="5"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/*
        The grain is a repeated tile declared in CSS, not a live filter over the
        whole viewport. A plain div also honours `inset: 0`, which an <svg> does
        not — SVG's intrinsic sizing wins and needed 100vw/100vh to compensate,
        and 100vw counts the scrollbar.
      */}
      <div className="paper-grain" aria-hidden="true" />

      <div className="paper-vignette" aria-hidden="true" />
    </>
  );
}
