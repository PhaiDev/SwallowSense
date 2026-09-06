import aiosqlite
import json
from typing import List, Optional
from datetime import datetime
import uuid
from backend.models.event import SwallowEvent, SwallowEventCreate, RiskLevel

DB_PATH = "swallowsense.db"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                confidence REAL NOT NULL,
                risk_score REAL NOT NULL,
                risk_level TEXT NOT NULL,
                duration REAL,
                source TEXT NOT NULL,
                metadata TEXT,
                alert_triggered INTEGER NOT NULL,
                alert_channel TEXT
            )
        """)
        await db.commit()

async def save_event(event_create: SwallowEventCreate, risk_level: RiskLevel, alert_triggered: bool, alert_channel: Optional[str] = None) -> SwallowEvent:
    event_id = f"evt_{uuid.uuid4().hex[:8]}"
    now_str = datetime.now().isoformat()
    
    event = SwallowEvent(
        id=event_id,
        timestamp=now_str,
        event_type=event_create.event_type,
        confidence=event_create.confidence,
        risk_score=event_create.risk_score,
        risk_level=risk_level,
        duration=event_create.duration,
        source=event_create.source,
        metadata=event_create.metadata or {},
        alert_triggered=alert_triggered,
        alert_channel=alert_channel
    )
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO events (id, timestamp, event_type, confidence, risk_score, risk_level, duration, source, metadata, alert_triggered, alert_channel)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.id,
                event.timestamp,
                event.event_type,
                event.confidence,
                event.risk_score,
                event.risk_level.value,
                event.duration,
                event.source,
                json.dumps(event.metadata),
                1 if event.alert_triggered else 0,
                event.alert_channel
            )
        )
        await db.commit()
    return event

async def get_recent_events(limit: int = 50) -> List[SwallowEvent]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?", (limit,)) as cursor:
            rows = await cursor.fetchall()
            events = []
            for row in rows:
                events.append(SwallowEvent(
                    id=row["id"],
                    timestamp=row["timestamp"],
                    event_type=row["event_type"],
                    confidence=row["confidence"],
                    risk_score=row["risk_score"],
                    risk_level=RiskLevel(row["risk_level"]),
                    duration=row["duration"],
                    source=row["source"],
                    metadata=json.loads(row["metadata"] or "{}"),
                    alert_triggered=bool(row["alert_triggered"]),
                    alert_channel=row["alert_channel"]
                ))
            return events

async def clear_events():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM events")
        await db.commit()
