from __future__ import annotations

import json
import subprocess
import wave
from pathlib import Path

import numpy as np

from app.models.contracts import DeadspaceCut
from app.core.config import Settings
from app.services.jobs import PreparedRepurposeSegment, RepurposeJobService
from app.services.media import MediaService, SequenceClipPlan


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "analyses",
        cache_dir=tmp_path / "cache",
        allowed_origin="http://localhost:3000",
        analysis_backend="tribe",
        tribe_device="cpu",
        gemini_api_key=None,
        gemini_model="gemini-2.5-pro",
        max_video_seconds=60,
        huggingface_hub_token=None,
        ffmpeg_bin="ffmpeg",
        ffprobe_bin="ffprobe",
        convex_site_url=None,
        convex_service_secret=None,
        require_convex_ids=False,
    )


def _generate_phone_clip(
    *,
    ffmpeg_bin: str,
    output_path: Path,
    duration_sec: float,
    color: str,
    frequency_hz: int,
    audio_offset_sec: float = 0.0,
) -> None:
    cmd = [
        ffmpeg_bin,
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c={color}:s=720x1280:r=30:d={duration_sec:.2f}",
    ]
    if audio_offset_sec > 0:
        cmd.extend(
            [
                "-itsoffset",
                f"{audio_offset_sec:.3f}",
            ]
        )
        audio_duration_sec = max(duration_sec - audio_offset_sec, 0.1)
    else:
        audio_duration_sec = duration_sec
    cmd.extend(
        [
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={frequency_hz}:sample_rate=44100:duration={audio_duration_sec:.2f}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            "-video_track_timescale",
            "19200",
            str(output_path),
        ]
    )
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr


def _probe_media(path: Path) -> dict[str, object]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        (
            "stream=index,codec_type,duration,start_time,time_base,r_frame_rate,sample_rate,channels"
            ":format=duration,bit_rate"
        ),
        "-of",
        "json",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def _stream_duration(payload: dict[str, object], codec_type: str) -> float:
    streams = payload.get("streams", [])
    assert isinstance(streams, list)
    for stream in streams:
        if isinstance(stream, dict) and stream.get("codec_type") == codec_type:
            return float(stream["duration"])
    raise AssertionError(f"Missing {codec_type} stream")


def _stream_start_time(payload: dict[str, object], codec_type: str) -> float:
    streams = payload.get("streams", [])
    assert isinstance(streams, list)
    for stream in streams:
        if isinstance(stream, dict) and stream.get("codec_type") == codec_type:
            return float(stream["start_time"])
    raise AssertionError(f"Missing {codec_type} stream")


def _first_non_silent_audio_sec(path: Path) -> float:
    wav_path = path.with_suffix(".wav")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-sample_fmt",
        "s16",
        str(wav_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr

    with wave.open(str(wav_path), "rb") as wav_file:
        frames = wav_file.readframes(wav_file.getnframes())
        sample_rate = wav_file.getframerate()
    wav_path.unlink(missing_ok=True)

    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    assert samples.size > 0

    window_size = max(int(sample_rate * 0.01), 1)
    for index in range(0, samples.size - window_size, window_size):
        window = samples[index : index + window_size]
        rms = float(np.sqrt(np.mean(np.square(window))))
        if rms >= 0.01:
            return index / sample_rate
    return samples.size / sample_rate


def _segment(
    segment_id: str,
    start_sec: float,
    end_sec: float,
    *,
    transcript_preview: str = "",
    summary: str = "",
    timeline_index: int = 0,
    speech_seconds: float | None = None,
    speech_start_sec: float | None = None,
    speech_end_sec: float | None = None,
    deadspace_ratio: float = 0.0,
    scene_break_before: bool = False,
    scene_break_after: bool = False,
    bridge_only: bool = False,
) -> PreparedRepurposeSegment:
    segment = PreparedRepurposeSegment(
        segment_id=segment_id,
        start_sec=start_sec,
        end_sec=end_sec,
        transcript_preview=transcript_preview,
        summary=summary,
    )
    segment.timeline_index = timeline_index
    segment.speech_seconds = speech_seconds if speech_seconds is not None else max(end_sec - start_sec, 0.0)
    segment.speech_start_sec = speech_start_sec
    segment.speech_end_sec = speech_end_sec
    segment.deadspace_ratio = deadspace_ratio
    segment.scene_break_before = scene_break_before
    segment.scene_break_after = scene_break_after
    segment.bridge_only = bridge_only
    return segment


def test_repurpose_build_candidate_segments_avoids_coarse_fixed_windows() -> None:
    service = object.__new__(RepurposeJobService)
    speech_segments = [
        (0.0, 10.8, "I started UGC three weeks ago and I wish I found out about this app earlier."),
        (12.0, 15.8, "With Twine you can upload video clips and get an AI analysis."),
        (17.0, 17.9, "You can cut out the dead space."),
        (19.0, 28.8, "There is an AI editor and it saves me time on campaigns."),
    ]
    default_cuts = [
        DeadspaceCut(
            id="deadspace-1",
            type="deadspace",
            start=11.0,
            end=12.0,
            reason="Pause",
            defaultSelected=True,
        ),
        DeadspaceCut(
            id="deadspace-2",
            type="deadspace",
            start=16.0,
            end=17.0,
            reason="Pause",
            defaultSelected=True,
        ),
        DeadspaceCut(
            id="deadspace-3",
            type="deadspace",
            start=18.0,
            end=19.0,
            reason="Pause",
            defaultSelected=True,
        ),
        DeadspaceCut(
            id="deadspace-4",
            type="deadspace",
            start=24.0,
            end=25.0,
            reason="Pause",
            defaultSelected=True,
        ),
    ]

    segments = service._build_candidate_segments(
        duration_sec=30.0,
        speech_segments=speech_segments,
        default_cuts=default_cuts,
    )

    assert segments
    assert not any(segment.start_sec == 6.0 and segment.end_sec == 11.0 for segment in segments)
    spoken_segments = [segment for segment in segments if not segment.bridge_only]
    assert spoken_segments
    assert min(segment.duration_sec for segment in spoken_segments) >= 1.2 - 1e-6


def test_repurpose_normalize_variant_intervals_merges_adjacent_segments() -> None:
    segments = [
        PreparedRepurposeSegment(
            segment_id="segment-3",
            start_sec=6.0,
            end_sec=12.0,
            transcript_preview="",
            summary="",
        ),
        PreparedRepurposeSegment(
            segment_id="segment-4",
            start_sec=12.0,
            end_sec=18.0,
            transcript_preview="",
            summary="",
        ),
        PreparedRepurposeSegment(
            segment_id="segment-8",
            start_sec=25.5,
            end_sec=30.0,
            transcript_preview="",
            summary="",
        ),
    ]

    normalized = RepurposeJobService._normalize_variant_intervals(
        ordered_segments=segments,
        source_duration_sec=30.0,
        source_fps=30.0,
    )

    assert len(normalized) == 2
    assert normalized[0][0] == 6.0
    assert normalized[0][1] == 18.0
    assert normalized[1][0] == 25.5
    assert normalized[1][1] == 30.0


def test_repurpose_trim_variant_to_duration_tightens_last_segment_before_dropping_block() -> None:
    segments = [
        _segment("segment-1", 0.0, 2.5, timeline_index=0, transcript_preview="Hook"),
        _segment("segment-2", 2.5, 5.0, timeline_index=1, transcript_preview="Feature"),
        _segment("segment-3", 5.0, 7.5, timeline_index=2, transcript_preview="Proof"),
    ]

    trimmed = RepurposeJobService._trim_variant_to_duration(
        ordered_segments=segments,
        target_duration=5.2,
    )

    assert len(trimmed) == 2
    assert sum(segment.duration_sec for segment in trimmed) <= 5.2 + 1e-6
    assert trimmed[-1].end_sec <= 5.2


def test_repurpose_normalize_variant_intervals_protects_spoken_boundaries_when_snapping() -> None:
    segments = [
        PreparedRepurposeSegment(
            segment_id="segment-1",
            start_sec=0.01,
            end_sec=4.52,
            transcript_preview="",
            summary="",
            speech_seconds=4.51,
        ),
    ]

    normalized = RepurposeJobService._normalize_variant_intervals(
        ordered_segments=segments,
        source_duration_sec=30.0,
        source_fps=30.0,
    )

    assert len(normalized) == 1
    assert normalized[0][0] == 0.0
    assert abs(normalized[0][1] - 4.7) <= 1e-6
    assert normalized[0][0] <= segments[0].start_sec
    assert normalized[0][1] >= segments[0].end_sec


def test_repurpose_build_candidate_segments_merges_adjacent_same_line_slices() -> None:
    service = object.__new__(RepurposeJobService)
    speech_segments = [
        (
            0.0,
            4.2,
            "I started UGC three weeks ago and I wish I found this app earlier because it saves me hours.",
        ),
        (
            4.2,
            8.4,
            "I started UGC three weeks ago and I wish I found this app earlier because it saves me hours.",
        ),
        (
            9.0,
            12.4,
            "Now I upload clips and it finds the strong beats without me scrubbing through everything.",
        ),
    ]

    segments = service._build_candidate_segments(
        duration_sec=13.0,
        speech_segments=speech_segments,
        default_cuts=[],
        window_features=[],
    )

    assert segments
    assert segments[0].start_sec == 0.0
    assert segments[0].end_sec >= 8.4
    assert "started UGC three weeks ago" in segments[0].transcript_preview
    assert not any(4.19 <= segment.end_sec <= 4.21 for segment in segments[:2])


def test_repurpose_trim_variant_to_duration_drops_micro_slivers_and_keeps_two_meaningful_beats() -> None:
    segments = [
        _segment(
            "segment-1",
            0.0,
            4.6,
            timeline_index=0,
            transcript_preview="Hook",
            speech_seconds=4.4,
        ),
        _segment(
            "segment-2",
            4.6,
            9.4,
            timeline_index=1,
            transcript_preview="Support",
            speech_seconds=4.6,
        ),
        _segment(
            "segment-3",
            9.4,
            14.2,
            timeline_index=2,
            transcript_preview="Proof",
            speech_seconds=4.4,
        ),
    ]

    trimmed = RepurposeJobService._trim_variant_to_duration(
        ordered_segments=segments,
        target_duration=8.0,
        min_segment_duration=1.2,
    )

    assert len(trimmed) >= 2
    assert all(segment.duration_sec >= 1.2 for segment in trimmed)
    assert sum(segment.duration_sec for segment in trimmed) >= 8.0 - 1e-6


def test_repurpose_trim_segment_end_respects_protected_spoken_region() -> None:
    segment = _segment(
        "segment-1",
        5.0,
        8.0,
        timeline_index=0,
        transcript_preview="This line should not be clipped",
        speech_seconds=2.7,
    )

    trimmed = RepurposeJobService._trim_segment_end(
        segment,
        7.1,
        min_end_sec=7.84,
    )

    assert trimmed.end_sec == 7.84
    assert trimmed.duration_sec >= 2.84


def test_assemble_sequence_keeps_audio_and_video_in_sync_when_some_clips_are_cut(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    media = MediaService(settings)
    source_dir = tmp_path / "sources"
    source_dir.mkdir(parents=True, exist_ok=True)

    colors = ["red", "green", "blue", "yellow", "magenta", "cyan"]
    durations = [4.0, 4.2, 4.4, 4.6, 4.8, 5.0]
    clips: list[SequenceClipPlan] = []
    expected_duration = 0.0

    for index, (color, duration_sec) in enumerate(zip(colors, durations, strict=True)):
        source_path = source_dir / f"clip-{index}.mp4"
        _generate_phone_clip(
            ffmpeg_bin=settings.ffmpeg_bin,
            output_path=source_path,
            duration_sec=duration_sec,
            color=color,
            frequency_hz=440 + (index * 100),
        )
        cuts = [(0.0, 0.8)] if index == len(durations) - 1 else []
        keep_ranges = MediaService._invert_cuts(cuts, duration_sec)
        expected_duration += sum(end - start for start, end in keep_ranges)
        clips.append(
            SequenceClipPlan(
                clip_id=f"clip-{index}",
                source_path=source_path,
                cuts=cuts,
                total_duration_sec=duration_sec,
            )
        )

    output_path = tmp_path / "draft.mp4"
    assembled_duration, _timings = media.assemble_sequence(output_path=output_path, clips=clips)
    probe = _probe_media(output_path)

    video_duration = _stream_duration(probe, "video")
    audio_duration = _stream_duration(probe, "audio")
    container_duration = float(probe["format"]["duration"])

    assert abs(video_duration - audio_duration) <= 0.1
    assert abs(video_duration - expected_duration) <= 0.1
    assert abs(audio_duration - expected_duration) <= 0.1
    assert abs(container_duration - expected_duration) <= 0.1
    assert abs(assembled_duration - expected_duration) <= 0.1


def test_assemble_sequence_preserves_delayed_audio_onset_inside_each_clip(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    media = MediaService(settings)
    source_dir = tmp_path / "sources"
    source_dir.mkdir(parents=True, exist_ok=True)

    clips: list[SequenceClipPlan] = []
    expected_duration = 0.0
    first_clip_probe: dict[str, object] | None = None

    for index, (color, offset_sec) in enumerate((("red", 0.35), ("blue", 0.40)), start=1):
        source_path = source_dir / f"offset-clip-{index}.mp4"
        duration_sec = 4.0
        _generate_phone_clip(
            ffmpeg_bin=settings.ffmpeg_bin,
            output_path=source_path,
            duration_sec=duration_sec,
            color=color,
            frequency_hz=440 * index,
            audio_offset_sec=offset_sec,
        )
        if first_clip_probe is None:
            first_clip_probe = _probe_media(source_path)
        expected_duration += duration_sec
        clips.append(
            SequenceClipPlan(
                clip_id=f"offset-{index}",
                source_path=source_path,
                cuts=[],
                total_duration_sec=duration_sec,
            )
        )

    output_path = tmp_path / "offset-draft.mp4"
    assembled_duration, _timings = media.assemble_sequence(output_path=output_path, clips=clips)
    probe = _probe_media(output_path)

    video_duration = _stream_duration(probe, "video")
    audio_duration = _stream_duration(probe, "audio")
    container_duration = float(probe["format"]["duration"])
    expected_audio_start = _stream_start_time(first_clip_probe or {}, "audio")
    first_audio_start = _first_non_silent_audio_sec(output_path)

    assert abs(video_duration - expected_duration) <= 0.1
    assert abs(audio_duration - expected_duration) <= 0.1
    assert abs(container_duration - expected_duration) <= 0.1
    assert abs(assembled_duration - expected_duration) <= 0.1
    assert abs(first_audio_start - expected_audio_start) <= 0.1
