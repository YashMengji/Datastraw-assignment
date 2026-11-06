import { useState } from "react";
import { AgentView } from "./components/AgentView";
import { CustomerView } from "./components/CustomerView";
import type { ViewMode } from "./types";

function ModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex rounded-full border border-emerald-900/10 bg-white/70 p-1 shadow-sm backdrop-blur">
      {(["customer", "agent"] as const).map((item) => (
        <button
          key={item}
          className={`rounded-full px-4 py-2 text-xs font-semibold capitalize transition sm:px-5 ${
            mode === item
              ? "bg-emerald-900 text-white shadow-sm"
              : "text-stone-500 hover:text-emerald-900"
          }`}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<ViewMode>("customer");

  return (
    <div className="min-h-screen bg-[#eef1e9] text-stone-900">
      <header className="border-b border-emerald-950/8 bg-[#f8f7f1]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-900 text-lg text-white shadow-md shadow-emerald-900/15">
              V
            </div>
            <div>
              <p className="font-semibold leading-tight text-emerald-950">
                Verdant & Co
              </p>
              <p className="text-[11px] text-stone-500">Support workspace</p>
            </div>
          </div>
          <ModeSwitch mode={mode} onChange={setMode} />
          <div className="hidden items-center gap-2 text-xs font-medium text-emerald-800 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
            Demo online
          </div>
        </div>
      </header>

      {mode === "customer" ? (
        <CustomerView />
      ) : (
        <AgentView />
      )}
    </div>
  );
}

