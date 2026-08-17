import ReactDOM from "react-dom/client";
import { PetApp } from "./app/PetApp";
import "./global.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root was not found.");
}

// 注意：不使用 StrictMode，避免开发模式双挂载导致启动次数/触发计时被重复执行
ReactDOM.createRoot(root).render(<PetApp />);
