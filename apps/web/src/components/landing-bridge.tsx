type LandingBridgeProps = {
  markers: { label: string; description: string }[];
};

export function LandingBridge({ markers }: LandingBridgeProps) {
  return (
    <section
      id="workflow"
      className="border-y border-primary/20 bg-[linear-gradient(180deg,rgba(18,22,20,0.98),rgba(18,22,20,0.82))]"
    >
      <div className="mx-auto grid max-w-[84rem] gap-10 px-6 py-14 sm:px-10 lg:grid-cols-[0.86fr_1.14fr] lg:px-16 lg:py-18 xl:px-20">
        <div className="max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-primary/75">
            Shared workflow
          </p>
          <h2 className="mt-4 max-w-[12ch] font-heading text-4xl leading-[0.94] tracking-[-0.06em] text-foreground md:text-5xl">
            Two lanes. One stronger post.
          </h2>
          <p className="mt-5 max-w-[34rem] text-base leading-8 text-muted-foreground md:text-lg">
            Read the signal, then shape the next cut while the footage still feels fresh.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {markers.map((marker, index) => (
            <article key={marker.label} className="surface-soft rounded-[1.7rem] p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-primary/70">
                0{index + 1}
              </p>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-foreground">
                {marker.label}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{marker.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
