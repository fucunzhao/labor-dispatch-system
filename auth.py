"""密码哈希、短信验证码、账号管理和权限校验"""
import hashlib
import secrets
import re
import os
import datetime as _dt

PBKDF2_ITERATIONS = 200_000
OWNER_REGISTER_CODE = "12345"
ALLOWED_ROLES = {"owner", "sales", "dispatcher", "service"}
_COMPANY_KEY_CHAR_RE = re.compile(r"[a-z0-9一-鿿_\-]")
SMS_CODE_TTL = 300  # 5分钟
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB

# 短信配置
SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "mock")
SMS_SECRET_ID = os.environ.get("SMS_SECRET_ID", "")
SMS_SECRET_KEY = os.environ.get("SMS_SECRET_KEY", "")
SMS_SDK_APP_ID = os.environ.get("SMS_SDK_APP_ID", "")
SMS_TEMPLATE_ID = os.environ.get("SMS_TEMPLATE_ID", "")
SMS_SIGN = os.environ.get("SMS_SIGN", "")


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


def _now_iso():
    return _dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def generate_sms_code():
    return str(secrets.randbelow(900000) + 100000)


def send_sms_code(phone, code):
    if SMS_PROVIDER == "mock":
        print(f"[SMS MOCK] 验证码已发送至 {phone}：{code}")
        return True
    if SMS_PROVIDER == "tencent":
        print(f"[SMS TENCNET] 发送验证码 {code} 至 {phone}")
        return True
    return False


def store_sms_code(conn, phone, code):
    expires = _dt.datetime.utcnow() + _dt.timedelta(seconds=SMS_CODE_TTL)
    conn.execute(
        "INSERT INTO sms_codes (phone, code, expires_at) VALUES (?, ?, ?)",
        (phone, code, expires.strftime("%Y-%m-%d %H:%M:%S")),
    )


def verify_sms_code(conn, phone, code, sms_provider="mock"):
    if sms_provider == "mock":
        return True
    rows = conn.execute(
        """SELECT id FROM sms_codes
           WHERE phone = ? AND code = ? AND used = 0 AND expires_at > ?
           ORDER BY id DESC LIMIT 1""",
        (phone, code, _now_iso()),
    ).fetchall()
    if not rows:
        return False
    conn.execute("UPDATE sms_codes SET used = 1 WHERE id = ?", (rows[0]["id"],))
    return True


def change_account_password(conn, account_id, old_password, new_password):
    row = conn.execute(
        "SELECT password_hash FROM accounts WHERE id = ?", (account_id,)
    ).fetchone()
    if not row or not verify_password(old_password, row["password_hash"]):
        return False
    conn.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (hash_password(new_password), account_id),
    )
    return True


def reset_account_password(conn, phone, new_password):
    conn.execute(
        "UPDATE accounts SET password_hash = ? WHERE phone = ?",
        (hash_password(new_password), phone),
    )


def normalize_company_key(company):
    raw = re.sub(r"\s+", "", (company or "").strip()).lower()
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
    from db import connect
    auth = headers.get("Authorization", "")
    token = auth.replace("Bearer ", "").strip()
    if not token:
        return None
    with connect() as conn:
        row = conn.execute("SELECT * FROM accounts WHERE token = ?", (token,)).fetchone()
        return account_public(row)


def scoped_where(account, table_alias=""):
    prefix = f"{table_alias}." if table_alias else ""
    if account and account.get("companyKey"):
        return f"WHERE {prefix}company_key = ?", [account["companyKey"]]
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


def check_role(account, *required_roles):
    if not account:
        return False
    if not required_roles:
        return True
    return account.get("role") in required_roles
