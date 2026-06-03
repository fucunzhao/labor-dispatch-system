"""账号/认证相关 API 路由"""
import secrets
import re
from urllib.parse import urlparse
from db import connect
from auth import (
    OWNER_REGISTER_CODE, ALLOWED_ROLES, normalize_company_key,
    hash_password, account_public, check_role,
    generate_sms_code, store_sms_code, send_sms_code,
    verify_sms_code, change_account_password, reset_account_password,
    get_account_from_headers,
)
from data import get_payload


def handle_accounts_list(handler, account):
    if not check_role(account, "owner"):
        handler.send_json({"ok": False, "error": "仅老板/管理员可查看账号列表"}, status=403)
        return
    with connect() as conn:
        company_key = account.get("companyKey", "")
        rows = conn.execute("SELECT id, name, role, company, phone FROM accounts WHERE company_key = ? ORDER BY id", (company_key,)).fetchall()
        handler.send_json({"ok": True, "accounts": [dict(r) for r in rows]})


def handle_register(handler, body):
    phone = body.get("phone", "").strip()
    code = body.get("code", "").strip()
    password = body.get("password", "")
    company = body.get("company", "").strip()
    name = body.get("name", "").strip() or phone
    role = body.get("role", "owner")
    if not phone or not re.match(r"^1\d{10}$", phone):
        handler.send_json({"ok": False, "error": "请输入正确的11位手机号"}, status=400)
        return
    if not code:
        handler.send_json({"ok": False, "error": "请输入短信验证码"}, status=400)
        return
    if len(password) < 6:
        handler.send_json({"ok": False, "error": "密码至少 6 位"}, status=400)
        return
    if not company:
        handler.send_json({"ok": False, "error": "企业名称不能为空"}, status=400)
        return
    company_key = normalize_company_key(company)
    if not company_key:
        handler.send_json({"ok": False, "error": "企业名称无效，请使用中英文/数字"}, status=400)
        return
    if role not in ALLOWED_ROLES:
        handler.send_json({"ok": False, "error": "无效角色"}, status=400)
        return
    if role == "owner":
        owner_code = body.get("ownerCode", "").strip()
        if owner_code != OWNER_REGISTER_CODE:
            handler.send_json({"ok": False, "error": f"老板验证码错误，请向系统管理员申请权限后再注册（提示：默认码 {OWNER_REGISTER_CODE}）"}, status=400)
            return
    token = secrets.token_urlsafe(32)
    with connect() as conn:
        if not verify_sms_code(conn, phone, code):
            handler.send_json({"ok": False, "error": "验证码错误或已过期"}, status=400)
            return
        existing = conn.execute("SELECT id FROM accounts WHERE phone = ?", (phone,)).fetchone()
        if existing:
            handler.send_json({"ok": False, "error": "该手机号已注册"}, status=400)
            return
        cursor = conn.execute(
            """INSERT INTO accounts (name, account_type, role, company_key, company, phone, password_hash, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (name, "enterprise", role, company_key, company, phone, hash_password(password), token),
        )
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (cursor.lastrowid,)).fetchone()
    handler.send_json({"ok": True, "account": account_public(row), "data": get_payload(account_public(row))})


def handle_login(handler, body):
    login_phone = body.get("phone", "").strip()
    login_name = body.get("name", "").strip()
    password = body.get("password", "")
    login_company = body.get("company", "").strip()
    with connect() as conn:
        row = None
        if login_phone:
            row = conn.execute("SELECT * FROM accounts WHERE phone = ?", (login_phone,)).fetchone()
        elif login_name:
            if login_company:
                company_key = normalize_company_key(login_company)
                row = conn.execute("SELECT * FROM accounts WHERE name = ? AND company_key = ?", (login_name, company_key)).fetchone()
            else:
                rows = conn.execute("SELECT * FROM accounts WHERE name = ?", (login_name,)).fetchall()
                row = rows[0] if len(rows) == 1 else None
        if not row:
            handler.send_json({"ok": False, "error": "手机号/账号或密码错误"}, status=401)
            return
        from auth import verify_password
        if not verify_password(password, row["password_hash"]):
            handler.send_json({"ok": False, "error": "手机号/账号或密码错误"}, status=401)
            return
        if "$" not in (row["password_hash"] or ""):
            conn.execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
            row = conn.execute("SELECT * FROM accounts WHERE id = ?", (row["id"],)).fetchone()
        if not row["phone"] and login_phone:
            conn.execute("UPDATE accounts SET phone = ? WHERE id = ?", (login_phone, row["id"]))
            row = conn.execute("SELECT * FROM accounts WHERE id = ?", (row["id"],)).fetchone()
    handler.send_json({"ok": True, "account": account_public(row), "data": get_payload(account_public(row))})


def handle_send_code(handler, body):
    phone = body.get("phone", "").strip()
    if not phone or not re.match(r"^1\d{10}$", phone):
        handler.send_json({"ok": False, "error": "请输入正确的11位手机号"}, status=400)
        return
    code = generate_sms_code()
    with connect() as conn:
        store_sms_code(conn, phone, code)
    send_sms_code(phone, code)
    handler.send_json({"ok": True, "msg": "验证码已发送（测试模式自动通过）"})


def handle_reset_password(handler, body):
    phone = body.get("phone", "").strip()
    code = body.get("code", "").strip()
    new_password = body.get("newPassword", "")
    if not phone or not code or not new_password:
        handler.send_json({"ok": False, "error": "请完整填写手机号、验证码和新密码"}, status=400)
        return
    if len(new_password) < 6:
        handler.send_json({"ok": False, "error": "密码至少 6 位"}, status=400)
        return
    with connect() as conn:
        row = conn.execute("SELECT id FROM accounts WHERE phone = ?", (phone,)).fetchone()
        if not row:
            handler.send_json({"ok": False, "error": "该手机号未注册"}, status=400)
            return
        if not verify_sms_code(conn, phone, code):
            handler.send_json({"ok": False, "error": "验证码错误或已过期"}, status=400)
            return
        reset_account_password(conn, phone, new_password)
    handler.send_json({"ok": True, "msg": "密码已重置，请用新密码登录"})


def handle_change_password(handler, account, body):
    if not account:
        handler.send_json({"ok": False, "error": "请先登录"}, status=401)
        return
    old_password = body.get("oldPassword", "")
    new_password = body.get("newPassword", "")
    if not old_password or not new_password:
        handler.send_json({"ok": False, "error": "请填写原密码和新密码"}, status=400)
        return
    if len(new_password) < 6:
        handler.send_json({"ok": False, "error": "新密码至少 6 位"}, status=400)
        return
    with connect() as conn:
        if not change_account_password(conn, account["id"], old_password, new_password):
            handler.send_json({"ok": False, "error": "原密码错误"}, status=400)
            return
    handler.send_json({"ok": True, "msg": "密码修改成功"})


def handle_profile_update(handler, account, body):
    if not account:
        handler.send_json({"ok": False, "error": "请先登录"}, status=401)
        return
    new_name = body.get("name", "").strip()
    new_phone = body.get("phone", "").strip()
    with connect() as conn:
        if new_name:
            conn.execute("UPDATE accounts SET name = ? WHERE id = ?", (new_name, account["id"]))
        if new_phone and re.match(r"^1\d{10}$", new_phone):
            existing = conn.execute("SELECT id FROM accounts WHERE phone = ? AND id != ?", (new_phone, account["id"])).fetchone()
            if existing:
                handler.send_json({"ok": False, "error": "该手机号已被其他账号使用"}, status=400)
                return
            conn.execute("UPDATE accounts SET phone = ? WHERE id = ?", (new_phone, account["id"]))
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account["id"],)).fetchone()
    handler.send_json({"ok": True, "account": account_public(row), "msg": "资料更新成功"})
