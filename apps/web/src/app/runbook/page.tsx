import { BrandShell } from "@/components/brand-shell";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function RunbookPage() {
  return (
    <BrandShell compact>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12 lg:px-10">
        <section className="surface rounded-[2rem] p-8">
          <Badge variant="secondary" className="rounded-full bg-primary/15 text-primary">
            Sample clip workflow
          </Badge>
          <h1 className="mt-4 font-heading text-5xl tracking-tight">Prepare a known-good local sample</h1>
          <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
            The repo does not bundle demo media. Use your own local clip and trim it to a short MP4 before upload.
          </p>
          <Separator className="my-6" />
          <div className="grid gap-6 md:grid-cols-2">
            <Step
              title="Trim to 10–20 seconds"
              code={`ffmpeg -y -ss 0 -i /path/to/source.mov -t 15 -vf "scale=1080:-2" -c:v libx264 -c:a aac sample-tribe.mp4`}
            />
            <Step
              title="Prefer visible cuts and speech"
              code={`Use a clip with spoken words, one or two camera changes, and no longer than 60 seconds.`}
            />
            <Step
              title="Start both services"
              code={`npm run dev`}
            />
            <Step
              title="Upload from the landing page"
              code={`Choose sample-tribe.mp4 in the single or compare workbench.`}
            />
          </div>
        </section>
      </main>
    </BrandShell>
  );
}

function Step({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-[1.6rem] border border-border/70 bg-background/50 p-5">
      <p className="text-sm font-medium">{title}</p>
      <pre className="mt-3 overflow-x-auto rounded-[1.2rem] bg-black/30 p-4 text-sm text-muted-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
