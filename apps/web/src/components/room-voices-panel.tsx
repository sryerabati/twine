"use client";

import { createAvatar } from "@dicebear/core";
import type { Options as AvataaarsOptions } from "@dicebear/avataaars";
import { avataaars } from "@dicebear/collection";

import { Badge } from "@/components/ui/badge";
import type { AudienceOutlook, AudienceVoice } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const ROOM_VOICE_THEMES = [
  {
    accent: "bg-emerald-300/70",
    badge: "border-emerald-300/15 bg-emerald-400/[0.08] text-emerald-200",
    rank: "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-200",
  },
  {
    accent: "bg-green-300/70",
    badge: "border-green-300/15 bg-green-400/[0.08] text-green-200",
    rank: "border-green-300/20 bg-green-400/[0.08] text-green-200",
  },
  {
    accent: "bg-teal-300/70",
    badge: "border-teal-300/15 bg-teal-400/[0.08] text-teal-200",
    rank: "border-teal-300/20 bg-teal-400/[0.08] text-teal-200",
  },
  {
    accent: "bg-lime-300/70",
    badge: "border-lime-300/15 bg-lime-400/[0.08] text-lime-200",
    rank: "border-lime-300/20 bg-lime-400/[0.08] text-lime-200",
  },
] as const;

export function RoomVoicesPanel({
  audienceOutlook,
}: {
  audienceOutlook: AudienceOutlook;
}) {
  const voices = audienceOutlook.roomVoices ?? [];

  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Room voices</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Real reactions pulled from the simulated audience so you can scan the audience like a live
            comment feed, not just a summary card.
          </p>
        </div>
        <Badge
          variant="secondary"
          className="w-fit border border-primary/15 bg-primary/10 text-primary"
        >
          {voices.length} simulated reactions
        </Badge>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-primary/15 bg-primary/[0.06] px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.24em] text-primary/80">Room pulse</p>
        <p className="mt-2 max-w-3xl text-base font-medium leading-7 text-foreground">
          {audienceOutlook.headline}
        </p>
      </div>

      {voices.length ? (
        <div className="mt-4 overflow-hidden rounded-[1.35rem] border border-border/70 bg-card/60">
          <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Comments feed</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Balanced between positive and skeptical reactions when the simulation gives us
                enough variety.
              </p>
            </div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Name + position + full reaction
            </p>
          </div>

          <div
            data-testid="room-comments-scroll-region"
            className="signal-scrollbar max-h-[40rem] overflow-y-auto px-4 py-4"
          >
            <div className="space-y-3">
              {voices.map((voice, index) => (
                <CommentRow
                  key={`${voice.handle}-${voice.platform}-${index}`}
                  rank={index + 1}
                  theme={ROOM_VOICE_THEMES[index % ROOM_VOICE_THEMES.length]}
                  voice={voice}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[1.25rem] border border-border/70 bg-card/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
          No direct agent quotes were available on this pass, so this section stays at the
          aggregate level.
        </div>
      )}
    </div>
  );
}

function CommentRow({
  rank,
  theme,
  voice,
}: {
  rank: number;
  theme: (typeof ROOM_VOICE_THEMES)[number];
  voice: AudienceVoice;
}) {
  const presentation = getRoomVoicePresentation(voice, rank);
  const commentId = voiceHandleId(voice.handle);

  return (
    <article
      data-testid="room-comment-item"
      className="rounded-[1.15rem] border border-border/70 bg-background/80 p-4 transition-all duration-200 hover:border-primary/20 hover:bg-primary/[0.04]"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <img
          src={presentation.avatarSrc}
          alt={presentation.avatarAlt}
          className="mt-0.5 h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground sm:text-[15px]">
                  {presentation.displayName}
                </p>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
                    theme.rank,
                  )}
                >
                    #{String(rank).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{presentation.role}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(
                  "h-6 border px-2 text-[10px] uppercase tracking-[0.22em]",
                  theme.badge,
                )}
              >
                {voice.platform}
              </Badge>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]",
                  voice.stance === "negative"
                    ? "border-amber-300/20 bg-amber-400/[0.08] text-amber-200"
                    : "border-primary/20 bg-primary/[0.08] text-primary",
                )}
              >
                {voice.stance === "negative" ? "Skeptical" : "Positive"}
              </span>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {presentation.metaLabel}
              </p>
            </div>
          </div>

          <div className="relative mt-3 rounded-[1rem] border border-border/70 bg-card/80 px-4 py-3">
            <span
              className={cn("absolute left-3 top-3 bottom-3 w-0.5 rounded-full", theme.accent)}
              aria-hidden="true"
            />
            <p
              data-testid={`room-comment-body-${commentId}`}
              className="pl-4 text-sm leading-6 text-foreground/95 sm:text-[15px] sm:leading-7"
            >
              {voice.quote}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function getRoomVoicePresentation(voice: AudienceVoice, rank: number) {
  const persona = analyzeRoomVoicePersona(voice);
  const avatarOptions = buildRoomVoiceAvatarOptions(voice, rank, persona.avatarProfile);
  return {
    displayName: persona.displayName,
    metaLabel: persona.metaLabel,
    role: normalizeWhitespace(voice.role) || "Simulated audience voice",
    avatarAlt: `${persona.displayName} avatar`,
    avatarOptions,
    avatarSrc: createAvatar(avataaars, avatarOptions).toDataUri(),
  };
}

function buildRoomVoiceAvatarOptions(
  voice: AudienceVoice,
  rank: number,
  avatarProfile:
    | "masculineAdult"
    | "masculineYouth"
    | "feminineAdult"
    | "feminineYouth"
    | "neutral",
) {
  const seed = `${voice.handle}-${voice.speaker}-${voice.platform}`;
  const hash = hashString(seed);
  const clothesPalette = ["a7ffc4", "65c9ff", "b1e2ff", "ffffff"];
  const hairPalette = ["2c1b18", "724133", "4a312c", "b58143", "e8e1e1"];
  const skinPalette = ["614335", "d08b5b", "edb98a", "ffdbb4", "fd9841"];

  const common = {
    seed,
    size: 64,
    clip: false as const,
    radius: 0 as const,
    backgroundColor: ["transparent"],
    scale: 88,
    flip: rank % 2 === 0,
    randomizeIds: true,
    accessoriesProbability: hash % 5 === 0 ? 35 : 10,
    accessories: (
      hash % 5 === 0 ? ["round", "wayfarers"] : ["kurt", "round", "wayfarers"]
    ) as NonNullable<AvataaarsOptions["accessories"]>,
    clothesColor: [clothesPalette[hash % clothesPalette.length]],
    hairColor: [hairPalette[hash % hairPalette.length]],
    skinColor: [skinPalette[hash % skinPalette.length]],
  };

  if (avatarProfile === "masculineAdult") {
    return {
      ...common,
      top: [
        "shortFlat",
        "shortWaved",
        "theCaesar",
        "theCaesarAndSidePart",
        "shortRound",
      ] as NonNullable<AvataaarsOptions["top"]>,
      clothing: [
        "blazerAndShirt",
        "collarAndSweater",
        "shirtCrewNeck",
      ] as NonNullable<AvataaarsOptions["clothing"]>,
      facialHair: [
        "beardLight",
        "beardMedium",
        "moustacheFancy",
        "moustacheMagnum",
      ] as NonNullable<AvataaarsOptions["facialHair"]>,
      facialHairProbability: 100,
      mouth: ["default", "serious", "smile"] as NonNullable<AvataaarsOptions["mouth"]>,
      eyebrows: [
        "defaultNatural",
        "flatNatural",
        "upDownNatural",
      ] as NonNullable<AvataaarsOptions["eyebrows"]>,
      eyes: ["default", "happy", "side"] as NonNullable<AvataaarsOptions["eyes"]>,
    };
  }

  if (avatarProfile === "masculineYouth") {
    return {
      ...common,
      top: [
        "shortFlat",
        "shortRound",
        "shortWaved",
        "shortCurly",
        "theCaesar",
      ] as NonNullable<AvataaarsOptions["top"]>,
      clothing: ["hoodie", "shirtCrewNeck", "graphicShirt"] as NonNullable<
        AvataaarsOptions["clothing"]
      >,
      facialHairProbability: 0,
      mouth: ["default", "smile", "twinkle"] as NonNullable<AvataaarsOptions["mouth"]>,
      eyebrows: [
        "defaultNatural",
        "raisedExcitedNatural",
        "upDownNatural",
      ] as NonNullable<AvataaarsOptions["eyebrows"]>,
      eyes: ["default", "happy", "wink"] as NonNullable<AvataaarsOptions["eyes"]>,
    };
  }

  if (avatarProfile === "feminineAdult") {
    return {
      ...common,
      top: ["bob", "bun", "longButNotTooLong", "straight01", "straight02"] as NonNullable<
        AvataaarsOptions["top"]
      >,
      clothing: ["blazerAndSweater", "shirtScoopNeck", "shirtVNeck"] as NonNullable<
        AvataaarsOptions["clothing"]
      >,
      facialHairProbability: 0,
      mouth: ["default", "smile", "twinkle"] as NonNullable<AvataaarsOptions["mouth"]>,
      eyebrows: [
        "defaultNatural",
        "raisedExcitedNatural",
        "upDownNatural",
      ] as NonNullable<AvataaarsOptions["eyebrows"]>,
      eyes: ["default", "happy", "wink"] as NonNullable<AvataaarsOptions["eyes"]>,
    };
  }

  if (avatarProfile === "feminineYouth") {
    return {
      ...common,
      top: ["bob", "bun", "straight01", "straight02", "longButNotTooLong"] as NonNullable<
        AvataaarsOptions["top"]
      >,
      clothing: ["hoodie", "shirtScoopNeck", "shirtVNeck"] as NonNullable<
        AvataaarsOptions["clothing"]
      >,
      facialHairProbability: 0,
      mouth: ["default", "smile", "twinkle"] as NonNullable<AvataaarsOptions["mouth"]>,
      eyebrows: [
        "defaultNatural",
        "raisedExcitedNatural",
        "upDownNatural",
      ] as NonNullable<AvataaarsOptions["eyebrows"]>,
      eyes: ["default", "happy", "wink"] as NonNullable<AvataaarsOptions["eyes"]>,
    };
  }

  return {
    ...common,
    top: ["shortCurly", "shortWaved", "shortRound", "shaggy", "curly"] as NonNullable<
      AvataaarsOptions["top"]
    >,
    clothing: ["hoodie", "shirtCrewNeck", "collarAndSweater"] as NonNullable<
      AvataaarsOptions["clothing"]
    >,
    facialHairProbability: 0,
    mouth: ["default", "serious", "smile"] as NonNullable<AvataaarsOptions["mouth"]>,
    eyebrows: ["defaultNatural", "flatNatural", "upDownNatural"] as NonNullable<
      AvataaarsOptions["eyebrows"]
    >,
    eyes: ["default", "happy", "side"] as NonNullable<AvataaarsOptions["eyes"]>,
  };
}

function analyzeRoomVoicePersona(voice: AudienceVoice) {
  const speaker = normalizeWhitespace(voice.speaker);
  const handleBase = normalizeWhitespace(
    voice.handle.replace(/^@/, "").replace(/_\d+$/, "").replace(/_/g, " "),
  );
  const combined = `${speaker} ${handleBase} ${voice.role}`.toLowerCase();
  const isParentArchetype = /\b(dad|father|mom|mother|parent)\b/.test(combined);
  const isBoyArchetype = /\b(boy|son)\b/.test(combined);
  const isGirlArchetype = /\b(girl|daughter)\b/.test(combined);

  if (isParentArchetype) {
    return {
      displayName: "Parent POV",
      metaLabel: "Audience archetype",
      avatarProfile: /\b(dad|father)\b/.test(combined)
        ? ("masculineAdult" as const)
        : /\b(mom|mother)\b/.test(combined)
          ? ("feminineAdult" as const)
          : ("neutral" as const),
    };
  }

  if (isBoyArchetype) {
    return {
      displayName: "Boy POV",
      metaLabel: "Audience archetype",
      avatarProfile: "masculineYouth" as const,
    };
  }

  if (isGirlArchetype) {
    return {
      displayName: "Girl POV",
      metaLabel: "Audience archetype",
      avatarProfile: "feminineYouth" as const,
    };
  }

  return {
    displayName: humanizeSpeakerLabel(speaker || handleBase || "Audience"),
    metaLabel: voice.handle,
    avatarProfile: inferAvatarProfile(combined),
  };
}

function humanizeSpeakerLabel(value: string) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return "Audience";
  }
  return cleaned
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (part === lower || part === part.toUpperCase()) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function inferAvatarProfile(text: string) {
  if (/\b(dad|father|brother|husband|man|male|guy|he|him)\b/.test(text)) {
    return "masculineAdult" as const;
  }
  if (/\b(boy|son)\b/.test(text)) {
    return "masculineYouth" as const;
  }
  if (/\b(girl|daughter)\b/.test(text)) {
    return "feminineYouth" as const;
  }
  if (/\b(mom|mother|sister|wife|woman|female|she|her)\b/.test(text)) {
    return "feminineAdult" as const;
  }
  return "neutral" as const;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function voiceHandleId(handle: string) {
  return handle.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}
