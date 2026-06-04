"""数据库初始化和连接模块"""
import sqlite3
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "labor_service.db"


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_table_columns(conn, table, columns):
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def ensure_worker_columns(conn):
    ensure_table_columns(conn, "workers", {
        "phone": "TEXT DEFAULT ''",
        "gender": "TEXT DEFAULT ''",
        "age": "TEXT DEFAULT ''",
        "expected_role": "TEXT DEFAULT ''",
        "note": "TEXT DEFAULT ''",
        "source": "TEXT DEFAULT ''",
        "registration_date": "TEXT DEFAULT ''",
        "interview_date": "TEXT DEFAULT ''",
        "desired_start_date": "TEXT DEFAULT ''",
        "previous_job": "TEXT DEFAULT ''",
        "education": "TEXT DEFAULT ''",
        "has_interviewed": "TEXT DEFAULT ''",
        "has_employed": "TEXT DEFAULT ''",
        "employ_date": "TEXT DEFAULT ''",
        "desired_company": "TEXT DEFAULT ''",
        "desired_role": "TEXT DEFAULT ''",
        "accept_shifts": "TEXT DEFAULT ''",
        "accept_dorm": "TEXT DEFAULT ''",
        "accept_social_insurance": "TEXT DEFAULT ''",
        "desired_area": "TEXT DEFAULT ''",
        "other_wishes": "TEXT DEFAULT ''",
    })


def ensure_demand_columns(conn):
    ensure_table_columns(conn, "demands", {
        "product": "TEXT DEFAULT ''",
        "need_id": "TEXT DEFAULT ''",
        "gender_required": "TEXT DEFAULT ''",
        "need_experience": "TEXT DEFAULT ''",
        "has_shifts": "TEXT DEFAULT ''",
        "has_meal": "TEXT DEFAULT ''",
        "has_dorm": "TEXT DEFAULT ''",
    })


def ensure_knowledge_columns(conn):
    ensure_table_columns(conn, "knowledge_entries", {
        "account_id": "INTEGER DEFAULT 0",
        "company_key": "TEXT DEFAULT ''",
        "source": "TEXT DEFAULT ''",
        "entity_type": "TEXT DEFAULT ''",
        "entity_id": "INTEGER DEFAULT 0",
        "tags": "TEXT DEFAULT ''",
        "confidence": "INTEGER NOT NULL DEFAULT 80",
        "is_deleted": "INTEGER NOT NULL DEFAULT 0",
        "updated_at": "TEXT DEFAULT CURRENT_TIMESTAMP",
    })


SCHEMA_VERSION = 2


def init_db():
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS demands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER DEFAULT 0,
                company_key TEXT DEFAULT '',
                company TEXT NOT NULL,
                role TEXT NOT NULL,
                type TEXT NOT NULL,
                location TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT DEFAULT '',
                headcount INTEGER NOT NULL DEFAULT 0,
                signed INTEGER NOT NULL DEFAULT 0,
                salary TEXT DEFAULT '',
                age TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER DEFAULT 0,
                company_key TEXT DEFAULT '',
                name TEXT NOT NULL,
                phone TEXT DEFAULT '',
                gender TEXT DEFAULT '',
                age TEXT DEFAULT '',
                location TEXT NOT NULL,
                available TEXT DEFAULT '',
                period TEXT DEFAULT '',
                expected_role TEXT DEFAULT '',
                salary TEXT DEFAULT '',
                score INTEGER NOT NULL DEFAULT 70,
                tags TEXT DEFAULT '',
                note TEXT DEFAULT '',
                source TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER DEFAULT 0,
                company_key TEXT DEFAULT '',
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS knowledge_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER DEFAULT 0,
                company_key TEXT DEFAULT '',
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                source TEXT DEFAULT '',
                entity_type TEXT DEFAULT '',
                entity_id INTEGER DEFAULT 0,
                tags TEXT DEFAULT '',
                confidence INTEGER NOT NULL DEFAULT 80,
                is_deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                account_type TEXT NOT NULL DEFAULT 'enterprise',
                role TEXT DEFAULT 'owner',
                company_key TEXT DEFAULT '',
                company TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                password_hash TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sms_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT NOT NULL,
                code TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS recruitment_pipeline (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                demand_id INTEGER NOT NULL,
                worker_id INTEGER NOT NULL,
                company_key TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'assigned',
                assigned_by INTEGER DEFAULT 0,
                contacted_at TEXT DEFAULT '',
                interviewed_at TEXT DEFAULT '',
                onboarded_at TEXT DEFAULT '',
                stationed_at TEXT DEFAULT '',
                departed_at TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                interview_invite_sent INTEGER DEFAULT 0,
                worker_accepted INTEGER DEFAULT 0,
                phone_revealed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pipeline_company ON recruitment_pipeline(company_key);
            CREATE INDEX IF NOT EXISTS idx_pipeline_demand ON recruitment_pipeline(demand_id);
            CREATE INDEX IF NOT EXISTS idx_pipeline_worker ON recruitment_pipeline(worker_id);
            CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers(phone);
            CREATE INDEX IF NOT EXISTS idx_workers_company ON workers(company_key);
            CREATE INDEX IF NOT EXISTS idx_demands_company ON demands(company_key);
            CREATE INDEX IF NOT EXISTS idx_accounts_phone ON accounts(phone);
            CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_key);
            CREATE INDEX IF NOT EXISTS idx_knowledge_company ON knowledge_entries(company_key);
            CREATE TABLE IF NOT EXISTS pipeline_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pipeline_id INTEGER NOT NULL,
                company_key TEXT NOT NULL DEFAULT '',
                operator_id INTEGER DEFAULT 0,
                operator_name TEXT DEFAULT '',
                event_type TEXT NOT NULL DEFAULT 'status_change',
                from_status TEXT DEFAULT '',
                to_status TEXT DEFAULT '',
                content TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pipeline_events_pipeline ON pipeline_events(pipeline_id);
            """
        )
        ensure_table_columns(conn, "demands", {"account_id": "INTEGER DEFAULT 0"})
        ensure_table_columns(conn, "workers", {"account_id": "INTEGER DEFAULT 0"})
        ensure_table_columns(conn, "demands", {"company_key": "TEXT DEFAULT ''"})
        ensure_table_columns(conn, "workers", {"company_key": "TEXT DEFAULT ''"})
        ensure_table_columns(conn, "accounts", {"role": "TEXT DEFAULT 'owner'", "company_key": "TEXT DEFAULT ''"})
        ensure_table_columns(conn, "chat_messages", {
            "account_id": "INTEGER DEFAULT 0",
            "company_key": "TEXT DEFAULT ''",
        })
        ensure_worker_columns(conn)
        ensure_demand_columns(conn)
        ensure_knowledge_columns(conn)
        # 迁移：给 pipeline 加全局活跃唯一索引（同一求职者不能同时存在两条活跃流程）
        # SQLite 不支持 ALTER TABLE ADD UNIQUE，只能创建唯一索引来模拟
        existing_indexes = {row[1] for row in conn.execute("PRAGMA index_list(recruitment_pipeline)")}
        if "idx_pipeline_worker_active_unique" not in existing_indexes:
            # 清理已存在的重复活跃记录（保留最新一条）
            conn.execute("""
                DELETE FROM recruitment_pipeline
                WHERE id NOT IN (
                    SELECT MAX(id) FROM recruitment_pipeline
                    WHERE status NOT IN ('departed')
                    GROUP BY worker_id, company_key
                ) AND status NOT IN ('departed')
            """)
        # 迁移版本号
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
