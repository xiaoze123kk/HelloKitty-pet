import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./global.css";

const PetApp = lazy(() =>
  import("./app/PetApp").then((module) => ({ default: module.PetApp })),
);
const NestWindow = lazy(() =>
  import("./components/NestWindow").then((module) => ({ default: module.NestWindow })),
);

function reportToRust(kind: string, message: string): void {
  try {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("log_frontend", { message: `[${kind}] ${message}` }).catch(
          () => undefined,
        ),
      )
      .catch(() => undefined);
  } catch {
    // 诊断通道本身绝不能再抛错
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    reportToRust(
      "window-error",
      `${event.message} @${event.filename}:${event.lineno}:${event.colno}`,
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      event.reason instanceof Error
        ? `${event.reason.message}\n${event.reason.stack ?? ""}`
        : String(event.reason);
    reportToRust("promise-rejection", reason);
  });
}

class PetErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportToRust("react-error", `${error.message}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#fff",
            color: "#c0392b",
            fontSize: 13,
            padding: 12,
            boxSizing: "border-box",
            overflow: "auto",
          }}
        >
          <strong>桌宠出错了：</strong>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root was not found.");
}

// 注意：不使用 StrictMode，避免开发模式双挂载导致启动次数/触发计时被重复执行
const isNestPreview =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("nest-preview");
let isNestWindow = isNestPreview;
if (!isNestPreview) {
  try {
    isNestWindow = getCurrentWindow().label === "nest";
  } catch {
    // 浏览器预览模式没有 Tauri 窗口元数据，默认渲染桌宠主界面。
  }
}

ReactDOM.createRoot(root).render(
  <PetErrorBoundary>
    <Suspense fallback={null}>
      {isNestWindow ? <NestWindow preview={isNestPreview} /> : <PetApp />}
    </Suspense>
  </PetErrorBoundary>,
);
