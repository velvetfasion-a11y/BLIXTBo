"""Worker loop. This is the only process that should have WORKER_KEK."""

import time
from datetime import datetime, timedelta, timezone

from blixtbo.db import init_db, session
from blixtbo.jobs import queue_due_renewals, run_job
from blixtbo.keepalive import host_wait, queue_due_keepalives
from blixtbo.models import Job


def run_tick(db, now: datetime | None = None) -> int:
    """Queue due work, then run jobs whose run_at has arrived. At most one keep-alive per host at a time."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    queue_due_renewals(db)
    queue_due_keepalives(db, now=now)
    jobs = (
        db.query(Job)
        .filter(Job.status == "queued", Job.run_at <= now)
        .order_by(Job.run_at.asc())
        .limit(20)
        .all()
    )
    ran = 0
    for job in jobs:
        if job.kind == "keepalive":
            wait = host_wait(job.source_id)
            if wait > 0:
                job.run_at = now + timedelta(seconds=wait)
                continue
        run_job(db, job)
        ran += 1
    db.commit()
    return ran


def tick() -> int:
    db = session()
    try:
        return run_tick(db)
    finally:
        db.close()


def main() -> None:
    init_db()
    while True:
        tick()
        time.sleep(60)


if __name__ == "__main__":
    main()
