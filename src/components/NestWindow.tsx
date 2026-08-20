import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  RelationshipEvent,
  RelationshipSnapshot,
} from "../relationship/relationshipEngine";

const EMPTY: RelationshipSnapshot = {
  daysTogether: 1,
  consecutiveDays: 0,
  todayInteractions: 0,
  secretCount: 0,
  events: [],
  diaryDate: "",
  diary: [],
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

export function NestWindow() {
  const [snapshot, setSnapshot] = useState<RelationshipSnapshot>(EMPTY);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<RelationshipSnapshot>("relationship-snapshot", (event) => {
      setSnapshot(event.payload);
    }).then((cleanup) => {
      unlisten = cleanup;
      void emit("relationship-snapshot-request");
    });
    return () => unlisten?.();
  }, []);

  const hide = () => {
    void getCurrentWindow().hide().catch(() => undefined);
  };

  return (
    <main className="nest-window">
      <header className="nest-header">
        <div>
          <span className="nest-kicker">KITTY PET</span>
          <h1>我们的小窝</h1>
        </div>
        <button className="nest-close" onClick={hide} aria-label="关闭小窝">
          ✕
        </button>
      </header>

      <section className="nest-stats" aria-label="陪伴统计">
        <div className="nest-stat nest-stat-wide">
          <strong>{snapshot.daysTogether}</strong>
          <span>相识天数</span>
        </div>
        <div className="nest-stat">
          <strong>{snapshot.consecutiveDays}</strong>
          <span>连续陪伴</span>
        </div>
        <div className="nest-stat">
          <strong>{snapshot.todayInteractions}</strong>
          <span>今日互动</span>
        </div>
        <div className="nest-stat">
          <strong>{snapshot.secretCount}</strong>
          <span>发现秘密</span>
        </div>
      </section>

      <section className="nest-memories">
        <div className="nest-section-title">我们的回忆</div>
        {snapshot.events.length === 0 ? (
          <p className="nest-empty">再和 Kitty 相处一会儿，这里就会留下第一段回忆。</p>
        ) : (
          <div className="nest-timeline">
            {snapshot.events.map((event) => (
              <article className="nest-event" key={event.id}>
                <span className="nest-event-dot" />
                <div>
                  <strong>{EVENT_LABELS[event.type]}</strong>
                  <small>{formatEventDate(event)}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="nest-diary" aria-label="今天 Kitty 的一天">
        <div className="nest-section-title">今天 Kitty 的一天</div>
        <div className="nest-diary-card">
          <small>{snapshot.diaryDate || "今天"}</small>
          {(snapshot.diary.length > 0 ? snapshot.diary : ["再和 Kitty 相处一会儿，今天就会有新的故事啦。"]).map(
            (line) => <p key={line}>{line}</p>,
          )}
        </div>
      </section>

      <footer className="nest-footer">所有记录只保存在这台电脑上</footer>
    </main>
  );
}
