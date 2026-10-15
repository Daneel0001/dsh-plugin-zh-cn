/**
 * 内置词表：185 个 DSH 插件（官方内置包 + 常见的第三方插件）的
 * 简体中文标题与描述。键是「裸包名」，与已安装插件的目录名一致。
 *
 * 词表由人工逐条翻译并校验：键集合覆盖 asar 内全部 @deepseek-ai 包，以及
 * 桌面上常见的第三方插件。每个条目都带 title 与 description；
 * 未收录的包一律保持原样，绝不会被改写。
 *
 * 第一条是本插件自己的条目（自举）：插件列表里的这一行同样显示中文。
 */
export const BUILT_IN_PHRASES = {
  "dsh-plugin-zh-cn": {
    "title": "插件简体中文化",
    "description": "把已安装插件的显示名与描述以简体中文呈现。"
  },
  "@deepseek-ai/cordis-plugin-timer": {
    "title": "定时器服务",
    "description": "为 Cordis 提供定时器服务"
  },
  "@deepseek-ai/dsh-agent": {
    "title": "智能体核心",
    "description": "DeepSeek Harness 的智能体接口、注册表、发起方作用域与事件词汇表"
  },
  "@deepseek-ai/dsh-agent-default-model": {
    "title": "默认模型",
    "description": "各智能体入口共用的默认模型选择"
  },
  "@deepseek-ai/dsh-agent-instructions": {
    "title": "指令加载",
    "description": "加载工作区中 AGENTS.md/CLAUDE.md 指令文件的上下文"
  },
  "@deepseek-ai/dsh-agent-loop": {
    "title": "智能体循环",
    "description": "DeepSeek Harness 的具体智能体循环插件"
  },
  "@deepseek-ai/dsh-agent-preset-registry": {
    "title": "预设注册表",
    "description": "声明式智能体预设注册表与基于配置档的编辑"
  },
  "@deepseek-ai/dsh-api-account-controller": {
    "title": "账户接口",
    "description": "在已认证的 Remote 上暴露安全的账户操作"
  },
  "@deepseek-ai/dsh-api-gateway": {
    "title": "API 网关",
    "description": "Typert Remote Host 分发器与客户端 API 端点"
  },
  "@deepseek-ai/dsh-api-job-controller": {
    "title": "作业接口",
    "description": "作业的 Remote 观测流与引用计数的客户端作业输出服务"
  },
  "@deepseek-ai/dsh-api-remotes": {
    "title": "远程装配",
    "description": "按应用所选 Host 能力组装 Remote BFF"
  },
  "@deepseek-ai/dsh-api-session-controller": {
    "title": "会话接口",
    "description": "Session 的 Remote 命令、冷读取与实时控制传输"
  },
  "@deepseek-ai/dsh-api-settings-controller": {
    "title": "设置接口",
    "description": "基于设置域抽象层的配置界面的 Remote 归属方"
  },
  "@deepseek-ai/dsh-api-terminal-controller": {
    "title": "终端接口",
    "description": "会话持有的交互式终端，含 shell 发现、屏幕恢复与强类型 Remote 控制"
  },
  "@deepseek-ai/dsh-api-workspace-controller": {
    "title": "工作区接口",
    "description": "工作区的 Remote 命令与可安全重连的状态传输"
  },
  "@deepseek-ai/dsh-api-workspace-files": {
    "title": "工作区文件",
    "description": "工作区文件服务与客户端资源提供方：受限读取、目录列举，以及 workspaceFiles Remote 命名空间上的实时元数据"
  },
  "@deepseek-ai/dsh-attachment-local": {
    "title": "本地附件",
    "description": "DSH_HOME 下私有、按内容寻址的附件存储"
  },
  "@deepseek-ai/dsh-authorization": {
    "title": "授权抽象层",
    "description": "授权抽象层（ctx.authorization）：由插件拥有的流程，通过与人类对话获取凭据"
  },
  "@deepseek-ai/dsh-bash-sandbox": {
    "title": "Bash 沙箱",
    "description": "DeepSeek Harness bash 执行抽象层的沙箱实现：经 ctx.sandbox 约束每条命令，并上报拒绝与执行结果事实"
  },
  "@deepseek-ai/dsh-client-connection": {
    "title": "连接传输",
    "description": "已认证的 RPC 传输与生成生命周期"
  },
  "@deepseek-ai/dsh-client-file-upload": {
    "title": "文件上传",
    "description": "面向智能体作用域的浏览器文件上传、流式接收与暂存回执服务"
  },
  "@deepseek-ai/dsh-client-hmr": {
    "title": "热重载",
    "description": "Web 客户端依赖图同步与重建插件包的重新加载传输"
  },
  "@deepseek-ai/dsh-client-locale": {
    "title": "语言区域",
    "description": "语言区域插件：Host 支撑的偏好、可扩展语言目录、浏览器回退与强类型内置词典"
  },
  "@deepseek-ai/dsh-client-modules": {
    "title": "客户端模块",
    "description": "客户端模块系统（双面）：node 面组装 __DSH_BOOT__ 入口图，浏览器面是内置 cordis Loader 消费的惰性 CJS 模块表"
  },
  "@deepseek-ai/dsh-client-product-analytics": {
    "title": "产品分析",
    "description": "桌面端产品事件采集与经认证的 Host 上报"
  },
  "@deepseek-ai/dsh-client-resources": {
    "title": "客户端资源",
    "description": "统一客户端资源模型：按协议注册的提供方把 URL 地址转为实时值，经 useResource 全局标准钩子消费"
  },
  "@deepseek-ai/dsh-client-shortcuts": {
    "title": "快捷键",
    "description": "应用键盘命令注册表与物理按键路由"
  },
  "@deepseek-ai/dsh-client-ui-agent-preset": {
    "title": "预设界面",
    "description": "智能体预设界面：后续会话的默认值、本会话的席位，以及组合编辑器"
  },
  "@deepseek-ai/dsh-client-ui-approval": {
    "title": "审批界面",
    "description": "基于作用域 Remote Event 瀑布的审批输入框接管"
  },
  "@deepseek-ai/dsh-client-ui-attachment": {
    "title": "附件界面",
    "description": "面向对话输入、消息图片与轨迹图片插槽的动态附件展示插件"
  },
  "@deepseek-ai/dsh-client-ui-brand-official": {
    "title": "官方品牌",
    "description": "Web 客户端侧边栏插槽的 DeepSeek Harness 官方品牌占位"
  },
  "@deepseek-ai/dsh-client-ui-chat": {
    "title": "聊天界面",
    "description": "Chat 会话目标、节点定义、渲染器与详情界面"
  },
  "@deepseek-ai/dsh-client-ui-commands": {
    "title": "命令界面",
    "description": "客户端命令界面：全局目录缓存、'/' 来源、三种命令 UI 类型与 popupSelect 注册表"
  },
  "@deepseek-ai/dsh-client-ui-conversation": {
    "title": "会话界面",
    "description": "目标中立的会话组装、外壳、输入框、队列与视图导航"
  },
  "@deepseek-ai/dsh-client-ui-cordis": {
    "title": "插件定义卡",
    "description": "Cordis 动态插件定义卡片：带运行与停止开关的键控 cordis_define 工具行"
  },
  "@deepseek-ai/dsh-client-ui-deliverables": {
    "title": "交付物",
    "description": "变更文件卡片，含逐文件对比标签页、交付卡片，以及 Web 中可点击的最终回复文件引用"
  },
  "@deepseek-ai/dsh-client-ui-goal": {
    "title": "目标界面",
    "description": "会话目标界面：停靠在输入框上方的 GoalBar，数据来自目标会话投影"
  },
  "@deepseek-ai/dsh-client-ui-input-trigger": {
    "title": "输入触发",
    "description": "输入触发管线：'/' 与 '@' 检测、候选菜单，以及到已注册来源的选择路由"
  },
  "@deepseek-ai/dsh-client-ui-jobs": {
    "title": "后台作业",
    "description": "会话头部的后台作业列表，可按需展开流式记录面板"
  },
  "@deepseek-ai/dsh-client-ui-layout": {
    "title": "界面布局",
    "description": "外壳插件：带拖拽手柄的三栏 AppFrame，以及 ctx.layout 视图状态服务（导航与面板）"
  },
  "@deepseek-ai/dsh-client-ui-message-feedback": {
    "title": "消息反馈",
    "description": "Web 反馈界面：助手消息赞踩与 /feedback 弹窗，基于 messageFeedback、sessionFeedback Host Remote"
  },
  "@deepseek-ai/dsh-client-ui-model-selection": {
    "title": "模型选择",
    "description": "基于共享模型目录、Session 投影与 session.selectModel 的模型选择"
  },
  "@deepseek-ai/dsh-client-ui-open-in-app": {
    "title": "外部打开",
    "description": "Web 的「打开方式」控件：会话头部拆分按钮用已安装应用打开工作区目录，文档预览则用默认应用打开单个文件"
  },
  "@deepseek-ai/dsh-client-ui-permission-presets": {
    "title": "权限预设",
    "description": "权限界面：通用设置中的新会话默认值，以及基于权限投影的当前会话 /permission 弹窗"
  },
  "@deepseek-ai/dsh-client-ui-plan": {
    "title": "计划模式",
    "description": "计划模式控件、常驻轨迹的计划卡片以及侧边栏 Markdown 预览"
  },
  "@deepseek-ai/dsh-client-ui-plugin-manager": {
    "title": "插件管理",
    "description": "dsh web 客户端的插件管理：侧边栏插件面板可安装、启用、停用、重试并组合已安装的插件包"
  },
  "@deepseek-ai/dsh-client-ui-reference": {
    "title": "引用来源",
    "description": "统一的 Web @file 与 @session 引用来源"
  },
  "@deepseek-ai/dsh-client-ui-renderer": {
    "title": "界面渲染器",
    "description": "浏览器 UI 渲染器：React 插槽绑定、ctx.uiRenderer 以及组装好的应用根节点"
  },
  "@deepseek-ai/dsh-client-ui-session": {
    "title": "会话适配",
    "description": "面向 React 与会话级插槽的 Session Controller 适配器"
  },
  "@deepseek-ai/dsh-client-ui-settings": {
    "title": "设置基础",
    "description": "设置域基础插件：共享配置表单与规范化的设置插槽类型契约"
  },
  "@deepseek-ai/dsh-client-ui-settings-account": {
    "title": "账户设置",
    "description": "管理 DeepSeek 登录，并打开 Platform 账单页面"
  },
  "@deepseek-ai/dsh-client-ui-settings-agent-loop": {
    "title": "智能体循环",
    "description": "dsh web 客户端插件页面中智能体循环的设置页：agent-loop 命名空间的并行工具调用上限"
  },
  "@deepseek-ai/dsh-client-ui-settings-general": {
    "title": "通用设置",
    "description": "设置的无主副本与产品引导插件：通用分区、外壳触发与头部界面内容、设置词典，以及带版本的欢迎提示"
  },
  "@deepseek-ai/dsh-client-ui-settings-models": {
    "title": "模型设置",
    "description": "基于现有设置与凭据联接的模型设置及共享产品引导对话框"
  },
  "@deepseek-ai/dsh-client-ui-settings-plugin-inventory": {
    "title": "插件清单",
    "description": "Web 插件设置中的只读 Cordis Loader 清单标签页"
  },
  "@deepseek-ai/dsh-client-ui-settings-plugins": {
    "title": "插件设置",
    "description": "dsh web 客户端的内置插件设置分区：设置导航入口，以及各功能自有标签页注册的标签界面"
  },
  "@deepseek-ai/dsh-client-ui-settings-session-log": {
    "title": "会话日志",
    "description": "通用设置中控制会话日志随 DeepSeek API 请求上传的开关"
  },
  "@deepseek-ai/dsh-client-ui-settings-shell": {
    "title": "命令执行",
    "description": "dsh web 客户端插件页面中 shell 执行器的设置页：shell 命名空间的命令超时与单流输出上限"
  },
  "@deepseek-ai/dsh-client-ui-settings-subagent": {
    "title": "子智能体",
    "description": "dsh web 客户端插件页面中 Subagent 委派的设置页：递归深度、并行容量，以及智能体可为子智能体选择的模型"
  },
  "@deepseek-ai/dsh-client-ui-settings-web-search": {
    "title": "联网搜索",
    "description": "dsh web 客户端插件页面中 DeepSeek 网络搜索提供方的设置页：其 API key、端点与单次请求搜索配额"
  },
  "@deepseek-ai/dsh-client-ui-shortcuts": {
    "title": "快捷键",
    "description": "键盘快捷键查阅、录制与本地偏好编辑"
  },
  "@deepseek-ai/dsh-client-ui-sidebar": {
    "title": "侧边栏",
    "description": "侧边栏插件：会话多级树、搜索、分组与状态圆点"
  },
  "@deepseek-ai/dsh-client-ui-sidebar-browser": {
    "title": "浏览器标签页",
    "description": "右侧边栏的沙箱化 Web 浏览器标签页"
  },
  "@deepseek-ai/dsh-client-ui-sidebar-documentpreview": {
    "title": "文档预览",
    "description": "可扩展的侧边栏预览，支持 Office 文档、表格、Markdown、代码、图片、PDF、HTML 与纯文本"
  },
  "@deepseek-ai/dsh-client-ui-sidebar-files": {
    "title": "文件树",
    "description": "右侧边栏的工作区文件树标签类型：通过 workspaceFiles Remote 命名空间惰性列出目录，并把文件打开到侧边栏"
  },
  "@deepseek-ai/dsh-client-ui-sidebar-right": {
    "title": "右侧边栏",
    "description": "右侧边栏：停靠界面的会话绑定状态、其面板与头部展开控件，以及其上的导航服务"
  },
  "@deepseek-ai/dsh-client-ui-sidebar-terminal": {
    "title": "终端标签页",
    "description": "右侧边栏的交互式 shell 标签页"
  },
  "@deepseek-ai/dsh-client-ui-skill": {
    "title": "技能引用",
    "description": "Web 端的技能引用与专用的技能工具行"
  },
  "@deepseek-ai/dsh-client-ui-subagent": {
    "title": "子智能体",
    "description": "子智能体会话目录、续接路由界面与「@」引用来源"
  },
  "@deepseek-ai/dsh-client-ui-theme": {
    "title": "主题外观",
    "description": "主题插件：为插件加载前的调色板提供 Host 引导；无 DOM 的 ThemeRuntime 管理浅色/深色/跟随系统；--dsw-* token 与外观设置"
  },
  "@deepseek-ai/dsh-client-ui-tool": {
    "title": "工具调用",
    "description": "客户端工具调用树渲染器与按键区分的单工具展示插槽"
  },
  "@deepseek-ai/dsh-client-ui-trajectory": {
    "title": "轨迹视图",
    "description": "轨迹事件账本与交互式耗时总览：注册进会话 ViewMap 的纯消费型插件（无服务）"
  },
  "@deepseek-ai/dsh-client-ui-user-questions": {
    "title": "用户提问",
    "description": "Web 端 ask_user_question 的输入框接管与计划评审展示界面"
  },
  "@deepseek-ai/dsh-client-ui-workflow-run": {
    "title": "工作流运行",
    "description": "dsh web 的持久化工作流运行会话节点与嵌套成员展开"
  },
  "@deepseek-ai/dsh-client-ui-workspace": {
    "title": "工作区选择",
    "description": "工作区选择器插件：将一个 WorkspacePicker 注册进侧边栏与空状态的工作区插槽"
  },
  "@deepseek-ai/dsh-command-compact": {
    "title": "会话压缩命令",
    "description": "面向人工的斜杠命令，用于显式压缩当前会话"
  },
  "@deepseek-ai/dsh-command-feedback": {
    "title": "反馈命令",
    "description": "仅写日志的会话反馈：记录事件、sessionFeedback Host Remote 与面向人工的斜杠命令"
  },
  "@deepseek-ai/dsh-command-goal": {
    "title": "目标命令",
    "description": "面向人工的斜杠命令，用于持久化的同会话目标"
  },
  "@deepseek-ai/dsh-commands": {
    "title": "命令注册表",
    "description": "插件自有的人工命令注册表，供 DeepSeek Harness 各 UI 使用"
  },
  "@deepseek-ai/dsh-compaction-basic": {
    "title": "基础压缩",
    "description": "由 token 计量驱动的压缩策略，以及 DeepSeek Harness 的 LLM 摘要后端"
  },
  "@deepseek-ai/dsh-compaction-image-offload": {
    "title": "图片卸载",
    "description": "面向支持图片的路由提供持久化图片卸载：把超预算的请求图片替换为占位符后重试"
  },
  "@deepseek-ai/dsh-compaction-tool-result-pruner": {
    "title": "工具结果裁剪",
    "description": "对工具结果表面节点做可安全重放、无需模型的首/中/尾裁剪"
  },
  "@deepseek-ai/dsh-config-editor": {
    "title": "配置编辑器",
    "description": "通过配置档补丁与 Loader 协调来持久化插件配置"
  },
  "@deepseek-ai/dsh-cordis-client-runner": {
    "title": "浏览器半运行器",
    "description": "动态双半插件包的浏览器半部分：事件订阅、闭包求值、守卫外观与加载器条目"
  },
  "@deepseek-ai/dsh-cordis-host-runner": {
    "title": "宿主半运行器",
    "description": "动态插件包定义注册表、宿主半部分沙箱生命周期，以及面向模型挂载双半插件的调用处理表"
  },
  "@deepseek-ai/dsh-credentials-local": {
    "title": "本地凭据",
    "description": "基于文件的凭据提供方（实时进程环境下的 $DSH_HOME/.env），供 DeepSeek Harness 使用"
  },
  "@deepseek-ai/dsh-deepseek-account-platform": {
    "title": "账号授权平台",
    "description": "通过浏览器 PKCE 为 DeepSeek 账号授权"
  },
  "@deepseek-ai/dsh-deepseek-llm-api-extensions": {
    "title": "LLM API 扩展",
    "description": "官方 DeepSeek LLM API 适配器的增量请求字段注册表"
  },
  "@deepseek-ai/dsh-experimental-api-speech-to-text": {
    "title": "语音转写 API",
    "description": "面向浏览器客户端的、需鉴权的实验性语音转写"
  },
  "@deepseek-ai/dsh-experimental-auto-review": {
    "title": "自动授权审查",
    "description": "面向 DeepSeek Harness Auto 权限预设的逐工具 LLM 授权审查"
  },
  "@deepseek-ai/dsh-experimental-client-ui-voice-input": {
    "title": "语音输入",
    "description": "录制语音并把可编辑文本插入对话草稿"
  },
  "@deepseek-ai/dsh-experimental-speech-to-text": {
    "title": "语音识别",
    "description": "实验性语音识别，提供方可独立选择"
  },
  "@deepseek-ai/dsh-experimental-speech-to-text-sensevoice": {
    "title": "SenseVoice 转写",
    "description": "本地 SenseVoice ONNX 转写，配合受管托管的 sherpa-onnx 进程"
  },
  "@deepseek-ai/dsh-file-reference-local": {
    "title": "本地文件引用",
    "description": "本地文件系统的 ctx.fileReferences 提供方，带有限模糊索引"
  },
  "@deepseek-ai/dsh-fs-observation-policy": {
    "title": "文件观测策略",
    "description": "文件上下文策略插件：经 fs/* 事件闸门在 ctx.fs 抽象层上实现观测状态、先读后写与版本守卫的写入/编辑"
  },
  "@deepseek-ai/dsh-fs-sandbox": {
    "title": "文件系统沙箱",
    "description": "DeepSeek Harness 文件系统抽象层的沙箱化实现：按每次调用的沙箱模式约束写/改（只读拒绝改动，工作区写限定在工作区与临时根目录内），读取直接放行"
  },
  "@deepseek-ai/dsh-goal": {
    "title": "目标服务",
    "description": "DeepSeek Harness 中基于事件溯源的同会话目标状态与生命周期服务"
  },
  "@deepseek-ai/dsh-goal-round-driver": {
    "title": "目标轮次驱动",
    "description": "带竞态防护的同会话目标轮次驱动器"
  },
  "@deepseek-ai/dsh-hmr": {
    "title": "热重载",
    "description": "协调模块与配置档配置的热重载"
  },
  "@deepseek-ai/dsh-host-directory-picker-auto": {
    "title": "目录选择器",
    "description": "目录选择器抽象层的自适应选择器：启动时判断宿主环境，为 DeepSeek Harness Web GUI 宿主挂载原生或浏览后端"
  },
  "@deepseek-ai/dsh-host-open-in-app": {
    "title": "应用内打开",
    "description": "open-in-app 的宿主半部分：已解析的应用目录、图标与启动端点，作为三条 webServer 路由"
  },
  "@deepseek-ai/dsh-host-plugin-inventory": {
    "title": "插件清单",
    "description": "当前 Cordis Loader 插件状态的只读远程投影"
  },
  "@deepseek-ai/dsh-host-product-telemetry-otel": {
    "title": "OTLP 遥测",
    "description": "通过 OpenTelemetry HTTP 日志导出显式产品使用事件"
  },
  "@deepseek-ai/dsh-host-webserver": {
    "title": "Web 服务器",
    "description": "Web 路由注册插件：HTTP 与升级路由、索引转换挂载点以及静态 dist 兜底；不感知任何 harness 概念"
  },
  "@deepseek-ai/dsh-jobs-local": {
    "title": "本地后台作业",
    "description": "DeepSeek Harness 后台作业注册表抽象层的进程内实现"
  },
  "@deepseek-ai/dsh-llm": {
    "title": "LLM 服务",
    "description": "DeepSeek Harness 中提供方中立的 LLM 服务接口"
  },
  "@deepseek-ai/dsh-llm-deepseek-account": {
    "title": "DeepSeek 账号认证",
    "description": "DeepSeek 账号提供方的认证与发现"
  },
  "@deepseek-ai/dsh-llm-deepseek-api-key": {
    "title": "DeepSeek API 密钥",
    "description": "DeepSeek API 密钥提供方的认证与发现"
  },
  "@deepseek-ai/dsh-llm-pi-ai": {
    "title": "pi-ai 适配器",
    "description": "基于 pi-ai 的 DeepSeek 适配器，用于 DeepSeek Harness 的 LLM 抽象层（dsh-llm-deepseek 的设计验证孪生体）"
  },
  "@deepseek-ai/dsh-llm-retry": {
    "title": "LLM 重试",
    "description": "DeepSeek Harness 中按提供方路由的 LLM 请求重试策略"
  },
  "@deepseek-ai/dsh-mcp-resources": {
    "title": "MCP 资源",
    "description": "通过共享模型工具进行带作用域的 MCP 资源发现与读取"
  },
  "@deepseek-ai/dsh-message-feedback": {
    "title": "消息反馈",
    "description": "针对已定稿助手消息的规范 Session 日志评分与备注"
  },
  "@deepseek-ai/dsh-office-to-pdf": {
    "title": "Office 转 PDF",
    "description": "共享的 Office 转 PDF 转换，带有限队列与缓存"
  },
  "@deepseek-ai/dsh-otel": {
    "title": "OTLP 遥测",
    "description": "Cordis 服务，提供彼此独立的普通事件通道与字节上限的 Session 日志 OTLP 通道"
  },
  "@deepseek-ai/dsh-permission-presets": {
    "title": "权限预设",
    "description": "面向用户的权限预设 (ctx.permissionPresets)：一个产品级权限选择器，捆绑沙箱模式与审批策略开关，并写入各自的会话事件"
  },
  "@deepseek-ai/dsh-plan-mode": {
    "title": "计划模式",
    "description": "按智能体记录的计划模式，含部署指引、直接斜杠命令与用户审阅后退出"
  },
  "@deepseek-ai/dsh-plugin-manager": {
    "title": "插件管理",
    "description": "当前配置档的插件与插件包管理，由 dsh CLI、Web 与智能体工具共用"
  },
  "@deepseek-ai/dsh-plugin-package-inventory-deepseek": {
    "title": "插件包清单",
    "description": "面向官方 DeepSeek LLM API 请求的、由 Loader 支撑的活跃插件包清单"
  },
  "@deepseek-ai/dsh-ptc-runtime-node": {
    "title": "PTC 运行时",
    "description": "DeepSeek Harness PTC 执行能力的沙箱化 Node 进程实现"
  },
  "@deepseek-ai/dsh-pwsh-sandbox": {
    "title": "PowerShell 沙箱",
    "description": "DeepSeek Harness PowerShell 执行器抽象层的沙箱化实现，经 ctx.sandbox 约束每条命令并上报拒绝与执行结果"
  },
  "@deepseek-ai/dsh-repeat-tool-reminder": {
    "title": "重复调用提醒",
    "description": "重复工具调用防护插件：智能体在相同工具调用上空转时给出提示性提醒"
  },
  "@deepseek-ai/dsh-sandbox-local": {
    "title": "本地沙箱",
    "description": "本地进程沙箱后端：bwrap、landlock-run、macOS Seatbelt、Windows ACL 受限令牌运行器，均经探测且失败即关闭"
  },
  "@deepseek-ai/dsh-sandbox-policy": {
    "title": "沙箱策略",
    "description": "每次调用的沙箱策略解析器与当前模型上下文：部署回退，加上各会话的模式与工作区根目录"
  },
  "@deepseek-ai/dsh-session": {
    "title": "会话存储",
    "description": "DeepSeek Harness 的事件溯源会话存储"
  },
  "@deepseek-ai/dsh-session-checkpoint-policy": {
    "title": "会话检查点",
    "description": "在模型请求与工具副作用之前写入的语义化会话持久性检查点"
  },
  "@deepseek-ai/dsh-session-log-deepseek": {
    "title": "会话日志扩展",
    "description": "面向官方 DeepSeek LLM API 的增量无损会话日志请求扩展"
  },
  "@deepseek-ai/dsh-session-log-export": {
    "title": "日志导出",
    "description": "Web Session 日志导出命令与共享下载对话框"
  },
  "@deepseek-ai/dsh-session-persistence-jsonl": {
    "title": "JSONL 持久化",
    "description": "DeepSeek Harness 的 JSONL 持久化会话存储后端"
  },
  "@deepseek-ai/dsh-session-projection": {
    "title": "会话投影",
    "description": "会话投影抽象层：可合并扩展的投影类型表、提供方契约，以及提供日志派生会话状态完整当前值的 ctx.sessionProjections 注册表"
  },
  "@deepseek-ai/dsh-session-projection-cache": {
    "title": "投影缓存",
    "description": "持久化投影缓存 (ctx.sessionProjectionCache)：session_projcache 存储域上的逐会话检查点记录、节流写回与缓存列表读取"
  },
  "@deepseek-ai/dsh-session-query-sqlite": {
    "title": "SQLite 查询",
    "description": "基于 SQLite FTS5 检索的具体 ctx.sessionQuery 后端"
  },
  "@deepseek-ai/dsh-session-reference": {
    "title": "会话引用",
    "description": "跨会话快照引用与持久化的非可信模型上下文 (ctx.sessionReferenceResolver)"
  },
  "@deepseek-ai/dsh-session-stats": {
    "title": "会话统计",
    "description": "DeepSeek Harness 的全日志对话计数与耗时投影 (sessionStats)"
  },
  "@deepseek-ai/dsh-session-telemetry-otel": {
    "title": "会话遥测",
    "description": "经反馈授权的 Session 日志，通过字节上限的 OpenTelemetry HTTP 请求上报"
  },
  "@deepseek-ai/dsh-session-title": {
    "title": "会话标题",
    "description": "DeepSeek Harness 由日志支撑的会话标题服务与提供方注册表"
  },
  "@deepseek-ai/dsh-session-title-first-prompt-llm": {
    "title": "首条消息命名",
    "description": "DeepSeek Harness 会话标题的首条消息 LLM 提供方插件"
  },
  "@deepseek-ai/dsh-session-turn-outline": {
    "title": "轮次大纲",
    "description": "DeepSeek Harness 的全日志轮次大纲投影 (turnOutline)"
  },
  "@deepseek-ai/dsh-settings": {
    "title": "设置抽象层",
    "description": "DeepSeek Harness 的用户设置抽象层 (ctx.settings)"
  },
  "@deepseek-ai/dsh-shell-env": {
    "title": "Shell 环境",
    "description": "与工具无关的托管 DSH_* shell 环境注册表"
  },
  "@deepseek-ai/dsh-skill": {
    "title": "技能注册表",
    "description": "DeepSeek Harness 的智能体技能提供方注册表"
  },
  "@deepseek-ai/dsh-skill-badge": {
    "title": "徽章技能",
    "description": "DeepSeek Harness 内置的 dsh 徽章技能提供方"
  },
  "@deepseek-ai/dsh-skill-filesystem": {
    "title": "文件系统技能",
    "description": "DeepSeek Harness 的本地文件系统技能提供方"
  },
  "@deepseek-ai/dsh-spill-local": {
    "title": "溢出存储",
    "description": "DeepSeek Harness 溢出存储抽象层的本地文件系统实现（会话私有文件）"
  },
  "@deepseek-ai/dsh-spill-policy": {
    "title": "溢出策略",
    "description": "按 token 预算保留工具结果，并提供可恢复的文本与图像路径"
  },
  "@deepseek-ai/dsh-storage": {
    "title": "存储中枢",
    "description": "存储中枢 (ctx.storage)：命名后端注册表与已挂载的数据形式设施"
  },
  "@deepseek-ai/dsh-storage-domain": {
    "title": "存储域",
    "description": "域数据形式 (ctx.storage.domain)：在存储后端之上经 schema 校验、可发事件的 KV 域"
  },
  "@deepseek-ai/dsh-storage-json": {
    "title": "JSON 存储",
    "description": "DeepSeek Harness 存储中枢的 JSON 文件 KV 存储后端"
  },
  "@deepseek-ai/dsh-subagent": {
    "title": "子智能体",
    "description": "抽象子智能体抽象层 (ctx.subagents)：用于委派子智能体的命名提供方注册表"
  },
  "@deepseek-ai/dsh-subagent-fork-in-process": {
    "title": "进程内派生",
    "description": "进程内派生型子智能体后端：运行以父级日志前缀为初始上下文的子智能体"
  },
  "@deepseek-ai/dsh-subagent-spawn-in-process": {
    "title": "进程内子智能体",
    "description": "进程内子智能体后端：在 ctx.agents 上启动一个全新的子智能体"
  },
  "@deepseek-ai/dsh-subprocess-local": {
    "title": "本地子进程",
    "description": "DeepSeek Harness 子进程抽象层的本地子进程实现"
  },
  "@deepseek-ai/dsh-system-prompt": {
    "title": "系统提示词",
    "description": "DeepSeek Harness 的系统提示词组装注册表"
  },
  "@deepseek-ai/dsh-token-meter": {
    "title": "Token 计量",
    "description": "可感知重放的 token 计量服务（ctx.tokenMeter），用于 DeepSeek Harness"
  },
  "@deepseek-ai/dsh-tool-bash": {
    "title": "Bash 工具",
    "description": "面向模型的 bash 工具，可选支持通用后台作业与沙箱提权"
  },
  "@deepseek-ai/dsh-tool-call-timeout-policy": {
    "title": "工具超时策略",
    "description": "工具调用超时策略：包装 tools/execute，在 exec.signal 上为每个工具设置截止时间，超时后返回 TOOL_TIMEOUT"
  },
  "@deepseek-ai/dsh-tool-fs": {
    "title": "文件系统工具",
    "description": "基于 DeepSeek Harness 文件系统抽象层（ctx.fs）的面向模型文件工具（read、write、edit）"
  },
  "@deepseek-ai/dsh-tool-fs-search": {
    "title": "文件检索工具",
    "description": "面向模型的文件发现工具（glob、grep），由内置的 ripgrep 二进制（@vscode/ripgrep）提供支持"
  },
  "@deepseek-ai/dsh-tool-goal": {
    "title": "目标工具",
    "description": "面向模型的同会话目标工具，带执行期权限校验"
  },
  "@deepseek-ai/dsh-tool-jobs": {
    "title": "作业控制工具",
    "description": "基于 ctx.jobs 注册表的面向模型后台作业控制工具（job_output、job_list、job_kill）"
  },
  "@deepseek-ai/dsh-tool-pwsh": {
    "title": "pwsh 工具",
    "description": "基于 bash 执行器抽象层的面向模型 pwsh 工具"
  },
  "@deepseek-ai/dsh-tool-ralph": {
    "title": "Ralph 循环",
    "description": "基于工作流与子智能体抽象层的面向模型全新智能体 Ralph 循环"
  },
  "@deepseek-ai/dsh-tool-skill": {
    "title": "技能加载",
    "description": "DeepSeek Harness 面向模型的技能加载工具"
  },
  "@deepseek-ai/dsh-tool-subagent": {
    "title": "子智能体委派",
    "description": "基于 ctx.subagents 抽象层的面向模型子智能体委派工具"
  },
  "@deepseek-ai/dsh-tool-subagent-control": {
    "title": "子智能体管控",
    "description": "基于 ctx.subagents 续接的全局命名 send_message、interrupt_agent 与 list_agents 工具"
  },
  "@deepseek-ai/dsh-tool-todo": {
    "title": "待办清单",
    "description": "基于 DeepSeek Harness 事件溯源会话日志的面向模型 todo_write 工具"
  },
  "@deepseek-ai/dsh-tool-web": {
    "title": "联网工具",
    "description": "基于 DeepSeek Harness Web 能力抽象层（ctx.web）的面向模型联网工具（web_search、web_fetch）"
  },
  "@deepseek-ai/dsh-tool-workflow": {
    "title": "工作流工具",
    "description": "面向模型的工作流工具：在 ctx.workflowEngine 上运行 JavaScript 编排脚本"
  },
  "@deepseek-ai/dsh-tools": {
    "title": "工具注册表",
    "description": "DeepSeek Harness 的工具注册表与执行流水线"
  },
  "@deepseek-ai/dsh-typert-loader": {
    "title": "Typert 加载",
    "description": "用于生成的 Typert 插件包贡献的 Loader 集成"
  },
  "@deepseek-ai/dsh-typert-registry": {
    "title": "Typert 注册表",
    "description": "用于生成的插件包反射与 Zod schema 的运行时注册表"
  },
  "@deepseek-ai/dsh-user-approval": {
    "title": "用户审批",
    "description": "DeepSeek Harness 的用户审批抽象层（ctx.approval）：在 approval/request 瀑布流上将一次性权限决策分发给组合应答方，默认失败即拒绝"
  },
  "@deepseek-ai/dsh-user-questions": {
    "title": "用户提问",
    "description": "抽象的用户提问抽象层（ctx.userQuestions），用于在智能体运行期间向人类提问"
  },
  "@deepseek-ai/dsh-web": {
    "title": "Web 能力层",
    "description": "DeepSeek Harness 的抽象 Web 访问能力层（ctx.web）：搜索/抓取提供方注册表、与注册顺序无关的选择、请求/结果词汇以及 WebError 分类"
  },
  "@deepseek-ai/dsh-web-app": {
    "title": "Web 界面包",
    "description": "dsh Web 界面插件包：dsh-base 之上的 Web 补丁层，加运行时粘合插件（前端 dist 服务、Web 界面提示词、bash 运行时变量、URL 行）"
  },
  "@deepseek-ai/dsh-web-fetch-http": {
    "title": "HTTP 抓取",
    "description": "DeepSeek Harness Web 能力抽象层（ctx.web）的匿名公共 HTTP(S) 抓取提供方"
  },
  "@deepseek-ai/dsh-web-search-deepseek": {
    "title": "联网搜索",
    "description": "DeepSeek Harness Web 能力抽象层（ctx.web）的 DeepSeek 搜索提供方，通过 Anthropic 兼容 API 原生调用 web_search"
  },
  "@deepseek-ai/dsh-workflow-ptc": {
    "title": "PTC 工作流",
    "description": "在共享的沙箱化 Node PTC 运行时中编排工作流"
  },
  "@deepseek-ai/dsh-workspace": {
    "title": "工作区注册表",
    "description": "工作区实体注册表（ctx.workspaceRegistry）：在领域数据表单之上为 DeepSeek Harness 提供带会话挂载校验的持久工作区记录"
  },
  "@deepseek-ai/dsh-workspace-changes": {
    "title": "工作区变更",
    "description": "按轮次记录的工作区文件变更，来自 git 工作树快照与整文件捕获，支持逐文件对比，用于 DeepSeek Harness"
  },
  "billion-context": {
    "title": "无限上下文",
    "description": "上下文压缩插件：100K 上下文即可够用，token 用量减少 5 倍，单会话可延续数月（数十亿 token），并兼顾压缩质量，兼容 pi、OpenCode、Codex、Claude Code 等智能体"
  },
  "cc-safety-net": {
    "title": "安全网",
    "description": "编码智能体的命令行钩子：拦截破坏性命令与密钥文件访问"
  },
  "dsh-browser": {
    "title": "浏览器自动化",
    "description": "DeepSeek Harness 的浏览器自动化：由 Playwright 驱动的 open/click/type/screenshot/eval 工具，让智能体操作真实网页"
  },
  "dsh-prompt-optimizer": {
    "title": "提示词优化",
    "description": "DSH 输入框 prompt 优化插件：一键把草稿润色为更清晰、更结构化的高质量 prompt，默认使用当前会话模型，支持 SSE 流式输出与自配 OpenAI 兼容 API"
  },
  "dsh-thinking-language": {
    "title": "思考语言",
    "description": "切换智能体思考与推理过程使用的语言，支持简体中文、繁體中文、English、Русский、Français、Deutsch、Español、العربية、Português、日本語"
  },
  "dsh-univer-office": {
    "title": "Univer 办公",
    "description": "DSH × Univer 集成，内置协作 Gateway 与 Viewer：在 DeepSeek Harness 中提供内联预览、浮动工作树窗口以及会话结束复核操作"
  }
};
