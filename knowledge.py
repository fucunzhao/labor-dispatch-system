"""知识库 CRUD 和同步"""
from models import row_to_demand, row_to_worker


def upsert_knowledge_entry(conn, category, title, summary, source, entity_type, entity_id, tags, confidence=80, account_id=0, company_key=""):
    tags_text = ", ".join(tags) if isinstance(tags, list) else str(tags or "")
    existing = conn.execute(
        "SELECT id FROM knowledge_entries WHERE entity_type = ? AND entity_id = ? AND category = ? AND company_key = ?",
        (entity_type, entity_id, category, company_key),
    ).fetchone()
    if existing:
        conn.execute(
            """UPDATE knowledge_entries
               SET title = ?, summary = ?, source = ?, tags = ?, confidence = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (title, summary, source, tags_text, confidence, existing["id"]),
        )
    else:
        conn.execute(
            """INSERT INTO knowledge_entries
               (account_id, company_key, category, title, summary, source, entity_type, entity_id, tags, confidence)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (account_id, company_key, category, title, summary, source, entity_type, entity_id, tags_text, confidence),
        )


def demand_knowledge(row):
    demand = row_to_demand(row)
    tags = [
        demand["type"], demand["location"], demand["role"],
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
        "category": "企业岗位规则", "title": f"{demand['company']}｜{demand['role']}",
        "summary": summary, "source": "企业需求维护",
        "entity_type": "demand", "entity_id": demand["id"],
        "tags": tags, "confidence": 90,
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
        "category": "求职者画像", "title": f"{worker['name']}｜{worker['location']}｜{worker['period']}",
        "summary": summary, "source": worker["source"] or "求职者维护",
        "entity_type": "worker", "entity_id": worker["id"],
        "tags": tags, "confidence": 82,
        "account_id": worker.get("accountId", 0) or 0,
        "company_key": worker.get("companyKey", "") or "",
    }


def sync_knowledge_entries(conn, company_key=None):
    if company_key is None:
        conn.execute("""UPDATE demands SET company_key = lower(replace(company, ' ', '')) WHERE (company_key IS NULL OR company_key = '') AND account_id = 0""")
        demand_rows = conn.execute("SELECT * FROM demands").fetchall()
        worker_rows = conn.execute("SELECT * FROM workers").fetchall()
    else:
        demand_rows = conn.execute("SELECT * FROM demands WHERE company_key = ?", (company_key,)).fetchall()
        worker_rows = conn.execute("SELECT * FROM workers WHERE company_key = ?", (company_key,)).fetchall()
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
    from auth import require_login
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
            f"""UPDATE knowledge_entries SET category = ?, title = ?, summary = ?, source = ?, tags = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND is_deleted = 0 {scope_sql}""",
            (*values, entry_id, *scope_values),
        )
        return entry_id
    cursor = conn.execute(
        """INSERT INTO knowledge_entries (account_id, company_key, category, title, summary, source, entity_type, entity_id, tags, confidence)
           VALUES (?, ?, ?, ?, ?, ?, 'manual', 0, ?, ?)""",
        (int(account["id"]), account.get("companyKey", ""), *values[:-1], values[4], values[5]),
    )
    return cursor.lastrowid


def delete_knowledge_entries(conn, ids, account):
    from auth import require_login
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
            conn.execute("DELETE FROM demands WHERE id = ? AND company_key = ?", (row["entity_id"], tenant_key))
        if row["entity_type"] == "worker" and row["entity_id"]:
            conn.execute("DELETE FROM workers WHERE id = ? AND company_key = ?", (row["entity_id"], tenant_key))
    conn.execute(
        f"UPDATE knowledge_entries SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders}) {scope_sql}",
        (*clean_ids, *scope_values),
    )
    return len(rows)


def batch_update_knowledge_entries(conn, ids, fields, account):
    from auth import require_login
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
