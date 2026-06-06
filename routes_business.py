"""业务相关 API 路由（demands, workers, pipeline, knowledge, fuzzy, chat）"""
from db import connect
from auth import check_role, require_login, scoped_where
from models import row_to_demand, row_to_worker, row_to_knowledge
from knowledge import (
    save_knowledge_entry, delete_knowledge_entries,
    batch_update_knowledge_entries, sync_knowledge_entries,
    knowledge_scope_clause,
)
from data import get_payload, reset_seed_data, mask_phone
from fuzzy import (
    parse_fuzzy_demands, parse_fuzzy_workers,
    extract_uploaded_text, extract_xlsx_text,
    parse_xlsx_demands, parse_xlsx_workers,
)


# ── 数据插入辅助 ──────────────────────────────────
def _do_insert_worker(conn, body, account_id, company_key):
    tags = body.get("tags", [])
    if isinstance(tags, list):
        tags = ", ".join(tags)
    sql = ("INSERT INTO workers (account_id, company_key, name, phone, gender, age, location, "
           "available, period, expected_role, salary, score, tags, note, source, "
           "registration_date, interview_date, desired_start_date, previous_job, education, "
           "has_interviewed, has_employed, employ_date, desired_company, desired_role, "
           "accept_shifts, accept_dorm, accept_social_insurance, desired_area, other_wishes) "
           "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    cursor = conn.execute(sql, (int(account_id or 0), company_key or "", body.get("name", "").strip(), body.get("phone", "").strip(), body.get("gender", "").strip(), str(body.get("age", "")).strip(), body.get("location", "").strip(), body.get("available", "").strip(), body.get("period", ""), body.get("expectedRole", body.get("expected_role", "")).strip(), body.get("salary", "").strip(), int(body.get("score") or 70), str(tags), body.get("note", "").strip(), body.get("source", "\u4e1a\u52a1\u8fd0\u8425\u4e13\u5458\u5f55\u5165").strip(), body.get("registrationDate", body.get("registration_date", "")), body.get("interviewDate", body.get("interview_date", "")), body.get("desiredStartDate", body.get("desired_start_date", "")), body.get("previousJob", body.get("previous_job", "")), body.get("education", body.get("education", "")), body.get("hasInterviewed", body.get("has_interviewed", "")), body.get("hasEmployed", body.get("has_employed", "")), body.get("employDate", body.get("employ_date", "")), body.get("desiredCompany", body.get("desired_company", "")), body.get("desiredRole", body.get("desired_role", "")), body.get("acceptShifts", body.get("accept_shifts", "")), body.get("acceptDorm", body.get("accept_dorm", "")), body.get("acceptSocialInsurance", body.get("accept_social_insurance", "")), body.get("desiredArea", body.get("desired_area", "")), body.get("otherWishes", body.get("other_wishes", ""))))
    return cursor.lastrowid


def insert_demand(conn, body, account=None):
    require_login(account)
    account_id = int(account["id"]) if account else int(body.get("accountId") or 0)
    from auth import normalize_company_key
    company_key = account.get("companyKey") or normalize_company_key(body.get("company", ""))
    cursor = conn.execute(
        """INSERT INTO demands (account_id, company_key, company, product, role, type, location, start_date, end_date, headcount, signed, salary, age, gender_required, need_id, need_experience, has_shifts, has_meal, has_dorm, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (account_id, company_key, body.get("company", "").strip(), body.get("product", "").strip(), body.get("role", "").strip(), body.get("type", "长期工"), body.get("location", "").strip(), body.get("start", ""), body.get("end", ""), int(body.get("headcount") or 0), int(body.get("signed") or 0), body.get("salary", "").strip(), body.get("age", "").strip(), body.get("genderRequired", body.get("gender_required", "")), body.get("needId", body.get("need_id", "")), body.get("needExperience", body.get("need_experience", "")), body.get("hasShifts", body.get("has_shifts", "")), body.get("hasMeal", body.get("has_meal", "")), body.get("hasDorm", body.get("has_dorm", "")), body.get("notes", "").strip()),
    )
    return cursor.lastrowid


def insert_worker(conn, body, account=None):
    require_login(account)
    return _do_insert_worker(conn, body, account_id=int(account["id"]), company_key=account.get("companyKey", ""))


# ── GET handlers ──────────────────────────────────
def handle_get_data(handler, account):
    handler.send_json(get_payload(account))


def handle_get_pipeline(handler, account):
    if not account:
        handler.send_json({"ok": False, "error": "请先登录"}, status=401)
        return
    demand_id = handler.path.split("demand_id=")[-1].split("&")[0] if "demand_id=" in handler.path else ""
    with connect() as conn:
        if demand_id and demand_id.isdigit():
            rows = conn.execute(
                """SELECT p.*, w.name as worker_name, w.phone as worker_phone, d.company as demand_company, d.role as demand_role
                   FROM recruitment_pipeline p LEFT JOIN workers w ON p.worker_id = w.id LEFT JOIN demands d ON p.demand_id = d.id
                   WHERE p.demand_id = ? AND p.company_key = ? ORDER BY p.created_at DESC""",
                (int(demand_id), account.get("companyKey", "")),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT p.*, w.name as worker_name, w.phone as worker_phone, d.company as demand_company, d.role as demand_role
                   FROM recruitment_pipeline p LEFT JOIN workers w ON p.worker_id = w.id LEFT JOIN demands d ON p.demand_id = d.id
                   WHERE p.company_key = ? ORDER BY p.created_at DESC LIMIT 100""",
                (account.get("companyKey", ""),),
            ).fetchall()
        pipeline = []
        for r in rows:
            item = dict(r)
            if not item.get("phone_revealed"):
                item["worker_phone"] = mask_phone(item.get("worker_phone", ""))
            pipeline.append(item)
        handler.send_json({"ok": True, "pipeline": pipeline})


def handle_get_pipeline_list(handler, account):
    if not account:
        handler.send_json({"ok": False, "error": "未登录"}, status=401)
        return
    qs = {}
    if "?" in handler.path:
        for part in handler.path.split("?", 1)[1].split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                qs[k] = v
    status_filter = qs.get("status", "")
    with connect() as conn:
        base_sql = """SELECT p.*, d.company AS demand_company, d.role AS demand_role, d.salary AS demand_salary,
                      d.location AS demand_location, d.type AS demand_type, d.headcount, d.signed AS demand_signed,
                      d.start_date, d.end_date, d.notes AS demand_notes,
                      w.name AS worker_name, w.phone AS worker_phone, w.gender AS worker_gender,
                      w.age AS worker_age, w.location AS worker_location, w.available, w.score AS worker_score,
                      w.note AS worker_note
                      FROM recruitment_pipeline p
                      LEFT JOIN demands d ON p.demand_id = d.id
                      LEFT JOIN workers w ON p.worker_id = w.id
                      WHERE p.company_key = ?"""
        params_list = [account["companyKey"]]
        if status_filter:
            base_sql += " AND p.status = ?"
            params_list.append(status_filter)
        base_sql += " ORDER BY p.updated_at DESC"
        rows = conn.execute(base_sql, params_list).fetchall()
    pipelines = []
    for row in rows:
        r = dict(row)
        pipelines.append({
            "id": r["id"], "demand_id": r["demand_id"], "worker_id": r["worker_id"],
            "company_key": r["company_key"], "status": r["status"], "assigned_by": r["assigned_by"],
            "contacted_at": r["contacted_at"] or "", "interviewed_at": r["interviewed_at"] or "",
            "onboarded_at": r["onboarded_at"] or "", "stationed_at": r["stationed_at"] or "",
            "departed_at": r["departed_at"] or "", "notes": r["notes"] or "",
            "interview_invite_sent": r["interview_invite_sent"], "worker_accepted": r["worker_accepted"],
            "phone_revealed": r["phone_revealed"], "created_at": r["created_at"], "updated_at": r["updated_at"],
            "demand_company": r.get("demand_company", ""), "demand_role": r.get("demand_role", ""),
            "demand_salary": r.get("demand_salary", ""), "demand_location": r.get("demand_location", ""),
            "demand_type": r.get("demand_type", ""), "headcount": r.get("headcount", 0),
            "demand_signed": r.get("demand_signed", 0), "start_date": r.get("start_date", ""),
            "end_date": r.get("end_date", ""), "demand_notes": r.get("demand_notes", ""),
            "worker_name": r.get("worker_name", ""), "worker_phone": r.get("worker_phone", ""),
            "worker_gender": r.get("worker_gender", ""), "worker_age": r.get("worker_age", ""),
            "worker_location": r.get("worker_location", ""), "worker_available": r.get("available", ""),
            "worker_score": r.get("worker_score", 0), "worker_note": r.get("worker_note", ""),
        })
    handler.send_json({"ok": True, "pipelines": pipelines})


# ── POST handlers ─────────────────────────────────
def handle_post_demands(handler, account, body):
    if not check_role(account, "owner", "sales"):
        handler.send_json({"ok": False, "error": "仅老板/业务运营专员可管理企业需求"}, status=403)
        return
    with connect() as conn:
        demand_id = insert_demand(conn, body, account)
        sync_knowledge_entries(conn, company_key=account["companyKey"])
    handler.send_json({"ok": True, "id": demand_id, "data": get_payload(account)})


def handle_post_workers(handler, account, body):
    if not check_role(account, "owner", "sales", "service"):
        handler.send_json({"ok": False, "error": "仅老板/业务运营专员/客服可管理求职者"}, status=403)
        return
    with connect() as conn:
        worker_id = insert_worker(conn, body, account)
        sync_knowledge_entries(conn, company_key=account["companyKey"])
    handler.send_json({"ok": True, "id": worker_id, "data": get_payload(account)})


def handle_post_fuzzy_parse(handler, body):
    text = body.get("text", "")
    if not text.strip():
        handler.send_json({"ok": False, "error": "请先粘贴或上传需要识别的文字"}, status=400)
        return
    kind = body.get("kind", "demand")
    items = parse_fuzzy_workers(text) if kind == "worker" else parse_fuzzy_demands(text)
    handler.send_json({"ok": True, "items": items})


def handle_post_fuzzy_import(handler, account, body):
    items = body.get("items", [])
    kind = body.get("kind", "demand")
    if not isinstance(items, list) or not items:
        handler.send_json({"ok": False, "error": "没有可导入的数据"}, status=400)
        return
    ids = []
    with connect() as conn:
        for item in items:
            ids.append(insert_worker(conn, item, account) if kind == "worker" else insert_demand(conn, item, account))
        sync_knowledge_entries(conn, company_key=account["companyKey"])
    handler.send_json({"ok": True, "ids": ids, "data": get_payload(account)})


def handle_post_pipeline_assign(handler, account, body):
    if not check_role(account, "owner", "sales"):
        handler.send_json({"ok": False, "error": "仅老板/业务运营专员可分配岗位"}, status=403)
        return
    demand_id = int(body.get("demand_id") or 0)
    worker_id = int(body.get("worker_id") or 0)
    if not demand_id or not worker_id:
        handler.send_json({"ok": False, "error": "缺少需求ID或求职者ID"}, status=400)
        return
    company_key = account["companyKey"]
    with connect() as conn:
        # 校验 demand / worker 都属于当前租户，防越权 + 防空指针
        demand_row = conn.execute(
            "SELECT company, role FROM demands WHERE id = ? AND company_key = ?",
            (demand_id, company_key)
        ).fetchone()
        if not demand_row:
            handler.send_json({"ok": False, "error": "企业需求不存在或无权访问"}, status=404)
            return
        worker_row = conn.execute(
            "SELECT name FROM workers WHERE id = ? AND company_key = ?",
            (worker_id, company_key)
        ).fetchone()
        if not worker_row:
            handler.send_json({"ok": False, "error": "求职者不存在或无权访问"}, status=404)
            return
        # 全局唯一活跃检查
        active = conn.execute(
            """SELECT rp.id, d.company, d.role FROM recruitment_pipeline rp
               JOIN demands d ON d.id = rp.demand_id
               WHERE rp.worker_id = ? AND rp.company_key = ? AND rp.status NOT IN ('departed')""",
            (worker_id, company_key)
        ).fetchone()
        if active:
            handler.send_json({"ok": False, "error": f"该求职者已有活跃流程（{active['company']} · {active['role']}），请先结束当前流程再重新分配"}, status=409)
            return
        # 插入新流程记录
        cur = conn.execute(
            """INSERT INTO recruitment_pipeline (demand_id, worker_id, company_key, status, assigned_by, created_at, updated_at)
               VALUES (?, ?, ?, 'assigned', ?, datetime('now'), datetime('now'))""",
            (demand_id, worker_id, company_key, account["id"])
        )
        pipeline_id = cur.lastrowid
        conn.execute(
            "UPDATE demands SET signed = signed + 1 WHERE id = ? AND company_key = ?",
            (demand_id, company_key)
        )
        content = f"分配至【{demand_row['company']} · {demand_row['role']}】"
        conn.execute(
            """INSERT INTO pipeline_events (pipeline_id, company_key, operator_id, operator_name, event_type, from_status, to_status, content)
               VALUES (?, ?, ?, ?, 'status_change', '', 'assigned', ?)""",
            (pipeline_id, company_key, account["id"], account.get("name", ""), content)
        )
    handler.send_json({"ok": True})


def handle_post_pipeline_status(handler, account, body):
    if not check_role(account, "owner", "dispatcher"):
        handler.send_json({"ok": False, "error": "仅老板/招聘专员可推进招聘流程"}, status=403)
        return
    pipeline_id = int(body.get("pipeline_id") or 0)
    new_status = body.get("status", "")
    note = body.get("note", "").strip()  # C方案：支持手动备注
    valid_statuses = {"assigned", "contacted", "interviewed", "onboarded", "stationed", "departed"}
    if not pipeline_id or new_status not in valid_statuses:
        handler.send_json({"ok": False, "error": "参数无效"}, status=400)
        return
    col_map = {"contacted": "contacted_at", "interviewed": "interviewed_at", "onboarded": "onboarded_at", "stationed": "stationed_at", "departed": "departed_at"}
    if new_status in col_map:
        with connect() as conn:
            row = conn.execute(
                "SELECT status FROM recruitment_pipeline WHERE id = ? AND company_key = ?",
                (pipeline_id, account["companyKey"])
            ).fetchone()
            if not row:
                handler.send_json({"ok": False, "error": "流程不存在"}, status=404)
                return
            old_status = row["status"]
            conn.execute(
                f"UPDATE recruitment_pipeline SET status = ?, {col_map[new_status]} = datetime('now'), updated_at = datetime('now') WHERE id = ? AND company_key = ?",
                (new_status, pipeline_id, account["companyKey"])
            )
            # C方案：自动写入状态变更事件
            status_label = {"assigned": "已分配", "contacted": "已联系", "interviewed": "已面试", "onboarded": "已入职", "stationed": "已上岗", "departed": "已离职"}
            content = f"状态从【{status_label.get(old_status, old_status)}】推进到【{status_label.get(new_status, new_status)}】"
            if note:
                content += f"。备注：{note}"
            conn.execute(
                """INSERT INTO pipeline_events (pipeline_id, company_key, operator_id, operator_name, event_type, from_status, to_status, content)
                   VALUES (?, ?, ?, ?, 'status_change', ?, ?, ?)""",
                (pipeline_id, account["companyKey"], account["id"], account.get("name", ""), old_status, new_status, content)
            )
        handler.send_json({"ok": True})
    else:
        handler.send_json({"ok": False, "error": "无效状态"}, status=400)


def handle_post_pipeline_note(handler, account, body):
    """C方案：手动添加备注到服务记录"""
    if not check_role(account, "owner", "dispatcher", "sales"):
        handler.send_json({"ok": False, "error": "无操作权限"}, status=403)
        return
    pipeline_id = int(body.get("pipeline_id") or 0)
    note = body.get("note", "").strip()
    if not pipeline_id or not note:
        handler.send_json({"ok": False, "error": "缺少流程ID或备注内容"}, status=400)
        return
    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM recruitment_pipeline WHERE id = ? AND company_key = ?",
            (pipeline_id, account["companyKey"])
        ).fetchone()
        if not row:
            handler.send_json({"ok": False, "error": "流程不存在"}, status=404)
            return
        conn.execute(
            """INSERT INTO pipeline_events (pipeline_id, company_key, operator_id, operator_name, event_type, from_status, to_status, content)
               VALUES (?, ?, ?, ?, 'note', '', '', ?)""",
            (pipeline_id, account["companyKey"], account["id"], account.get("name", ""), note)
        )
    handler.send_json({"ok": True})


def handle_get_pipeline_events(handler, account, params):
    """获取某流程的完整服务记录历史"""
    pipeline_id = int(params.get("pipeline_id", [0])[0])
    if not pipeline_id:
        handler.send_json({"ok": False, "error": "缺少pipeline_id"}, status=400)
        return
    with connect() as conn:
        rows = conn.execute(
            """SELECT * FROM pipeline_events WHERE pipeline_id = ? AND company_key = ? ORDER BY created_at ASC""",
            (pipeline_id, account["companyKey"])
        ).fetchall()
    events = [dict(r) for r in rows]
    handler.send_json({"ok": True, "events": events})


def handle_post_knowledge_save(handler, account, body):
    if not check_role(account, "owner", "service"):
        handler.send_json({"ok": False, "error": "仅老板/客服可维护知识库"}, status=403)
        return
    try:
        with connect() as conn:
            entry_id = save_knowledge_entry(conn, body, account)
        handler.send_json({"ok": True, "id": entry_id, "data": get_payload(account)})
    except Exception as exc:
        handler.send_json({"ok": False, "error": str(exc)}, status=400)


def handle_post_knowledge_delete(handler, account, body):
    if not check_role(account, "owner", "service"):
        handler.send_json({"ok": False, "error": "仅老板/客服可删除知识库"}, status=403)
        return
    with connect() as conn:
        count = delete_knowledge_entries(conn, [body.get("id")], account)
    handler.send_json({"ok": True, "count": count, "data": get_payload(account)})


def handle_post_knowledge_batch_delete(handler, account, body):
    if not check_role(account, "owner", "service"):
        handler.send_json({"ok": False, "error": "仅老板/客服可批量删除知识库"}, status=403)
        return
    with connect() as conn:
        count = delete_knowledge_entries(conn, body.get("ids", []), account)
    handler.send_json({"ok": True, "count": count, "data": get_payload(account)})


def handle_post_knowledge_batch_update(handler, account, body):
    if not check_role(account, "owner", "service"):
        handler.send_json({"ok": False, "error": "仅老板/客服可批量修改知识库"}, status=403)
        return
    with connect() as conn:
        count = batch_update_knowledge_entries(conn, body.get("ids", []), body.get("fields", {}), account)
    handler.send_json({"ok": True, "count": count, "data": get_payload(account)})


def handle_post_knowledge_rebuild(handler, account):
    with connect() as conn:
        sync_knowledge_entries(conn, company_key=account["companyKey"])
    handler.send_json({"ok": True, "data": get_payload(account)})


def handle_chat(handler, account, body):
    question = body.get("question", "").strip()
    if not question:
        handler.send_json({"ok": False, "error": "请输入您的问题"}, status=400)
        return
    import sqlite3
    with connect() as conn:
        conn.execute("INSERT INTO chat_messages (account_id, company_key, role, text) VALUES (?, ?, 'user', ?)", (int(account["id"]), account.get("companyKey", ""), question))
        demand_where, demand_params = scoped_where(account)
        worker_where, worker_params = scoped_where(account)
        knowledge_where, knowledge_params = scoped_where(account)
        knowledge_where = f"{knowledge_where} AND is_deleted = 0"
        demands = [row_to_demand(row) for row in conn.execute(f"SELECT * FROM demands {demand_where} ORDER BY start_date, id", demand_params)]
        workers = [row_to_worker(row) for row in conn.execute(f"SELECT * FROM workers {worker_where} ORDER BY id DESC", worker_params)]
        knowledge = [row_to_knowledge(row) for row in conn.execute(f"SELECT * FROM knowledge_entries {knowledge_where} ORDER BY updated_at DESC, id DESC", knowledge_params)]
    # Simple keyword-matching response
    q = question.lower()
    answer_parts = []
    for d in demands:
        # 过滤空串后再匹配，避免 "" in q 永远 True，导致每条 demand 都被命中
        kws = [k.lower() for k in (d.get("company"), d.get("role"), d.get("location")) if k and k.strip()]
        if kws and any(kw in q for kw in kws):
            gap = max(int(d["headcount"]) - int(d.get("signed") or 0), 0)
            answer_parts.append(f"【{d['company']}】招聘{d['role']}，{d['type']}，地点{d['location']}，薪资{d['salary']}，缺{gap}人。{(d.get('notes') or '')[:200]}")
            if len(answer_parts) >= 3:
                break
    if not answer_parts:
        for d in demands:
            gap = max(int(d["headcount"]) - int(d.get("signed") or 0), 0)
            if gap > 0:
                answer_parts.append(f"【{d['company']}】{d['role']}，薪资{d['salary']}，缺{gap}人。")
                if len(answer_parts) >= 5:
                    break
    if not answer_parts:
        answer_parts.append("当前暂无匹配的企业需求。您可以在企业需求页面新增需求，或在求职者库中录入候选人信息。")
    answer = "\n\n".join(answer_parts)
    with connect() as conn:
        conn.execute("INSERT INTO chat_messages (account_id, company_key, role, text) VALUES (?, ?, 'assistant', ?)", (int(account["id"]), account.get("companyKey", ""), answer))
    handler.send_json({"ok": True, "data": get_payload(account)})


# ── 人员分派 ────────────────────────────────────
def handle_get_assignments(handler, account):
    if not check_role(account, "owner"):
        handler.send_json({"ok": False, "error": "仅老板可管理分派"}, status=403)
        return
    handler.send_json({"ok": True, "data": get_payload(account)})


def handle_post_assign_auto(handler, account, body):
    if not check_role(account, "owner"):
        handler.send_json({"ok": False, "error": "仅老板可自动分派"}, status=403)
        return
    entity_type = body.get("entityType", "demand")  # 'demand' or 'worker'
    target_role = "sales" if entity_type == "demand" else "dispatcher"
    with connect() as conn:
        company_key = account["companyKey"]
        # 获取所有目标角色的账号
        target_users = conn.execute(
            "SELECT id, name FROM accounts WHERE company_key = ? AND role = ? ORDER BY id",
            (company_key, target_role)
        ).fetchall()
        if not target_users:
            handler.send_json({"ok": False, "error": f"没有{target_role}角色的账号可分配"})
            return
        # 获取每个目标账号当前已分配的数量（用于负载均衡）
        user_loads = {}
        for u in target_users:
            cnt = conn.execute(
                "SELECT COUNT(*) as c FROM assignments WHERE company_key = ? AND entity_type = ? AND assigned_to = ?",
                (company_key, entity_type, u["id"])
            ).fetchone()["c"]
            user_loads[u["id"]] = {"name": u["name"], "count": cnt}
        # 找出所有未分配的需求/求职者
        id_field = "id"
        table = "demands" if entity_type == "demand" else "workers"
        unassigned = conn.execute(
            f"SELECT t.id, t.{'company' if entity_type == 'demand' else 'name'} as name "
            f"FROM {table} t "
            f"WHERE company_key = ? AND t.id NOT IN (SELECT entity_id FROM assignments WHERE company_key = ? AND entity_type = ?) ",
            (company_key, company_key, entity_type)
        ).fetchall()
        if not unassigned:
            handler.send_json({"ok": True, "msg": "所有数据已分配完毕", "data": get_payload(account)})
            return
        # 按负载从低到高排序，轮询分配
        sorted_users = sorted(target_users, key=lambda u: user_loads[u["id"]]["count"])
        idx = 0
        for item in unassigned:
            user_id = sorted_users[idx % len(sorted_users)]["id"]
            conn.execute(
                "INSERT OR IGNORE INTO assignments (company_key, entity_type, entity_id, assigned_to, assigned_by) VALUES (?, ?, ?, ?, ?)",
                (company_key, entity_type, item["id"], user_id, account["id"])
            )
            idx += 1
    handler.send_json({"ok": True, "msg": f"已自动分配 {len(unassigned)} 条{entity_type}", "data": get_payload(account)})


def handle_post_assign_manual(handler, account, body):
    if not check_role(account, "owner"):
        handler.send_json({"ok": False, "error": "仅老板可手动分派"}, status=403)
        return
    entity_type = body.get("entityType", "")
    entity_ids = body.get("entityIds", [])
    target_user_id = int(body.get("assignedTo") or 0)
    if entity_type not in ("demand", "worker") or not entity_ids or not target_user_id:
        handler.send_json({"ok": False, "error": "参数错误"})
        return
    with connect() as conn:
        company_key = account["companyKey"]
        for eid in entity_ids:
            conn.execute(
                "INSERT OR REPLACE INTO assignments (company_key, entity_type, entity_id, assigned_to, assigned_by) VALUES (?, ?, ?, ?, ?)",
                (company_key, entity_type, int(eid), target_user_id, account["id"])
            )
    handler.send_json({"ok": True, "data": get_payload(account)})


def handle_delete_assignment(handler, account, body):
    if not check_role(account, "owner"):
        handler.send_json({"ok": False, "error": "仅老板可删除分派"}, status=403)
        return
    assignment_id = int(body.get("id") or 0)
    if not assignment_id:
        handler.send_json({"ok": False, "error": "缺少分派ID"})
        return
    with connect() as conn:
        conn.execute("DELETE FROM assignments WHERE id = ? AND company_key = ?", (assignment_id, account["companyKey"]))
    handler.send_json({"ok": True, "data": get_payload(account)})


def handle_reset(handler, account):
    require_login(account)
    if not check_role(account, "owner"):
        handler.send_json({"ok": False, "error": "只有老板/管理员可以恢复示例数据"}, status=403)
        return
    reset_seed_data(account)
    handler.send_json({"ok": True, "data": get_payload(account)})
