# 劳务中介智能客户服务系统项目交接说明

## 1. 项目定位

这是一个帮助劳务中介公司管理企业用工需求、求职者数据库、全年用工日历、模糊采集、私有知识库和岗位推荐的 MVP 系统。

核心目标：

- 企业发布和维护用工需求。
- 求职者自助登记个人求职信息。
- 公司业务员维护企业需求、求职者、调度和知识库。
- 系统把企业需求、求职者信息、业务维护记录沉淀为企业私有知识库。
- 支持模糊采集：粘贴整段文字或上传文件，自动识别企业用工信息或求职者信息。
- 未登录时只展示模拟演示数据；登录后按企业名称加载该企业的私有知识库和真实业务数据。

## 2. 技术栈

- 前端：原生 HTML + CSS + JavaScript
- 后台：Python 标准库 `http.server`
- 数据库：SQLite
- 依赖：无第三方依赖
- 部署：Zeabur 云服务器 SSH 手动部署

## 3. GitHub 和目录

GitHub 仓库：

```text
https://github.com/fucunzhao/renlizhongjie.git
```

本地项目目录：

```text
C:\Users\Administrator\Documents\Codex\2026-05-12\new-chat
```

服务器部署目录：

```text
/www/renlizhongjie
```

SQLite 数据库位置：

```text
/data/renlizhongjie/labor_service.db
```

## 4. 服务器信息

服务器平台：

```text
Zeabur 云服务器
```

公网 IP：

```text
47.81.57.227
```

端口：

```text
8000
```

访问地址：

```text
http://47.81.57.227:8000
```

## 5. 启动、重启和更新

启动：

```bash
cd /www/renlizhongjie
export DATA_DIR=/data/renlizhongjie
export PORT=8000
nohup python3 server.py > app.log 2>&1 &
```

重启：

```bash
cd /www/renlizhongjie
pkill -f "python3 server.py"
export DATA_DIR=/data/renlizhongjie
export PORT=8000
nohup python3 server.py > app.log 2>&1 &
```

服务器更新：

```bash
cd /www/renlizhongjie
git pull
pkill -f "python3 server.py"
export DATA_DIR=/data/renlizhongjie
export PORT=8000
nohup python3 server.py > app.log 2>&1 &
```

本地推送：

```powershell
cd "C:\Users\Administrator\Documents\Codex\2026-05-12\new-chat"
git --git-dir=repo_git --work-tree=. push
```

说明：本地普通 `.git` 目录权限异常，因此使用 `repo_git` 作为 Git 元数据目录。

## 6. 主要文件

- `index.html`：主系统页面
- `applicant.html`：求职者自助登记页面
- `app.js`：主系统前端逻辑
- `applicant.js`：求职者登记页逻辑
- `styles.css`：样式
- `server.py`：后台服务、接口、数据库初始化、模糊解析
- `Dockerfile`：容器部署配置
- `zeabur.json`：Zeabur 配置
- `README.md`：项目说明

## 7. 当前已实现功能

- 总览看板
- 全年用工日历
- 企业需求管理
- 求职者库
- 求职者自助登记页面 `/applicant.html`
- AI 本地知识库助手原型
- 私有知识库页面
- 知识库新增、修改、删除、批量删除、批量修改
- 模糊采集：
  - 企业用工信息采集
  - 求职者信息采集
- 文件上传识别：
  - `.xlsx`
  - `.docx`
  - `.csv`
  - `.txt`
  - `.md`
  - `.json`
- 账号管理：
  - 老板/管理员
  - 业务员
  - 调度员
  - 客服人员
- 同一企业名称下多个子账号共享同一个企业私有知识库。
- 未登录时只显示模拟演示数据，不能修改任何信息。
- 登录后加载该企业名称对应的真实私有知识库和业务数据。

## 8. 账号和权限逻辑

- 注册时必须填写企业名称。
- 同一企业名称会生成同一个 `company_key`。
- 同一 `company_key` 下的多个账号共享同一个企业私有知识库。
- 未登录只能看到模拟数据。
- 登录后只能看到当前企业 `company_key` 下的数据。
- 写操作必须登录。

角色：

- 老板/管理员：查看全部数据、业绩、客户、员工权限。
- 业务员：管理自己负责的企业和求职者。
- 调度员：负责人员安排、面试、到岗、回访。
- 客服人员：负责初步沟通、信息录入、自动回复维护。

当前 MVP 已有角色字段和基本写权限校验，后续还需要进一步细化每个角色的具体按钮和接口权限。

## 9. 数据库设计

SQLite 主要表：

- `accounts`：账号表
- `demands`：企业用工需求
- `workers`：求职者信息
- `knowledge_entries`：私有知识库条目
- `chat_messages`：AI 助手对话记录

知识库逻辑：

- 企业需求自动沉淀为“企业岗位规则”。
- 求职者信息自动沉淀为“求职者画像”。
- 人工可以新增普通知识条目。
- 删除企业岗位规则会同步删除对应企业需求。
- 删除求职者画像会同步删除对应求职者。
- 总览、全年用工日历、企业需求、求职者库都要基于有效知识库和业务数据呈现。

## 10. 重要业务规则

- 企业用工需求要按日历排期，形成全年用工规划。
- 全年用工规划可以推荐给求职者。
- 引入 AI 大模型用于辅助梳理本地知识库，但第一、第二阶段先不用大模型也能实现。
- 知识库要通过用户注册、企业发布、业务员维护、求职者登记、模糊采集不断自动丰富。
- 模糊采集要支持上传文件和整段文字。
- 企业账号有自己的私有知识库。
- 企业下可以有多个子账号，不同角色权限不同。

## 11. 后续建议开发

- 增加企业需求编辑功能。
- 增加求职者编辑功能。
- 增加报名、面试、到岗、在岗、离职状态流转。
- 增加调度任务中心。
- 增加回访提醒。
- 增加企业端发布需求页面。
- 更细权限控制。
- 接入真实 AI 大模型：
  - 企业简章解析
  - 求职者画像提取
  - 知识库问答
  - 岗位推荐解释
  - 招聘文案生成
- 增加 HTTPS 和域名绑定。
- 后期可考虑从 SQLite 升级到 PostgreSQL/MySQL。
