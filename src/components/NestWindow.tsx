import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  RelationshipEvent,
  RelationshipSnapshot,
} from "../relationship/relationshipEngine";
import { MEMORY_CATALOG } from "../relationship/relationshipEngine";

type NestTab = "today" | "memories" | "keepsakes";

const EMPTY: RelationshipSnapshot = {
  daysTogether: 1,
  consecutiveDays: 0,
  todayInteractions: 0,
  secretCount: 0,
  favoriteInteraction: "还在慢慢熟悉",
  mood: { label: "安静自在", detail: "正舒服地陪在你旁边", tone: "rose" },
  events: [],
  diaryDate: "",
  diary: [],
  weekly: {
    startDate: "",
    endDate: "",
    headline: "慢慢积攒的小日常",
    lines: [],
  },
  memories: [],
  keepsakes: [],
};

const PREVIEW_UNLOCKED = 7;
const PREVIEW: RelationshipSnapshot = {
  ...EMPTY,
  daysTogether: 36,
  consecutiveDays: 8,
  todayInteractions: 12,
  secretCount: PREVIEW_UNLOCKED,
  favoriteInteraction: "摸头",
  mood: { label: "有点想你", detail: "可能会偷偷看你几次", tone: "rose" },
  diaryDate: "2026-08-25",
  diary: ["今天见到了你。", "你今天摸了我 5 次头。", "我今天也会自己四处探索。"],
  weekly: {
    startDate: "2026-08-19",
    endDate: "2026-08-25",
    headline: "热热闹闹的一周",
    lines: ["这七天见面 7 次，留下 26 次互动。", "最常发生的是“摸头”，一共有 12 次。", "Kitty 最常自己玩耍，一共有 6 次。"],
  },
  memories: MEMORY_CATALOG.map((memory, index) => ({
    ...memory,
    unlocked: index < PREVIEW_UNLOCKED,
    unlockedAt: index < PREVIEW_UNLOCKED ? new Date(2026, 7, 25 - index).getTime() : null,
  })),
  keepsakes: MEMORY_CATALOG.slice(0, PREVIEW_UNLOCKED).map((memory, index) => ({
    ...memory.keepsake,
    unlockedAt: new Date(2026, 7, 25 - index).getTime(),
  })),
};

const EVENT_LABELS: Record<RelationshipEvent["type"], string> = {
  session_start: "今天见面了",
  headpat: "摸了摸头",
  body_touch: "戳了戳身体",
  bow_touch: "碰了碰蝴蝶结",
  petting: "认真撸了一会儿",
  drag: "一起换了个位置",
  tease: "玩了一次逗猫棒",
};

function formatEventDate(event: RelationshipEvent): string {
  const date = new Date(event.at);
  return `${event.date} · ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatUnlockDate(timestamp: number | null): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function NestWindow({ preview = false }: { preview?: boolean }) {
  const [snapshot, setSnapshot] = useState<RelationshipSnapshot>(preview ? PREVIEW : EMPTY);
  const [tab, setTab] = useState<NestTab>("today");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");

  useEffect(() => {
    if (preview) return;
    let unlistenSnapshot: (() => void) | undefined;
    let unlistenBackup: (() => void) | undefined;
    void Promise.all([
      listen<RelationshipSnapshot>("relationship-snapshot", (event) => {
        setSnapshot(event.payload);
      }).then((cleanup) => {
        unlistenSnapshot = cleanup;
        void emit("relationship-snapshot-request");
      }),
      listen<{ ok: boolean; message: string }>("data-backup-result", (event) => {
        setBackupBusy(false);
        setBackupMessage(event.payload.message);
      }).then((cleanup) => {
        unlistenBackup = cleanup;
      }),
    ]);
    return () => {
      unlistenSnapshot?.();
      unlistenBackup?.();
    };
  }, [preview]);

  const memories = useMemo(
    () => [...snapshot.memories].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)),
    [snapshot.memories],
  );

  const hide = () => {
    void getCurrentWindow().hide().catch(() => undefined);
  };

  const startWindowDrag = (event: PointerEvent<HTMLElement>) => {
    if (preview || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const requestBackup = (action: "create" | "restore") => {
    if (preview) {
      setBackupMessage("预览模式：运行安装版后可在这里创建本地备份。");
      return;
    }
    if (backupBusy) return;
    if (
      action === "restore" &&
      !window.confirm("恢复最近备份会替换当前关系与设置，继续吗？")
    ) {
      return;
    }
    setBackupBusy(true);
    setBackupMessage(action === "create" ? "正在创建备份…" : "正在恢复最近备份…");
    void emit("data-backup-request", action).catch((error) => {
      setBackupBusy(false);
      setBackupMessage(`操作失败：${String(error)}`);
    });
  };

  return (
    <main className="nest-window">
      <header className="nest-header" onPointerDown={startWindowDrag}>
        <div>
          <span className="nest-kicker">KITTY PET · v0.5</span>
          <h1>我们的小窝</h1>
        </div>
        <button className="nest-close" onClick={hide} aria-label="关闭小窝">
          ✕
        </button>
      </header>

      <nav className="nest-tabs" aria-label="小窝页面">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>今天</button>
        <button className={tab === "memories" ? "active" : ""} onClick={() => setTab("memories")}>秘密</button>
        <button className={tab === "keepsakes" ? "active" : ""} onClick={() => setTab("keepsakes")}>收藏</button>
      </nav>

      <div className="nest-content">
        {tab === "today" && (
          <>
            <section className={`nest-mood nest-mood-${snapshot.mood.tone}`}>
              <span>Kitty 现在</span>
              <strong>{snapshot.mood.label}</strong>
              <small>{snapshot.mood.detail}</small>
            </section>

            <section className="nest-stats" aria-label="陪伴统计">
              <div className="nest-stat"><strong>{snapshot.daysTogether}</strong><span>相识天数</span></div>
              <div className="nest-stat"><strong>{snapshot.consecutiveDays}</strong><span>连续陪伴</span></div>
              <div className="nest-stat"><strong>{snapshot.todayInteractions}</strong><span>今日互动</span></div>
              <div className="nest-stat"><strong>{snapshot.secretCount}</strong><span>发现秘密</span></div>
            </section>

            <section className="nest-summary-strip">
              <span>最熟悉的互动</span>
              <strong>{snapshot.favoriteInteraction}</strong>
            </section>

            <section className="nest-diary" aria-label="今天 Kitty 的一天">
              <div className="nest-section-title">今天 Kitty 的一天</div>
              <div className="nest-diary-card">
                <small>{snapshot.diaryDate || "今天"}</small>
                {(snapshot.diary.length > 0
                  ? snapshot.diary
                  : ["再和 Kitty 相处一会儿，今天就会有新的故事啦。"]
                ).map((line) => <p key={line}>{line}</p>)}
              </div>
            </section>

            <section className="nest-weekly">
              <div className="nest-section-title">最近七天</div>
              <article className="nest-weekly-card">
                <small>{snapshot.weekly.startDate} — {snapshot.weekly.endDate}</small>
                <strong>{snapshot.weekly.headline}</strong>
                {snapshot.weekly.lines.map((line) => <p key={line}>{line}</p>)}
              </article>
            </section>

            <section className="nest-recent">
              <div className="nest-section-title">最近回忆</div>
              {snapshot.events.length === 0 ? (
                <p className="nest-empty">再相处一会儿，这里就会留下第一段回忆。</p>
              ) : (
                <div className="nest-timeline">
                  {snapshot.events.slice(0, 8).map((event) => (
                    <article className="nest-event" key={event.id}>
                      <span className="nest-event-dot" />
                      <div><strong>{EVENT_LABELS[event.type]}</strong><small>{formatEventDate(event)}</small></div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "memories" && (
          <section className="nest-memory-page">
            <div className="nest-page-intro">
              <strong>{snapshot.secretCount} / {snapshot.memories.length} 个秘密</strong>
              <p>每段陪伴都会留下真实的日期，也会带回一件小小纪念物。</p>
            </div>
            <div className="nest-memory-grid">
              {memories.map((memory) => (
                <article className={`nest-memory-card ${memory.unlocked ? "unlocked" : "locked"}`} key={memory.id}>
                  <span className="nest-memory-icon">{memory.unlocked ? memory.keepsake.icon : "🔒"}</span>
                  <div>
                    <strong>{memory.unlocked ? memory.title : "尚未发现的秘密"}</strong>
                    <p>{memory.unlocked ? memory.description : memory.hint}</p>
                    {memory.unlockedAt && <small>{formatUnlockDate(memory.unlockedAt)} · 获得 {memory.keepsake.name}</small>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "keepsakes" && (
          <section className="nest-keepsake-page">
            <div className="nest-page-intro">
              <strong>小窝收藏</strong>
              <p>纪念物不会消耗，也不需要货币；它们只证明一起经历过的日子。</p>
            </div>
            {snapshot.keepsakes.length === 0 ? (
              <p className="nest-empty nest-empty-card">发现第一个秘密后，纪念物就会出现在这里。</p>
            ) : (
              <div className="nest-keepsake-grid">
                {snapshot.keepsakes.map((item) => (
                  <article className="nest-keepsake" key={item.id}>
                    <span>{item.icon}</span>
                    <strong>{item.name}</strong>
                    <p>{item.description}</p>
                    <small>{formatUnlockDate(item.unlockedAt)}</small>
                  </article>
                ))}
              </div>
            )}

            <section className="nest-data-card">
              <div>
                <strong>本地数据备份</strong>
                <p>保存关系、秘密、行为状态和设置。备份仍只留在这台电脑上。</p>
              </div>
              <div className="nest-data-actions">
                <button disabled={backupBusy} onClick={() => requestBackup("create")}>创建备份</button>
                <button disabled={backupBusy} onClick={() => requestBackup("restore")}>恢复最近备份</button>
              </div>
              {backupMessage && <small className="nest-backup-message">{backupMessage}</small>}
            </section>
          </section>
        )}
      </div>

      <footer className="nest-footer">所有记录只保存在这台电脑上</footer>
    </main>
  );
}
