import hashlib
import json
import os
import re
import secrets
import sqlite3
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "labor_service.db"


DEMANDS = [
    {
        "company": "柳东注塑厂（耀世）",
        "role": "注塑包装普工",
        "type": "短期工",
        "location": "柳东",
        "start": "2026-05-13",
        "end": "2026-06-13",
        "headcount": 30,
        "signed": 0,
        "salary": "16+1元/小时，综合5000-5500元",
        "age": "20-45岁",
        "notes": "男女不限，初中及以上，身体健康，无近视、色盲，两班倒8:30-20:30/20:30-8:30。主要剪水口、修毛边、打包装，小件产品，部分坐班。白班包工作餐，夜班无餐补贴5元/班，提供住宿。1元需做满一个月。面试穿长裤、运动鞋，女生扎头发，谢绝短裤、背心、拖鞋、凉鞋、披头散发。",
    },
    {
        "company": "柳东物流公司（方达）",
        "role": "物流普工",
        "type": "长期工",
        "location": "柳东",
        "start": "2026-05-13",
        "end": "",
        "headcount": 40,
        "signed": 0,
        "salary": "17元/小时，204元/天，综合5000-6000元",
        "age": "18-45岁",
        "notes": "男女不限，两班倒8:00-20:00/20:00-8:00，吃饭算工时。包吃包住，自助餐食堂，水电平摊。面试时间下午3:30，驻厂欧主管15677228332。",
    },
    {
        "company": "柳东官塘内饰厂（精特）",
        "role": "包覆工",
        "type": "长期工",
        "location": "柳东官塘",
        "start": "2026-05-13",
        "end": "",
        "headcount": 25,
        "signed": 0,
        "salary": "熟练工20元/小时，新手17元/小时，熟手1个月内转计件，计件可1万+",
        "age": "20-53岁",
        "notes": "男性优先，熟手年龄可放宽。每周可预支500元。包工作餐，提供集体宿舍，水电费平摊。面试必须带身份证原件，上午9点面试。",
    },
    {
        "company": "柳东花岭注塑厂（飞塑）",
        "role": "质检/普工/全检",
        "type": "短期工",
        "location": "柳东花岭",
        "start": "2026-05-13",
        "end": "2026-06-13",
        "headcount": 45,
        "signed": 0,
        "salary": "全检16元/小时，其他岗位面议",
        "age": "20-40岁",
        "notes": "坐班，可周结，不用体检，工作轻松，氛围好，智能管理车间。男女不限，能接受倒班。岗位：质检无需经验女工，普工无需经验男女不限，全检需经验16元/小时。包工作餐，住宿150元/月，水电平摊，宿舍安合华庭在厂区对面。上班时间8:30-20:30/20:30-8:30，上午11点面试。",
    },
    {
        "company": "柳东汽配厂（龙发）",
        "role": "上下挂岗位",
        "type": "长期工",
        "location": "柳东",
        "start": "2026-05-13",
        "end": "",
        "headcount": 20,
        "signed": 0,
        "salary": "17元/小时",
        "age": "20-45岁",
        "notes": "长白班，白班8-12小时，只要男性。包工作餐，包住宿，水电费平摊，员工宿舍在厂内。暂时不体检，不用经验，要求服从安排、吃苦耐劳、反应灵敏。吃饭不算工时。上午8:50面试，面试不通过不报销来回路费、油费、餐费等。",
    },
    {
        "company": "柳东汽配厂（震法）",
        "role": "手包管/开机学徒/套管打胶带",
        "type": "长期工",
        "location": "柳东",
        "start": "2026-05-13",
        "end": "",
        "headcount": 12,
        "signed": 0,
        "salary": "16-17元/小时，部分岗位后期计件",
        "age": "25-38岁",
        "notes": "长白班。手包管急招，28-38岁男女不限，16元/小时，适合有手工经验、耐心、手灵活，做满三个月后须计件，上班8:30-17:00，中午吃饭半小时不算工时，不加班，计件后不定时加班。挤出线开机学徒1名，28-38岁，有开机经验优先，17元/小时，吃饭不扣工时，8:30-17:30不定时加班。套管打胶带1名男生，25-35岁，人灵活，8:30-17:00，不定时加班。包吃，提供住宿安合华庭，骑车15分钟。下午2点面试。",
    },
    {
        "company": "柳东花岭装配岗位（超力）",
        "role": "装配工",
        "type": "短期工",
        "location": "柳东花岭",
        "start": "2026-05-13",
        "end": "2026-06-13",
        "headcount": 35,
        "signed": 0,
        "salary": "17元/小时，每天有效工时10小时",
        "age": "20-48岁",
        "notes": "长白班，可周结，男工。包吃，提供住宿，住宿走路5分钟。上班8:00-20:00，公司包吃两餐；上两小时休息10分钟，中午吃饭1小时，下午吃饭40分钟。第一个月自备全黑色劳保鞋，第二个月公司发劳保用品。工期稳定，工价不变。先试岗后体检，一个月内体检报告也可以。生产交换器总成和空调总成。上午11点面试。",
    },
    {
        "company": "柳东汽配厂（新纪元）",
        "role": "注塑操作工/检验员",
        "type": "长期工",
        "location": "柳州市鱼峰区车园",
        "start": "2026-05-13",
        "end": "",
        "headcount": 30,
        "signed": 0,
        "salary": "17+1元/小时，约216元/天，转正购买五险",
        "age": "20-45岁",
        "notes": "注塑操作工20-45岁，倒班，手脚麻利，服从安排。检验员1名，25-40岁女工，倒班，认真负责，有注塑件外观检验经验优先。每天10-12小时，吃饭算工时，两班倒。试工一天后体检，有体检报告也行。下午2点面试。面试穿长裤、运动鞋，女生扎头发，谢绝短裤、裙子、拖鞋、凉鞋、高跟鞋。",
    },
    {
        "company": "柳东花岭（星心）",
        "role": "注塑工",
        "type": "长期工",
        "location": "柳东花岭",
        "start": "2026-05-13",
        "end": "",
        "headcount": 35,
        "signed": 0,
        "salary": "17元/小时",
        "age": "18-45岁",
        "notes": "开注塑机生产产品。男女不限，能适应两班倒，有汽配注塑行业经验优先，有经验可放宽年龄。主要剪水口、修毛边、打包装，工作简单易上手。白班提供两餐，夜宵有牛奶面包等食物。下午3点面试。面试穿长裤、运动鞋，女生扎头发，谢绝短裤、背心、拖鞋、凉鞋、披头散发。",
    },
    {
        "company": "柳东花玲车标厂（贝驰）",
        "role": "车标生产岗位",
        "type": "短期工",
        "location": "柳东花玲",
        "start": "2026-05-13",
        "end": "2026-06-13",
        "headcount": 40,
        "signed": 0,
        "salary": "17元/小时，夜班补贴15元/晚，综合5000-5500元",
        "age": "20-45岁",
        "notes": "周结，空调车间，坐班，两班倒8:30-20:30/20:30-8:30。主要生产汽车小件车标。女工优先，手脚灵活，熟手年龄可放宽。包工作餐，提供住宿，宿舍走路2分钟。上午10点面试。",
    },
    {
        "company": "柳东官塘汽配厂（成华）",
        "role": "抛光工/普工/质检/备料员/河西售后",
        "type": "短期工",
        "location": "柳东官塘",
        "start": "2026-05-13",
        "end": "2026-06-13",
        "headcount": 80,
        "signed": 0,
        "salary": "普工/质检/备料员/河西售后16元/小时，2个月后加1元；抛光工27元/小时",
        "age": "17-50岁",
        "notes": "大量招聘，不用体检，男女不限，不能有纹身，两班倒。主要生产汽车塑料保险杠。提供宿舍安合华庭，包吃。中午吃饭休息半小时，下午半小时，每天有效工时11小时。可以周结，不扣工时。下午2点面试，面试者需要带身份证复印件。",
    },
    {
        "company": "柳东花岭新能源（奥德永兴）",
        "role": "激光焊/打磨工/悬挂焊/普工",
        "type": "季节工",
        "location": "柳东花岭",
        "start": "2026-04-24",
        "end": "2026-07-31",
        "headcount": 100,
        "signed": 0,
        "salary": "激光焊25+3元/小时，打磨工19+3元/小时，悬挂焊21+3元/小时，普工17+3元/小时",
        "age": "18-53岁",
        "notes": "负责新能源汽车电池壳装配生产。入职满一个月+3元/小时，用工单价调整自2026年4月24日至2026年7月31日止，入职不满一个月离职不享受调整后单价。两班倒8对8，工作8-12小时。工厂食堂扣2元/餐，宿舍150元/月，水电费平摊。男工，女工可做普工，18-48岁，不用体检，新手也可以。上午10:30面试，人多下午也可安排。",
    },
]

WORKERS = [
    {
        "name": "张伟",
        "location": "柳东",
        "available": "现在可到岗",
        "period": "长期稳定",
        "salary": "5000以上",
        "score": 92,
        "tags": "注塑经验, 接受夜班, 需要住宿, 到岗率高",
    },
    {
        "name": "李娜",
        "location": "柳东花岭",
        "available": "本周可到岗",
        "period": "1-3个月",
        "salary": "17元/小时以上",
        "score": 86,
        "tags": "质检, 女工, 坐班, 稳定",
    },
    {
        "name": "王强",
        "location": "柳东官塘",
        "available": "现在可到岗",
        "period": "7-15天",
        "salary": "周结优先",
        "score": 78,
        "tags": "汽配厂, 抛光, 可加班, 短期工",
    },
    {
        "name": "陈晨",
        "location": "柳东",
        "available": "下周可到岗",
        "period": "长期稳定",
        "salary": "5500以上",
        "score": 84,
        "tags": "物流普工, 接受夜班, 无经验可培训, 需要住宿",
    },
    {
        "name": "赵敏",
        "location": "柳东花玲",
        "available": "暑假可做",
        "period": "暑假工",
        "salary": "17元/小时以上",
        "score": 81,
        "tags": "短期工, 包装, 坐班, 接受夜班",
    },
]

PUBLIC_DEMO_DEMANDS = [
    {
        "id": -1,
        "accountId": 0,
        "companyKey": "demo",
        "company": "示例电子厂",
        "role": "包装普工",
        "type": "短期工",
        "location": "示例园区A",
        "start": "2026-06-01",
        "end": "2026-06-30",
        "headcount": 30,
        "signed": 12,
        "salary": "18元/小时",
        "age": "18-45岁",
        "notes": "模拟数据：包工作餐，提供住宿，两班倒，可接受无经验。",
    },
    {
        "id": -2,
        "accountId": 0,
        "companyKey": "demo",
        "company": "示例物流中心",
        "role": "分拣员",
        "type": "长期工",
        "location": "示例园区B",
        "start": "2026-07-01",
        "end": "",
        "headcount": 20,
        "signed": 8,
        "salary": "5500-6500元/月",
        "age": "18-50岁",
        "notes": "模拟数据：包吃住，接受夜班，主要负责分拣、扫码、打包。",
    },
]

PUBLIC_DEMO_WORKERS = [
    {
        "id": -1,
        "accountId": 0,
        "companyKey": "demo",
        "name": "示例求职者A",
        "phone": "13800000000",
        "gender": "男",
        "age": "28",
        "location": "示例园区A",
        "available": "现在可到岗",
        "period": "长期稳定",
        "expectedRole": "普工",
        "salary": "5000以上",
        "score": 80,
        "note": "模拟数据，不代表真实求职者。",
        "source": "系统演示",
        "tags": ["接受夜班", "需要住宿", "普工"],
    },
    {
        "id": -2,
        "accountId": 0,
        "companyKey": "demo",
        "name": "示例求职者B",
        "phone": "13900000000",
        "gender": "女",
        "age": "24",
        "location": "示例园区B",
        "available": "下周可到岗",
        "period": "1-3个月",
        "expectedRole": "质检",
        "salary": "周结优先",
        "score": 78,
        "note": "模拟数据，不代表真实求职者。",
        "source": "系统演示",
        "tags": ["坐班", "质检", "短期工"],
    },
]


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
        demand_count = conn.execute("SELECT COUNT(*) FROM demands").fetchone()[0]
        if demand_count == 0:
            conn.executemany(
                """
                INSERT INTO demands
                (company, role, type, location, start_date, end_date, headcount, signed, salary, age, notes)
                VALUES (:company, :role, :type, :location, :start, :end, :headcount, :signed, :salary, :age, :notes)
                """,
                DEMANDS,
            )
        worker_count = conn.execute("SELECT COUNT(*) FROM workers").fetchone()[0]
        if worker_count == 0:
            conn.executemany(
                """
                INSERT INTO workers
                (name, location, available, period, salary, score, tags)
                VALUES (:name, :location, :available, :period, :salary, :score, :tags)
                """,
                WORKERS,
            )
        # chat_messages 现按租户隔离，启动时不再写入全局欢迎语；新租户首次登录会自己得到欢迎语。
        sync_knowledge_entries(conn)


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
        # 新模板字段 - 求职者信息
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
        # 新模板字段 - 企业用工信息
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


def row_to_demand(row):
    row = dict(row)
    return {
        "id": row["id"],
        "accountId": row["account_id"],
        "companyKey": row["company_key"],
        "company": row["company"],
        "product": row.get("product", ""),
        "role": row["role"],
        "type": row["type"],
        "location": row["location"],
        "start": row["start_date"],
        "end": row["end_date"] or "",
        "headcount": row["headcount"],
        "signed": row["signed"],
        "salary": row["salary"],
        "age": row["age"],
        "genderRequired": row.get("gender_required", ""),
        "needId": row.get("need_id", ""),
        "needExperience": row.get("need_experience", ""),
        "hasShifts": row.get("has_shifts", ""),
        "hasMeal": row.get("has_meal", ""),
        "hasDorm": row.get("has_dorm", ""),
        "notes": row["notes"],
    }


def row_to_worker(row):
    row = dict(row)
    return {
        "id": row["id"],
        "accountId": row["account_id"],
        "companyKey": row["company_key"],
        "name": row["name"],
        "phone": row["phone"],
        "gender": row["gender"],
        "age": row["age"],
        "location": row["location"],
        "available": row["available"],
        "period": row["period"],
        "expectedRole": row["expected_role"],
        "salary": row["salary"],
        "score": row["score"],
        "note": row["note"],
        "source": row["source"],
        "registrationDate": row.get("registration_date", ""),
        "interviewDate": row.get("interview_date", ""),
        "desiredStartDate": row.get("desired_start_date", ""),
        "previousJob": row.get("previous_job", ""),
        "education": row.get("education", ""),
        "hasInterviewed": row.get("has_interviewed", ""),
        "hasEmployed": row.get("has_employed", ""),
        "employDate": row.get("employ_date", ""),
        "desiredCompany": row.get("desired_company", ""),
        "desiredRole": row.get("desired_role", ""),
        "acceptShifts": row.get("accept_shifts", ""),
        "acceptDorm": row.get("accept_dorm", ""),
        "acceptSocialInsurance": row.get("accept_social_insurance", ""),
        "desiredArea": row.get("desired_area", ""),
        "otherWishes": row.get("other_wishes", ""),
        "tags": [item.strip() for item in (row["tags"] or "").replace("，", ",").split(",") if item.strip()],
    }


def row_to_knowledge(row):
    return {
        "id": row["id"],
        "accountId": row["account_id"],
        "companyKey": row["company_key"],
        "category": row["category"],
        "title": row["title"],
        "summary": row["summary"],
        "source": row["source"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "tags": [item.strip() for item in (row["tags"] or "").replace("，", ",").split(",") if item.strip()],
        "confidence": row["confidence"],
        "isDeleted": row["is_deleted"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def upsert_knowledge_entry(conn, category, title, summary, source, entity_type, entity_id, tags, confidence=80, account_id=0, company_key=""):
    tags_text = ", ".join(tags) if isinstance(tags, list) else str(tags or "")
    existing = conn.execute(
        "SELECT id FROM knowledge_entries WHERE entity_type = ? AND entity_id = ? AND category = ? AND company_key = ?",
        (entity_type, entity_id, category, company_key),
    ).fetchone()
    if existing:
        conn.execute(
            """
            UPDATE knowledge_entries
            SET title = ?, summary = ?, source = ?, tags = ?, confidence = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (title, summary, source, tags_text, confidence, existing["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO knowledge_entries
            (account_id, company_key, category, title, summary, source, entity_type, entity_id, tags, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (account_id, company_key, category, title, summary, source, entity_type, entity_id, tags_text, confidence),
        )


def demand_knowledge(row):
    demand = row_to_demand(row)
    tags = [
        demand["type"],
        demand["location"],
        demand["role"],
        "周结" if "周结" in demand["notes"] else "",
        "不用体检" if "不用体检" in demand["notes"] else "",
        "夜班" if "夜班" in demand["notes"] or "两班倒" in demand["notes"] else "",
        "住宿" if "住宿" in demand["notes"] or "宿舍" in demand["notes"] else "",
        f"经验{'-' if demand.get('needExperience') == '否' else ''}要求" if demand.get("needExperience") else "",
    ]
    tags = [item for item in tags if item]
    product_info = f"（{demand['product']}）" if demand.get("product") else ""
    summary = (
        f"{demand['company']}{product_info}招聘{demand['role']}，{demand['type']}，地点{demand['location']}，"
        f"需求{demand['headcount']}人，已报名{demand['signed']}人，薪资{demand['salary']}，"
        f"年龄要求{demand['age'] or '未填写'}"
    )
    extra = []
    if demand.get("genderRequired"): extra.append(f"性别要求：{demand['genderRequired']}")
    if demand.get("hasShifts"): extra.append(f"倒班：{demand['hasShifts']}")
    if demand.get("hasMeal"): extra.append(f"伙食：{demand['hasMeal']}")
    if demand.get("hasDorm"): extra.append(f"住宿：{demand['hasDorm']}")
    if demand.get("needId"): extra.append(f"证件：{demand['needId']}")
    if extra:
        summary += "。" + "；".join(extra)
    summary += f"。关键规则：{demand['notes']}"
    return {
        "category": "企业岗位规则",
        "title": f"{demand['company']}｜{demand['role']}",
        "summary": summary,
        "source": "企业需求维护",
        "entity_type": "demand",
        "entity_id": demand["id"],
        "tags": tags,
        "confidence": 90,
        "account_id": demand.get("accountId", 0) or 0,
        "company_key": demand.get("companyKey", "") or "",
    }


def worker_knowledge(row):
    worker = row_to_worker(row)
    tags = worker["tags"] + [worker["location"], worker["period"], worker["expectedRole"], worker["source"]]
    tags = [item for item in tags if item]
    summary = (
        f"{worker['name']}，{worker.get('gender') or '性别未填'}，{worker.get('age') or '年龄未填'}岁，"
        f"电话{worker.get('phone') or '未填'}，当前地区{worker['location']}，{worker['available']}，"
        f"期望周期{worker['period']}，期望岗位{worker['expectedRole'] or '未填'}，期望薪资{worker['salary'] or '未填'}"
    )
    extra = []
    if worker.get("education"): extra.append(f"学历：{worker['education']}")
    if worker.get("previousJob"): extra.append(f"上份工作：{worker['previousJob']}")
    if worker.get("desiredCompany"): extra.append(f"希望单位：{worker['desiredCompany']}")
    if worker.get("desiredArea"): extra.append(f"希望区域：{worker['desiredArea']}")
    if worker.get("acceptShifts"): extra.append(f"接受倒班：{worker['acceptShifts']}")
    if worker.get("acceptDorm"): extra.append(f"接受住宿：{worker['acceptDorm']}")
    if worker.get("acceptSocialInsurance"): extra.append(f"接受社保：{worker['acceptSocialInsurance']}")
    if worker.get("otherWishes"): extra.append(f"其他：{worker['otherWishes']}")
    if extra:
        summary += "。" + "；".join(extra)
    summary += f"。备注：{worker['note'] or '无'}"
    return {
        "category": "求职者画像",
        "title": f"{worker['name']}｜{worker['location']}｜{worker['period']}",
        "summary": summary,
        "source": worker["source"] or "求职者维护",
        "entity_type": "worker",
        "entity_id": worker["id"],
        "tags": tags,
        "confidence": 82,
        "account_id": worker.get("accountId", 0) or 0,
        "company_key": worker.get("companyKey", "") or "",
    }


def sync_knowledge_entries(conn, company_key=None):
    """同步业务表→知识库。传入 company_key 时只同步该租户，避免全表扫描和跨租户写。"""
    if company_key is None:
        # 仅在 init 阶段调用一次：把历史无 company_key 的种子数据做一次归一化
        conn.execute(
            """
            UPDATE demands
            SET company_key = lower(replace(company, ' ', ''))
            WHERE (company_key IS NULL OR company_key = '') AND account_id = 0
            """
        )
        demand_rows = conn.execute("SELECT * FROM demands").fetchall()
        worker_rows = conn.execute("SELECT * FROM workers").fetchall()
    else:
        demand_rows = conn.execute(
            "SELECT * FROM demands WHERE company_key = ?", (company_key,)
        ).fetchall()
        worker_rows = conn.execute(
            "SELECT * FROM workers WHERE company_key = ?", (company_key,)
        ).fetchall()
    for row in demand_rows:
        item = demand_knowledge(row)
        upsert_knowledge_entry(conn, **item)
    for row in worker_rows:
        item = worker_knowledge(row)
        upsert_knowledge_entry(conn, **item)


def knowledge_scope_clause(account):
    if account and account.get("companyKey"):
        return " AND company_key = ?", [account["companyKey"]]
    return "", []


def save_knowledge_entry(conn, body, account):
    require_login(account)
    tags = body.get("tags", [])
    if isinstance(tags, list):
        tags = ", ".join(tags)
    entry_id = int(body.get("id") or 0)
    values = (
        body.get("category", "业务知识").strip() or "业务知识",
        body.get("title", "").strip(),
        body.get("summary", "").strip(),
        body.get("source", "人工维护").strip(),
        str(tags).strip(),
        int(body.get("confidence") or 80),
    )
    if not values[1] or not values[2]:
        raise ValueError("标题和内容不能为空")
    if entry_id:
        scope_sql, scope_values = knowledge_scope_clause(account)
        conn.execute(
            f"""
            UPDATE knowledge_entries
            SET category = ?, title = ?, summary = ?, source = ?, tags = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_deleted = 0 {scope_sql}
            """,
            (*values, entry_id, *scope_values),
        )
        return entry_id
    cursor = conn.execute(
        """
        INSERT INTO knowledge_entries
        (account_id, company_key, category, title, summary, source, entity_type, entity_id, tags, confidence)
        VALUES (?, ?, ?, ?, ?, ?, 'manual', 0, ?, ?)
        """,
        (
            int(account["id"]),
            account.get("companyKey", ""),
            values[0],
            values[1],
            values[2],
            values[3],
            values[4],
            values[5],
        ),
    )
    return cursor.lastrowid


def delete_knowledge_entries(conn, ids, account):
    require_login(account)
    clean_ids = [int(item) for item in ids if str(item).isdigit()]
    if not clean_ids:
        return 0
    placeholders = ",".join("?" for _ in clean_ids)
    scope_sql, scope_values = knowledge_scope_clause(account)
    rows = conn.execute(
        f"SELECT * FROM knowledge_entries WHERE id IN ({placeholders}) AND is_deleted = 0 {scope_sql}",
        (*clean_ids, *scope_values),
    ).fetchall()
    tenant_key = account.get("companyKey", "")
    for row in rows:
        if row["entity_type"] == "demand" and row["entity_id"]:
            conn.execute(
                "DELETE FROM demands WHERE id = ? AND company_key = ?",
                (row["entity_id"], tenant_key),
            )
        if row["entity_type"] == "worker" and row["entity_id"]:
            conn.execute(
                "DELETE FROM workers WHERE id = ? AND company_key = ?",
                (row["entity_id"], tenant_key),
            )
    conn.execute(
        f"UPDATE knowledge_entries SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders}) {scope_sql}",
        (*clean_ids, *scope_values),
    )
    return len(rows)


def batch_update_knowledge_entries(conn, ids, fields, account):
    require_login(account)
    clean_ids = [int(item) for item in ids if str(item).isdigit()]
    if not clean_ids:
        return 0
    allowed = {
        "category": fields.get("category", "").strip(),
        "source": fields.get("source", "").strip(),
        "tags": fields.get("tags", "").strip(),
    }
    if fields.get("confidence") not in (None, ""):
        allowed["confidence"] = int(fields.get("confidence"))
    assignments = []
    values = []
    for key, value in allowed.items():
        if value != "":
            assignments.append(f"{key} = ?")
            values.append(value)
    if not assignments:
        return 0
    assignments.append("updated_at = CURRENT_TIMESTAMP")
    placeholders = ",".join("?" for _ in clean_ids)
    scope_sql, scope_values = knowledge_scope_clause(account)
    conn.execute(
        f"UPDATE knowledge_entries SET {', '.join(assignments)} WHERE id IN ({placeholders}) AND is_deleted = 0 {scope_sql}",
        (*values, *clean_ids, *scope_values),
    )
    return len(clean_ids)


def build_insights(demands, workers):
    total_gap = sum(max(int(item["headcount"]) - int(item.get("signed") or 0), 0) for item in demands)
    high_gap = sorted(demands, key=lambda item: max(int(item["headcount"]) - int(item.get("signed") or 0), 0), reverse=True)[:5]
    weekly = [item for item in demands if "周结" in item["notes"]]
    no_exam = [item for item in demands if "不用体检" in item["notes"] or "不体检" in item["notes"]]
    night = [worker for worker in workers if any("夜班" in tag for tag in worker["tags"])]
    self_registered = [worker for worker in workers if worker.get("source") == "求职者自助登记"]
    return {
        "totalGap": total_gap,
        "highGap": [
            {
                "title": f"{item['company']} {item['role']}",
                "value": max(int(item["headcount"]) - int(item.get("signed") or 0), 0),
                "note": item["salary"],
            }
            for item in high_gap
        ],
        "weeklyJobs": [{"title": f"{item['company']} {item['role']}", "note": item["salary"]} for item in weekly[:8]],
        "noExamJobs": [{"title": f"{item['company']} {item['role']}", "note": item["age"]} for item in no_exam[:8]],
        "nightWorkers": [{"title": worker["name"], "note": "、".join(worker["tags"])} for worker in night[:8]],
        "selfRegisteredCount": len(self_registered),
    }


def public_demo_payload():
    knowledge = [
        {
            "id": -1,
            "accountId": 0,
            "companyKey": "demo",
            "category": "演示岗位规则",
            "title": "示例电子厂｜包装普工",
            "summary": "这是一条未登录状态下展示的模拟知识条目，用于演示岗位规则、薪资、食宿和用工周期如何沉淀。",
            "source": "系统演示",
            "entityType": "demo",
            "entityId": -1,
            "tags": ["模拟数据", "岗位规则", "短期工"],
            "confidence": 80,
            "isDeleted": 0,
            "createdAt": "",
            "updatedAt": "",
        },
        {
            "id": -2,
            "accountId": 0,
            "companyKey": "demo",
            "category": "演示求职者画像",
            "title": "示例求职者A｜普工｜可到岗",
            "summary": "这是一条未登录状态下展示的模拟求职者画像，用于演示标签、到岗时间和岗位偏好如何参与匹配。",
            "source": "系统演示",
            "entityType": "demo",
            "entityId": -2,
            "tags": ["模拟数据", "求职者画像"],
            "confidence": 75,
            "isDeleted": 0,
            "createdAt": "",
            "updatedAt": "",
        },
    ]
    return {
        "account": None,
        "demo": True,
        "demands": PUBLIC_DEMO_DEMANDS,
        "workers": PUBLIC_DEMO_WORKERS,
        "chat": [
            {
                "role": "assistant",
                "text": "当前为未登录演示模式，页面展示的是模拟数据。登录后会加载企业专属私有知识库。",
            }
        ],
        "knowledge": knowledge,
        "insights": build_insights(PUBLIC_DEMO_DEMANDS, PUBLIC_DEMO_WORKERS),
    }


PBKDF2_ITERATIONS = 200_000


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password, stored):
    if not stored:
        return False
    if "$" not in stored:
        legacy = hashlib.sha256(password.encode("utf-8")).hexdigest()
        return secrets.compare_digest(legacy, stored)
    parts = stored.split("$")
    if len(parts) == 4 and parts[0] == "pbkdf2":
        try:
            iterations = int(parts[1])
        except ValueError:
            return False
        salt = parts[2]
        expected = parts[3]
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations
        ).hex()
        return secrets.compare_digest(actual, expected)
    return False


ALLOWED_ROLES = {"owner", "sales", "dispatcher", "service"}
_COMPANY_KEY_CHAR_RE = re.compile(r"[a-z0-9一-鿿_\-]")
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB 上传上限


def normalize_company_key(company):
    raw = re.sub(r"\s+", "", (company or "").strip()).lower()
    # 只保留中英文、数字、下划线、连字符，避免任何形式的注入或路径穿越
    return "".join(ch for ch in raw if _COMPANY_KEY_CHAR_RE.match(ch))


def account_public(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["account_type"],
        "role": row["role"],
        "companyKey": row["company_key"],
        "company": row["company"],
        "phone": row["phone"],
        "token": row["token"],
    }


def get_account_from_headers(headers):
    auth = headers.get("Authorization", "")
    token = auth.replace("Bearer ", "").strip()
    if not token:
        return None
    with connect() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE token = ?", (token,)).fetchone()
        return account_public(row)


def scoped_where(account, table_alias=""):
    """返回 (sql_fragment, params) 二元组，使用占位符避免 SQL 注入。"""
    prefix = f"{table_alias}." if table_alias else ""
    if account and account.get("companyKey"):
        return f"WHERE {prefix}company_key = ?", [account["companyKey"]]
    # 故意不让"无 companyKey"的账号读到任何业务数据；空 WHERE 会泄露全表
    return "WHERE 1 = 0", []


def require_login(account):
    if not account:
        raise PermissionError("请先登录账号后再操作。")
    if not account.get("companyKey"):
        raise PermissionError("当前账号未绑定企业，无法操作。")


def can_write(account):
    return bool(
        account
        and account.get("companyKey")
        and account.get("role") in ALLOWED_ROLES
    )


def split_fuzzy_sections(text):
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    parts = re.split(r"\n\s*\n+|(?=\n?乐颜～[:：]?)", cleaned)
    sections = [part.replace("乐颜～:", "").replace("乐颜～：", "").strip() for part in parts if part.strip()]
    return sections or ([cleaned] if cleaned else [])


def find_first(patterns, text, default=""):
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1).strip()
    return default


def infer_company(section):
    lines = [line.strip() for line in section.splitlines() if line.strip()]
    for line in lines[:4]:
        if any(word in line for word in ["厂", "公司", "物流", "新能源", "车标"]):
            return re.sub(r"招聘|大量|急招|涨工资了|周结|长白班|可周结", "", line).strip(" ：:，,")
    return lines[0][:30] if lines else "待确认企业"


def infer_role(section):
    role = find_first(
        [
            r"岗位[:：]\s*([^\n]+)",
            r"招聘岗位[:：]\s*([^\n]+)",
            r"急招[！!]*\s*([^\n，,。；;]+)",
            r"(\S*工(?:/[^，。\n]+)*)",
        ],
        section,
        "普工",
    )
    return role[:60]


def infer_type(section):
    if "日结" in section:
        return "日结工"
    if "暑假" in section or "寒假" in section or "旺季" in section:
        return "季节工"
    if "短期" in section or "周结" in section:
        return "短期工"
    return "长期工"


def infer_salary(section):
    salary = find_first(
        [
            r"薪资待遇[:：]?\s*([^\n]+)",
            r"工价[:：]?\s*([^\n]+)",
            r"(\d{2}(?:\+\d+)?\s*元?\s*/?\s*(?:小时|时|h|H))",
            r"(综合工资\s*\d+\s*[-到—]\s*\d+)",
            r"(\d+\s*\*\s*12\s*=\s*\d+\s*/?天?)",
        ],
        section,
        "",
    )
    return salary[:100]


def infer_age(section):
    return find_first([r"年龄[:：]?\s*(\d{2}\s*[-~到—]\s*\d{2}\s*岁?)", r"(\d{2}\s*[-~到—]\s*\d{2}\s*周?岁?)"], section, "")


def infer_location(section, company):
    for place in ["柳东官塘", "柳东花岭", "柳东花玲", "柳州市鱼峰区车园", "柳东", "官塘", "花岭", "花玲"]:
        if place in section or place in company:
            return place
    return "待确认地点"


def infer_headcount(section):
    count = find_first([r"需求\s*(\d+)\s*人", r"招聘\s*(\d+)\s*人", r"(\d+)\s*名"], section, "")
    return int(count) if count.isdigit() else 20


def parse_fuzzy_demands(text):
    results = []
    for section in split_fuzzy_sections(text):
        company = infer_company(section)
        results.append(
            {
                "company": company,
                "product": find_first([r"产品[:：]?\s*([^\n，,。；;]+)", r"主营[:：]?\s*([^\n，,。；;]+)"], section, ""),
                "role": infer_role(section),
                "type": infer_type(section),
                "location": infer_location(section, company),
                "start": find_first([r"开始(?:日期|时间)?[:：]\s*(\d{4}-\d{2}-\d{2})"], section, "2026-05-13"),
                "end": find_first([r"结束(?:日期|时间)?[:：]\s*(\d{4}-\d{2}-\d{2})"], section, ""),
                "headcount": infer_headcount(section),
                "signed": 0,
                "salary": infer_salary(section),
                "age": infer_age(section),
                "genderRequired": "男" if "男" in section[:200] else ("女" if "女" in section[:200] else ""),
                "needId": find_first([r"证件[:：]?\s*(\S+)", r"(需身份证|带身份证|证件照)"], section, ""),
                "needExperience": find_first([r"(?:是否|需要|要求)\s*(\S*经验)", r"经验\s*(\S*要求)"], section, ""),
                "hasShifts": find_first([r"是否\s*(\S*倒班)", r"(两班倒|三班倒)", r"(倒班)"], section, ""),
                "hasMeal": find_first([r"(\S*包吃|\S*工作餐|\S*有食堂|\S*免费餐)"], section, ""),
                "hasDorm": find_first([r"(\S*包住|\S*提供住宿|\S*有宿舍)", r"(\S*住宿费)"], section, ""),
                "notes": section[:1800],
                "confidence": 72,
                "sourceText": section,
            }
        )
    return results


def parse_fuzzy_workers(text):
    items = []
    for section in split_fuzzy_sections(text):
        lines = [line.strip() for line in section.splitlines() if line.strip()]
        first = lines[0] if lines else ""
        name = find_first([r"姓名[:：]\s*([^\s，,。；;\n]+)", r"我叫\s*([^\s，,。；;\n]+)"], section, first[:12] or "待确认姓名")
        phone = find_first([r"(1[3-9]\d{9})"], section, "")
        age = find_first([r"年龄[:：]?\s*(\d{2})", r"(\d{2})\s*岁"], section, "")
        gender = "女" if "女" in section else ("男" if "男" in section else "")
        location = infer_location(section, "")
        role = find_first([r"想做[:：]?\s*([^\n，,。；;]+)", r"期望岗位[:：]\s*([^\n]+)", r"找\s*([^\n，,。；;]+)"], section, "")
        period = "长期稳定" if "长期" in section else ("7-15天" if "短期" in section or "周结" in section else "1-3个月")
        tags = []
        for keyword in ["接受夜班", "不接受夜班", "需要住宿", "不需要住宿", "坐班", "周结", "注塑", "质检", "普工", "物流", "汽配"]:
            if keyword in section:
                tags.append(keyword)
        items.append({
            "name": name,
            "phone": phone,
            "gender": gender,
            "age": age,
            "location": location,
            "available": find_first([r"可到岗[:：]?\s*([^\n，,。；;]+)", r"(今天|明天|下周|现在)可?到岗"], section, "待确认"),
            "period": period,
            "expectedRole": role,
            "salary": find_first([r"期望薪资[:：]?\s*([^\n]+)", r"(\d{4,5}以上)"], section, ""),
            "score": 75,
            "tags": tags,
            "note": section[:1200],
            "source": "模糊采集",
            "confidence": 68,
            "registrationDate": find_first([r"报名日期[:：]\s*(\d{4}-\d{2}-\d{2})", r"报名[:：]\s*(\d{4}-\d{2}-\d{2})"], section, ""),
            "interviewDate": find_first([r"面试日期[:：]\s*(\d{4}-\d{2}-\d{2})", r"面试[:：]\s*(\d{4}-\d{2}-\d{2})"], section, ""),
            "desiredStartDate": find_first([r"希望到岗[:：]\s*(\d{4}-\d{2}-\d{2})", r"到岗日期[:：]\s*([^\n]+)"], section, ""),
            "previousJob": find_first([r"上份工作[:：]?\s*([^\n，,。；;]+)", r"以前做[:：]?\s*([^\n，,。；;]+)"], section, ""),
            "education": find_first([r"学历[:：]?\s*([^\n，,。；;]+)"], section, ""),
            "hasInterviewed": "",
            "hasEmployed": "",
            "employDate": "",
            "desiredCompany": find_first([r"希望单位[:：]?\s*([^\n，,。；;]+)", r"想去[:：]?\s*([^\n，,。；;]+)"], section, ""),
            "desiredRole": role,
            "acceptShifts": "是" if "接受倒班" in section or "能倒班" in section else ("否" if "不接受夜班" in section or "不能倒班" in section else ""),
            "acceptDorm": "是" if "需要住宿" in section or "要住宿" in section else ("否" if "不需要住宿" in section or "不住宿" in section else ""),
            "acceptSocialInsurance": find_first([r"社保[:：]?\s*([^\n，,。；;]+)", r"[是否]*接受社保"], section, ""),
            "desiredArea": find_first([r"希望区域[:：]?\s*([^\n，,。；;]+)", r"想去[^\n的]+(?:柳东|鹿寨|阳和|新兴|河西|柳北)"], section, ""),
            "otherWishes": find_first([r"其他[:：]?\s*([^\n]+)"], section, ""),
        })
    return items


def decode_text_bytes(raw):
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def strip_xml_text(xml_bytes):
    root = ElementTree.fromstring(xml_bytes)
    return "".join(root.itertext())


def extract_docx_text(raw):
    with zipfile.ZipFile(io_bytes(raw)) as archive:
        names = [name for name in archive.namelist() if name.startswith("word/") and name.endswith(".xml")]
        texts = []
        for name in names:
            if name == "word/document.xml" or name.startswith("word/header") or name.startswith("word/footer"):
                texts.append(strip_xml_text(archive.read(name)))
        return "\n".join(texts)


def io_bytes(raw):
    import io
    return io.BytesIO(raw)


def extract_xlsx_text(raw):
    with zipfile.ZipFile(io_bytes(raw)) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in root.findall("x:si", ns):
                shared_strings.append("".join(si.itertext()))

        sheet_names = sorted(name for name in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", name))
        rows = []
        ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        for sheet in sheet_names:
            root = ElementTree.fromstring(archive.read(sheet))
            for row in root.findall(".//x:row", ns):
                cells = []
                for cell in row.findall("x:c", ns):
                    value_node = cell.find("x:v", ns)
                    inline_node = cell.find("x:is", ns)
                    value = ""
                    if inline_node is not None:
                        value = "".join(inline_node.itertext())
                    elif value_node is not None:
                        value = value_node.text or ""
                        if cell.attrib.get("t") == "s" and value.isdigit():
                            index = int(value)
                            value = shared_strings[index] if index < len(shared_strings) else value
                    cells.append(value.strip())
                if any(cells):
                    rows.append(" | ".join(cells))
        return "\n".join(rows)


def extract_uploaded_text(filename, raw):
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json"}:
        return decode_text_bytes(raw)
    if suffix == ".docx":
        return extract_docx_text(raw)
    if suffix == ".xlsx":
        return extract_xlsx_text(raw)
    if suffix == ".xls":
        raise ValueError("暂不支持旧版 .xls，请先另存为 .xlsx 后上传。")
    raise ValueError("暂不支持该文件格式，请上传 .xlsx、.docx、.csv、.txt、.md 或 .json。")


def insert_demand(conn, body, account=None):
    require_login(account)
    account_id = int(account["id"]) if account else int(body.get("accountId") or 0)
    company_key = account.get("companyKey") or normalize_company_key(body.get("company", ""))
    cursor = conn.execute(
        """
        INSERT INTO demands
        (account_id, company_key, company, product, role, type, location, start_date, end_date, headcount, signed, salary, age, gender_required, need_id, need_experience, has_shifts, has_meal, has_dorm, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            account_id,
            company_key,
            body.get("company", "").strip(),
            body.get("product", "").strip(),
            body.get("role", "").strip(),
            body.get("type", "长期工"),
            body.get("location", "").strip(),
            body.get("start", ""),
            body.get("end", ""),
            int(body.get("headcount") or 0),
            int(body.get("signed") or 0),
            body.get("salary", "").strip(),
            body.get("age", "").strip(),
            body.get("genderRequired", body.get("gender_required", "")),
            body.get("needId", body.get("need_id", "")),
            body.get("needExperience", body.get("need_experience", "")),
            body.get("hasShifts", body.get("has_shifts", "")),
            body.get("hasMeal", body.get("has_meal", "")),
            body.get("hasDorm", body.get("has_dorm", "")),
            body.get("notes", "").strip(),
        ),
    )
    return cursor.lastrowid


def _do_insert_worker(conn, body, account_id, company_key):
    """实际写库的逻辑；不做登录校验，由调用者决定。"""
    tags = body.get("tags", [])
    if isinstance(tags, list):
        tags = ", ".join(tags)
    cursor = conn.execute(
        """
        INSERT INTO workers
        (account_id, company_key, name, phone, gender, age, location, available, period, expected_role, salary, score, tags, note, source, registration_date, interview_date, desired_start_date, previous_job, education, has_interviewed, has_employed, employ_date, desired_company, desired_role, accept_shifts, accept_dorm, accept_social_insurance, desired_area, other_wishes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            int(account_id or 0),
            company_key or "",
            body.get("name", "").strip(),
            body.get("phone", "").strip(),
            body.get("gender", "").strip(),
            str(body.get("age", "")).strip(),
            body.get("location", "").strip(),
            body.get("available", "").strip(),
            body.get("period", ""),
            body.get("expectedRole", body.get("expected_role", "")).strip(),
            body.get("salary", "").strip(),
            int(body.get("score") or 70),
            str(tags),
            body.get("note", "").strip(),
            body.get("source", "业务员录入").strip(),
            body.get("registrationDate", body.get("registration_date", "")),
            body.get("interviewDate", body.get("interview_date", "")),
            body.get("desiredStartDate", body.get("desired_start_date", "")),
            body.get("previousJob", body.get("previous_job", "")),
            body.get("education", body.get("education", "")),
            body.get("hasInterviewed", body.get("has_interviewed", "")),
            body.get("hasEmployed", body.get("has_employed", "")),
            body.get("employDate", body.get("employ_date", "")),
            body.get("desiredCompany", body.get("desired_company", "")),
            body.get("desiredRole", body.get("desired_role", "")),
            body.get("acceptShifts", body.get("accept_shifts", "")),
            body.get("acceptDorm", body.get("accept_dorm", "")),
            body.get("acceptSocialInsurance", body.get("accept_social_insurance", "")),
            body.get("desiredArea", body.get("desired_area", "")),
            body.get("otherWishes", body.get("other_wishes", "")),
        ),
    )
    return cursor.lastrowid


def insert_worker(conn, body, account=None):
    require_login(account)
    return _do_insert_worker(
        conn, body,
        account_id=int(account["id"]),
        company_key=account.get("companyKey", ""),
    )


def get_payload(account=None):
    if not account or not account.get("companyKey"):
        return public_demo_payload()
    with connect() as conn:
        demand_where, demand_params = scoped_where(account)
        worker_where, worker_params = scoped_where(account)
        knowledge_where, knowledge_params = scoped_where(account)
        knowledge_where = f"{knowledge_where} AND is_deleted = 0"
        chat_where, chat_params = scoped_where(account)
        demands = [
            row_to_demand(row)
            for row in conn.execute(
                f"SELECT * FROM demands {demand_where} ORDER BY start_date, id",
                demand_params,
            )
        ]
        workers = [
            row_to_worker(row)
            for row in conn.execute(
                f"SELECT * FROM workers {worker_where} ORDER BY id DESC",
                worker_params,
            )
        ]
        chat = [
            dict(row)
            for row in conn.execute(
                f"SELECT role, text FROM chat_messages {chat_where} ORDER BY id",
                chat_params,
            )
        ]
        knowledge = [
            row_to_knowledge(row)
            for row in conn.execute(
                f"SELECT * FROM knowledge_entries {knowledge_where} ORDER BY updated_at DESC, id DESC",
                knowledge_params,
            )
        ]
    return {
        "account": account,
        "demands": demands,
        "workers": workers,
        "chat": chat,
        "knowledge": knowledge,
        "insights": build_insights(demands, workers),
    }


def reset_seed_data(account):
    """只清空并恢复当前租户的数据，避免影响其他企业。"""
    require_login(account)
    if account.get("role") != "owner":
        raise PermissionError("只有老板/管理员可以恢复示例数据。")
    company_key = account["companyKey"]
    account_id = int(account["id"])
    with connect() as conn:
        conn.execute("DELETE FROM chat_messages WHERE company_key = ?", (company_key,))
        conn.execute("DELETE FROM workers WHERE company_key = ?", (company_key,))
        conn.execute("DELETE FROM demands WHERE company_key = ?", (company_key,))
        conn.execute("DELETE FROM knowledge_entries WHERE company_key = ?", (company_key,))
        for demand in DEMANDS:
            conn.execute(
                """
                INSERT INTO demands
                (account_id, company_key, company, role, type, location, start_date, end_date, headcount, signed, salary, age, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    company_key,
                    demand["company"],
                    demand["role"],
                    demand["type"],
                    demand["location"],
                    demand["start"],
                    demand["end"],
                    demand["headcount"],
                    demand["signed"],
                    demand["salary"],
                    demand["age"],
                    demand["notes"],
                ),
            )
        for worker in WORKERS:
            conn.execute(
                """
                INSERT INTO workers
                (account_id, company_key, name, location, available, period, salary, score, tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    company_key,
                    worker["name"],
                    worker["location"],
                    worker["available"],
                    worker["period"],
                    worker["salary"],
                    worker["score"],
                    worker["tags"],
                ),
            )
        conn.execute(
            "INSERT INTO chat_messages (account_id, company_key, role, text) VALUES (?, ?, ?, ?)",
            (
                account_id,
                company_key,
                "assistant",
                "已恢复示例企业用工数据和演示求职者库到当前企业。",
            ),
        )
        sync_knowledge_entries(conn, company_key=company_key)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # 只允许暴露这些静态文件；其余一律 404，防止 server.py / SQLite / .gitignore 等被下载
    _STATIC_ALLOWLIST = {
        "/", "/index.html", "/applicant.html",
        "/app.js", "/applicant.js", "/styles.css",
        "/favicon.ico",
    }

    def do_GET(self):
        parsed = urlparse(self.path)
        account = get_account_from_headers(self.headers)
        if parsed.path == "/api/data":
            self.send_json(get_payload(account))
            return
        if parsed.path == "/api/accounts/list":
            if not account:
                self.send_json({"ok": False, "error": "请先登录"}, status=401)
                return
            with connect() as conn:
                company_key = account.get("companyKey", "")
                rows = conn.execute(
                    "SELECT id, name, role, company, phone FROM accounts WHERE company_key = ? ORDER BY id",
                    (company_key,)
                ).fetchall()
                self.send_json({"ok": True, "accounts": [dict(r) for r in rows]})
            return
        if parsed.path not in self._STATIC_ALLOWLIST:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("Not Found".encode("utf-8"))
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        account = get_account_from_headers(self.headers)
        if parsed.path == "/api/auth/register":
            body = self.read_json()
            name = body.get("name", "").strip()
            password = body.get("password", "")
            company = body.get("company", "").strip()
            role = body.get("role", "owner")
            if not name or not password:
                self.send_json({"ok": False, "error": "账号和密码不能为空"}, status=400)
                return
            if len(password) < 6:
                self.send_json({"ok": False, "error": "密码至少 6 位"}, status=400)
                return
            if not company:
                self.send_json({"ok": False, "error": "企业名称不能为空"}, status=400)
                return
            company_key = normalize_company_key(company)
            if not company_key:
                self.send_json({"ok": False, "error": "企业名称无效，请使用中英文/数字"}, status=400)
                return
            if role not in ALLOWED_ROLES:
                self.send_json({"ok": False, "error": "无效角色"}, status=400)
                return
            token = secrets.token_urlsafe(32)
            with connect() as conn:
                existing = conn.execute(
                    "SELECT id FROM accounts WHERE name = ? AND company_key = ?",
                    (name, company_key),
                ).fetchone()
                if existing:
                    self.send_json({"ok": False, "error": "该企业下已存在同名账号"}, status=400)
                    return
                cursor = conn.execute(
                    """
                    INSERT INTO accounts (name, account_type, role, company_key, company, phone, password_hash, token)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        name,
                        "enterprise",
                        role,
                        company_key,
                        company,
                        body.get("phone", "").strip(),
                        hash_password(password),
                        token,
                    ),
                )
                row = conn.execute("SELECT * FROM accounts WHERE id = ?", (cursor.lastrowid,)).fetchone()
            self.send_json({"ok": True, "account": account_public(row), "data": get_payload(account_public(row))})
            return
        if parsed.path == "/api/auth/login":
            body = self.read_json()
            login_name = body.get("name", "").strip()
            login_company = body.get("company", "").strip()
            with connect() as conn:
                if login_company:
                    company_key = normalize_company_key(login_company)
                    row = conn.execute(
                        "SELECT * FROM accounts WHERE name = ? AND company_key = ?",
                        (login_name, company_key),
                    ).fetchone()
                else:
                    # 兼容老链接：若未指定企业，但全局只有一个同名账号也允许登录
                    rows = conn.execute(
                        "SELECT * FROM accounts WHERE name = ?",
                        (login_name,),
                    ).fetchall()
                    row = rows[0] if len(rows) == 1 else None
                if not row or not verify_password(body.get("password", ""), row["password_hash"]):
                    self.send_json({"ok": False, "error": "账号或密码错误"}, status=401)
                    return
                # 老的 SHA256 哈希在登录成功后顺手升级为 pbkdf2
                if "$" not in (row["password_hash"] or ""):
                    conn.execute(
                        "UPDATE accounts SET password_hash = ? WHERE id = ?",
                        (hash_password(body.get("password", "")), row["id"]),
                    )
                    row = conn.execute("SELECT * FROM accounts WHERE id = ?", (row["id"],)).fetchone()
            self.send_json({"ok": True, "account": account_public(row), "data": get_payload(account_public(row))})
            return
        if parsed.path == "/api/applicant/register":
            # 求职者自助登记：不需要登录，但必须明确指定中介企业
            body = self.read_json()
            target_key = normalize_company_key(body.get("companyKey", "") or body.get("agency", ""))
            if not target_key:
                self.send_json({"ok": False, "error": "缺少中介公司标识，请通过业务员发送的链接登记"}, status=400)
                return
            with connect() as conn:
                agent_row = conn.execute(
                    "SELECT id, company_key FROM accounts WHERE company_key = ? LIMIT 1",
                    (target_key,),
                ).fetchone()
                if not agent_row:
                    self.send_json({"ok": False, "error": "中介公司不存在"}, status=400)
                    return
                name = (body.get("name") or "").strip()
                phone = (body.get("phone") or "").strip()
                location = (body.get("location") or "").strip()
                if not name or not phone or not location:
                    self.send_json({"ok": False, "error": "姓名、手机号、当前地区必填"}, status=400)
                    return
                body["source"] = "求职者自助登记"
                _do_insert_worker(conn, body, account_id=int(agent_row["id"]), company_key=target_key)
                sync_knowledge_entries(conn, company_key=target_key)
            self.send_json({"ok": True})
            return
        if parsed.path == "/api/demands":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再修改信息"}, status=401)
                return
            body = self.read_json()
            with connect() as conn:
                demand_id = insert_demand(conn, body, account)
                sync_knowledge_entries(conn, company_key=account["companyKey"])
            self.send_json({"ok": True, "id": demand_id, "data": get_payload(account)})
            return
        if parsed.path == "/api/fuzzy/parse":
            body = self.read_json()
            text = body.get("text", "")
            if not text.strip():
                self.send_json({"ok": False, "error": "请先粘贴或上传需要识别的文字"}, status=400)
                return
            kind = body.get("kind", "demand")
            items = parse_fuzzy_workers(text) if kind == "worker" else parse_fuzzy_demands(text)
            self.send_json({"ok": True, "items": items})
            return
        if parsed.path == "/api/fuzzy/file":
            try:
                form = self.read_multipart()
                kind = form.get("kind", "demand")
                filename = form.get("filename", "")
                raw = form.get("file", b"")
                if not raw:
                    self.send_json({"ok": False, "error": "没有收到文件"}, status=400)
                    return
                text = extract_uploaded_text(filename, raw)
                if not text.strip():
                    self.send_json({"ok": False, "error": "文件内容为空或无法提取文字"}, status=400)
                    return
                items = parse_fuzzy_workers(text) if kind == "worker" else parse_fuzzy_demands(text)
                self.send_json({"ok": True, "items": items, "text": text[:20000], "filename": filename})
            except Exception as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=400)
            return
        if parsed.path == "/api/fuzzy/import":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再导入信息"}, status=401)
                return
            body = self.read_json()
            items = body.get("items", [])
            kind = body.get("kind", "demand")
            if not isinstance(items, list) or not items:
                self.send_json({"ok": False, "error": "没有可导入的数据"}, status=400)
                return
            ids = []
            with connect() as conn:
                for item in items:
                    ids.append(insert_worker(conn, item, account) if kind == "worker" else insert_demand(conn, item, account))
                sync_knowledge_entries(conn, company_key=account["companyKey"])
            self.send_json({"ok": True, "ids": ids, "data": get_payload(account)})
            return
        if parsed.path == "/api/workers":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再修改信息"}, status=401)
                return
            body = self.read_json()
            with connect() as conn:
                worker_id = insert_worker(conn, body, account)
                sync_knowledge_entries(conn, company_key=account["companyKey"])
            self.send_json({"ok": True, "id": worker_id, "data": get_payload(account)})
            return
        if parsed.path == "/api/chat":
            if not account:
                self.send_json({"ok": False, "error": "请先登录账号后再提问"}, status=401)
                return
            body = self.read_json()
            question = body.get("question", "").strip()
            if not question:
                self.send_json({"ok": False, "error": "问题不能为空"}, status=400)
                return
            # 关键修复：AI 现在基于当前租户的真实数据回答，而不是 demo 数据
            payload = get_payload(account)
            answer = answer_question(question, payload)
            with connect() as conn:
                conn.execute(
                    "INSERT INTO chat_messages (account_id, company_key, role, text) VALUES (?, ?, ?, ?)",
                    (int(account["id"]), account["companyKey"], "user", question),
                )
                conn.execute(
                    "INSERT INTO chat_messages (account_id, company_key, role, text) VALUES (?, ?, ?, ?)",
                    (int(account["id"]), account["companyKey"], "assistant", answer),
                )
            self.send_json({"ok": True, "answer": answer, "data": get_payload(account)})
            return
        if parsed.path == "/api/reset":
            try:
                reset_seed_data(account)
            except PermissionError as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=403)
                return
            self.send_json({"ok": True, "data": get_payload(account)})
            return
        if parsed.path == "/api/knowledge/rebuild":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再重建知识库"}, status=401)
                return
            with connect() as conn:
                # 只清除当前租户的自动同步条目，不影响其他企业
                conn.execute(
                    "DELETE FROM knowledge_entries WHERE entity_type != 'manual' AND company_key = ?",
                    (account["companyKey"],),
                )
                sync_knowledge_entries(conn, company_key=account["companyKey"])
            self.send_json({"ok": True, "data": get_payload(account)})
            return
        if parsed.path == "/api/knowledge/save":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再维护知识库"}, status=401)
                return
            body = self.read_json()
            try:
                with connect() as conn:
                    entry_id = save_knowledge_entry(conn, body, account)
                self.send_json({"ok": True, "id": entry_id, "data": get_payload(account)})
            except Exception as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=400)
            return
        if parsed.path == "/api/knowledge/delete":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再维护知识库"}, status=401)
                return
            body = self.read_json()
            with connect() as conn:
                count = delete_knowledge_entries(conn, [body.get("id")], account)
            self.send_json({"ok": True, "count": count, "data": get_payload(account)})
            return
        if parsed.path == "/api/knowledge/batch-delete":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再维护知识库"}, status=401)
                return
            body = self.read_json()
            with connect() as conn:
                count = delete_knowledge_entries(conn, body.get("ids", []), account)
            self.send_json({"ok": True, "count": count, "data": get_payload(account)})
            return
        if parsed.path == "/api/knowledge/batch-update":
            if not can_write(account):
                self.send_json({"ok": False, "error": "请先登录账号后再维护知识库"}, status=401)
                return
            body = self.read_json()
            with connect() as conn:
                count = batch_update_knowledge_entries(conn, body.get("ids", []), body.get("fields", {}), account)
            self.send_json({"ok": True, "count": count, "data": get_payload(account)})
            return
        self.send_json({"ok": False, "error": "接口不存在"}, status=404)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def read_multipart(self):
        content_type = self.headers.get("Content-Type", "")
        match = re.search(r"boundary=(.+)", content_type)
        if not match:
            raise ValueError("上传格式不正确")
        boundary = ("--" + match.group(1).strip('"')).encode("utf-8")
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > MAX_UPLOAD_BYTES:
            raise ValueError(f"上传文件过大，单次上限 {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
        body = self.rfile.read(length)
        result = {}
        for part in body.split(boundary):
            part = part.strip()
            if not part or part == b"--":
                continue
            if part.endswith(b"--"):
                part = part[:-2].strip()
            header_blob, _, content = part.partition(b"\r\n\r\n")
            headers = decode_text_bytes(header_blob)
            content = content.rstrip(b"\r\n")
            name_match = re.search(r'name="([^"]+)"', headers)
            if not name_match:
                continue
            name = name_match.group(1)
            filename_match = re.search(r'filename="([^"]*)"', headers)
            if filename_match:
                result["filename"] = filename_match.group(1)
                result[name] = content
            else:
                result[name] = decode_text_bytes(content).strip()
        return result

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def remaining(demand):
    return max(int(demand["headcount"]) - int(demand.get("signed") or 0), 0)


def rank_workers(demand, workers):
    ranked = []
    demand_text = f"{demand['company']} {demand['role']} {demand['type']} {demand['location']} {demand['notes']}".lower()
    for worker in workers:
        score = round(int(worker.get("score") or 70) * 0.45)
        reasons = []
        worker_text = f"{worker['location']} {worker['available']} {worker['period']} {' '.join(worker['tags'])}".lower()
        if worker["location"].lower() in demand_text or demand["location"][:2].lower() in worker_text:
            score += 14
            reasons.append("地区接近")
        if any(tag[:2].lower() in demand_text for tag in worker["tags"] if len(tag) >= 2):
            score += 16
            reasons.append("岗位经验匹配")
        if "短期" in demand["type"] and ("暑假" in worker["period"] or "7-15" in worker["period"] or "短期工" in worker["tags"]):
            score += 14
            reasons.append("可做短期")
        if "长期" in demand["type"] and "长期" in worker["period"]:
            score += 14
            reasons.append("适合长期稳定")
        if "夜班" in demand["notes"] and any("夜班" in tag for tag in worker["tags"]):
            score += 12
            reasons.append("接受夜班")
        if "住宿" in demand["notes"] and any("住宿" in tag for tag in worker["tags"]):
            score += 8
            reasons.append("住宿需求一致")
        for keyword in ["包装", "分拣", "质检", "注塑", "物流", "抛光", "坐班"]:
            if keyword in demand["role"] + demand["notes"] and any(keyword in tag for tag in worker["tags"]):
                score += 10
                reasons.append(f"{keyword}匹配")
                break
        ranked.append({"worker": worker, "score": min(score, 100), "reasons": reasons})
    return sorted(ranked, key=lambda item: item["score"], reverse=True)


def answer_question(question, payload):
    q = question.lower()
    demands = payload["demands"]
    workers = payload["workers"]
    knowledge = payload.get("knowledge", [])
    if "知识库" in q:
        categories = {}
        for item in knowledge:
            categories[item["category"]] = categories.get(item["category"], 0) + 1
        detail = "、".join(f"{name}{count}条" for name, count in categories.items())
        return f"当前私有知识库共有 {len(knowledge)} 条知识，包含：{detail or '暂无分类'}。知识来源包括企业需求维护、求职者自助登记和业务员录入。"
    if "周结" in q:
        items = [item for item in demands if "周结" in item["notes"]]
        return format_demand_answer("支持周结的岗位", items, workers)
    if "不用体检" in q or "不体检" in q:
        items = [item for item in demands if "不用体检" in item["notes"] or "不体检" in item["notes"]]
        return format_demand_answer("不用体检或暂不体检的岗位", items, workers)
    if "短期" in q or "下个月" in q:
        items = [item for item in demands if "短期" in item["type"]]
        return format_demand_answer("短期工相关需求", items, workers)
    if "暑假" in q or "季节" in q:
        items = [item for item in demands if item["type"] == "季节工" or "暑假" in item["notes"]]
        return format_demand_answer("适合暑假工或阶段性预招募的岗位", items, workers)
    if "夜班" in q:
        matched = [worker for worker in workers if any("夜班" in tag for tag in worker["tags"])]
        return "适合夜班岗位的人选：\n" + "\n".join(
            f"- {worker['name']}：{worker['location']}，{worker['available']}，标签：{'、'.join(worker['tags'])}" for worker in matched
        )
    if "文案" in q or "招聘" in q:
        target = sorted(demands, key=remaining, reverse=True)[0]
        return (
            f"招聘文案草稿：\n{target['company']}招聘{target['role']}，{target['type']}，需求{target['headcount']}人，"
            f"目前剩余{remaining(target)}个名额。工作地点{target['location']}，薪资{target['salary']}，时间{target['start']}至{target['end'] or '长期'}。"
            f"{target['notes']} 有意向的求职者请联系业务员报名，系统会优先安排匹配度高、可按时到岗的人选。"
        )
    for worker in workers:
        if worker["name"].lower() in q:
            best = sorted(
                [{"demand": demand, **next(item for item in rank_workers(demand, workers) if item["worker"]["id"] == worker["id"])} for demand in demands],
                key=lambda item: item["score"],
                reverse=True,
            )[0]
            demand = best["demand"]
            return (
                f"{worker['name']} 推荐岗位：{demand['company']} {demand['role']}，匹配度 {best['score']} 分。\n"
                f"推荐理由：{'、'.join(best['reasons']) or '基础条件较接近'}。\n"
                f"岗位信息：{demand['location']}，{demand['salary']}，当前缺口 {remaining(demand)} 人。"
            )
    for demand in demands:
        if demand["company"].lower() in q:
            return format_demand_answer(f"{demand['company']} 的用工知识", [item for item in demands if item["company"] == demand["company"]], workers)
    total_gap = sum(remaining(item) for item in demands)
    return f"本地知识库当前有 {len(demands)} 条企业需求、{len(workers)} 名求职者、总缺口 {total_gap} 人。你可以问某家企业有哪些岗位、某个求职者适合去哪、哪些岗位适合暑假工，或者让我生成招聘文案。"


def format_demand_answer(title, items, workers):
    if not items:
        return f"{title}：暂未找到匹配记录。"
    lines = [f"{title}："]
    for item in items:
        matches = "、".join(f"{match['worker']['name']}{match['score']}分" for match in rank_workers(item, workers)[:3])
        lines.append(
            f"- {item['company']} {item['role']}：{item['type']}，{item['start']}至{item['end'] or '长期'}，缺 {remaining(item)} 人，{item['salary']}。建议人选：{matches or '暂无'}"
        )
    return "\n".join(lines)




if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"劳务中介系统已启动：http://127.0.0.1:{port}")
    server.serve_forever()
