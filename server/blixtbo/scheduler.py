"""Worker loop. This is the only process that should have WORKER_KEK."""

import time

from blixtbo.db import init_db, session
from blixtbo.jobs import queue_due_renewals, run_job
from blixtbo.models import Job


def tick() -> int:
    db = session()
    try:
        queue_due_renewals(db)
        jobs = db.query(Job).filter_by(status="queued").limit(5).all()
        for job in jobs:
            run_job(db, job)
        db.commit()
        return len(jobs)
    finally:
        db.close()


def main() -> None:
    init_db()
    while True:
        tick()
        time.sleep(60)


if __name__ == "__main__":
    main()
