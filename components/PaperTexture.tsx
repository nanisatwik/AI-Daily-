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

      <svg className="paper-grain" width="100%" height="100%" aria-hidden="true">
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="4"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      <div className="paper-vignette" aria-hidden="true" />
    </>
  );
}
