#!/usr/bin/env python3
"""
Fetch SAM3 results from Lightning AI Studio.

Downloads annotated videos, shape metrics CSVs, and displacement spike JSONs
for all completed jobs.

Usage:
    python3 scripts/fetch_lightning_results.py
    python3 scripts/fetch_lightning_results.py --job sam3-cage17082-full
    python3 scripts/fetch_lightning_results.py --status  # just check job status
"""

import argparse
import os
import subprocess
import sys

LIGHTNING_USER_ID = "88979037-0bce-402b-bda9-51855933dda9"
LIGHTNING_API_KEY = "8a9c51af-ed9b-449a-86b1-bcda3888727d"
TEAMSPACE = "default-teamspace"
USER = "dejandukic-pijyi"
STUDIO = "mousercv-sam3"
LOCAL_RESULTS = os.path.join(os.path.dirname(__file__), "..", "data", "sam3_results")


def get_studio():
    os.environ["LIGHTNING_USER_ID"] = LIGHTNING_USER_ID
    os.environ["LIGHTNING_API_KEY"] = LIGHTNING_API_KEY
    from lightning_sdk import Studio
    return Studio(name=STUDIO, teamspace=TEAMSPACE, user=USER)


def list_jobs():
    os.environ["LIGHTNING_USER_ID"] = LIGHTNING_USER_ID
    os.environ["LIGHTNING_API_KEY"] = LIGHTNING_API_KEY
    result = subprocess.run(
        ["lightning", "list", "jobs", "--teamspace", f"{USER}/{TEAMSPACE}"],
        capture_output=True, text=True,
        env={**os.environ},
    )
    print(result.stdout or result.stderr)


def fetch_job_results(s, job_name: str, local_dir: str):
    """Download results for a specific job."""
    remote_base = f"results/{job_name.replace('sam3-', '')}"
    os.makedirs(local_dir, exist_ok=True)

    files_to_fetch = [
        ("silhouettes.mp4", "Annotated video"),
        ("shape_metrics.csv", "Shape metrics"),
        ("displacement_spikes.json", "Displacement spikes"),
        ("clip.mp4", "Source clip"),
    ]

    for filename, desc in files_to_fetch:
        remote_path = f"{remote_base}/{filename}"
        local_path = os.path.join(local_dir, filename)
        try:
            print(f"  Downloading {desc}: {remote_path} → {local_path}")
            s.download_file(remote_path, local_path)
            size = os.path.getsize(local_path) / 1024 / 1024
            print(f"    ✓ {size:.1f} MB")
        except Exception as e:
            print(f"    ✗ {e}")


def fetch_all(s, specific_job: str = None):
    """Fetch results for all completed jobs (or a specific one)."""
    # Get job list from CLI
    os.environ["LIGHTNING_USER_ID"] = LIGHTNING_USER_ID
    os.environ["LIGHTNING_API_KEY"] = LIGHTNING_API_KEY

    # Known job names (mapped to result directories on studio)
    jobs = {
        "sam3-v4-dob160810": "dob160810",
        "sam3-v4-cage17082": "cage17082",
        "sam3-v4-img5850": "img5850",
        "sam3-v4-cage2": "cage2",
        "sam3-v4-beforesacri": "beforesacri",
        "sam3-v4-cage17083": "cage17083",
        "sam3-v4-femalemut": "femalemut",
    }

    if specific_job:
        jobs = {k: v for k, v in jobs.items() if k == specific_job or v == specific_job}

    os.makedirs(LOCAL_RESULTS, exist_ok=True)

    for job_name, result_dir in jobs.items():
        local_dir = os.path.join(LOCAL_RESULTS, result_dir)
        print(f"\n{'='*60}")
        print(f"Job: {job_name}")
        print(f"{'='*60}")
        fetch_job_results(s, job_name, local_dir)

    print(f"\n\nAll results saved to: {os.path.abspath(LOCAL_RESULTS)}")
    print("Contents:")
    for d in sorted(os.listdir(LOCAL_RESULTS)):
        full = os.path.join(LOCAL_RESULTS, d)
        if os.path.isdir(full):
            files = os.listdir(full)
            total_mb = sum(os.path.getsize(os.path.join(full, f)) for f in files) / 1024 / 1024
            print(f"  {d}/  ({len(files)} files, {total_mb:.1f} MB)")
            for f in sorted(files):
                print(f"    {f}")


def main():
    parser = argparse.ArgumentParser(description="Fetch SAM3 results from Lightning AI")
    parser.add_argument("--status", action="store_true", help="Just show job status")
    parser.add_argument("--job", type=str, help="Fetch specific job only")
    args = parser.parse_args()

    if args.status:
        list_jobs()
        return

    s = get_studio()
    fetch_all(s, specific_job=args.job)


if __name__ == "__main__":
    main()
