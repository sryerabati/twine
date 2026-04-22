type LandingBridgeProps = {
  markers: { label: string; description: string }[];
};

const cardRotations = [-0.8, 0.5, -0.5];

export function LandingBridge({ markers }: LandingBridgeProps) {
  return (
    <section
      id="workflow"
      className="border-y-[3px] border-border bg-muted"
    >
      <div className="mx-auto grid max-w-[86rem] gap-10 px-6 py-[4.5rem] sm:px-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-16">
        {/* Left */}
        <div className="max-w-lg">
          <span className="sticker w-fit" style={{ transform: "rotate(1.2deg)" }}>
            Shared workflow
          </span>
          <h2
            className="mt-5 font-cartoon font-black text-foreground"
            style={{ fontSize: "clamp(2rem, 3.8vw, 3.2rem)", letterSpacing: "-0.04em", lineHeight: 1.0, maxWidth: "11ch" }}
          >
            Two lanes. One stronger post.
          </h2>
          <p className="mt-5 text-base font-medium leading-8 text-muted-foreground md:text-[1.05rem]">
            Read the signal, then shape the next cut while the footage still feels fresh.
          </p>
        </div>

        {/* Step cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {markers.map((marker, index) => (
            <article
              key={marker.label}
              className="spring rounded-[1.8rem] border-[3px] border-border bg-card p-5 shadow-[5px_5px_0_0_var(--shadow-stamp)] hover:-translate-x-[2px] hover:-translate-y-[3px] hover:[transform:translate(-2px,-3px)_rotate(-0.4deg)] hover:shadow-[9px_9px_0_0_var(--shadow-stamp)]"
              style={{ transform: `rotate(${cardRotations[index]}deg)` }}
            >
              <p className="text-[0.75rem] font-black tracking-[0.04em] text-primary">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-[0.95rem] font-extrabold tracking-[-0.02em] text-foreground">
                {marker.label}
              </h3>
              <p className="mt-2 text-[0.78rem] font-medium leading-[1.7] text-muted-foreground">
                {marker.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
