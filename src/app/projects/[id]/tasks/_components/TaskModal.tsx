import { Task } from "./types";
import { useState, useEffect } from "react";
import { X, Save, MessageSquare, Sparkles } from "lucide-react";

type TaskModalProps = {
  task: Task;
  employees: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (patch: Partial<Task>) => Promise<void>;
  draftMode: boolean;
  isSaving: boolean;
};

export function TaskModal({ task, employees, onClose, onSave, draftMode, isSaving }: TaskModalProps) {
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant", content: string }>>([
    { role: "assistant", content: "Hi! I can help you edit this task. Try saying 'change status to blocked' or 'add a subtask'." }
  ]);
  
  // Reset state when task changes (pattern: derive state from props)
  const [prevTaskId, setPrevTaskId] = useState(task.id);
  if (task.id !== prevTaskId) {
    setFormData({});
    setHasChanges(false);
    setMessages([{ role: "assistant", content: "Hi! I can help you edit this task. Try saying 'change status to blocked' or 'add a subtask'." }]);
    setPrevTaskId(task.id);
  }

  const handleChange = (field: keyof Task, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // simple diff check could be here
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    await onSave(formData);
    setFormData({});
    setHasChanges(false);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");

    // Simulate AI processing
    setTimeout(() => {
      setMessages(prev => [...prev, { role: "assistant", content: `(Simulated) I processed: "${userMsg}". In the future, I will update the task fields directly!` }]);
    }, 1000);
  };

  // Merge task + formData for display
  const effectiveTask = { ...task, ...formData };
  const checklist = effectiveTask.checklist ?? [];
  const checklistDone = checklist.filter((item) => item.done).length;
  const checklistTotal = checklist.length;
  const selectedAssigneeId =
    effectiveTask.assigneeIds?.[0] ??
    employees.find((employee) => employee.name === effectiveTask.assignee)?.id ??
    "";

  const toggleChecklistItem = (itemId: string) => {
    const nextChecklist = checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    handleChange("checklist", nextChecklist);
  };

  const handleAssigneeChange = (nextId: string) => {
    const id = nextId || undefined;
    const name = id ? employees.find((emp) => emp.id === id)?.name : undefined;
    handleChange("assigneeIds", id ? [id] : []);
    handleChange("assignee", name);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 md:p-6 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs uppercase font-bold text-gray-400 tracking-wider flex items-center gap-2">
                {effectiveTask.elementTitle}
                {draftMode && <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Draft Mode</span>}
              </span>
              <input
                type="text"
                value={effectiveTask.title}
                onChange={(e) => handleChange("title", e.target.value)}
                className="text-xl font-bold text-gray-900 border-none focus:ring-0 p-0 hover:bg-gray-50 rounded transition"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${hasChanges
                  ? "bg-black text-white hover:bg-gray-800"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
            >
              <Save size={16} />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Form */}
          <div className={`flex-1 overflow-y-auto p-6 md:p-8 space-y-8 ${activeTab === "chat" ? "hidden md:block" : ""}`}>

            {/* Status / Meta Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <SelectField
                label="Status"
                value={effectiveTask.status ?? "todo"}
                options={["todo", "in_progress", "blocked", "done"]}
                onChange={(v) => handleChange("status", v)}
              />
              <SelectField
                label="Priority"
                value={effectiveTask.priority ?? "normal"}
                options={["low", "normal", "high", "critical"]}
                onChange={(v) => handleChange("priority", v)}
              />
              <InputField
                label="Category"
                value={effectiveTask.category ?? ""}
                onChange={(v) => handleChange("category", v)}
              />
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-bold text-gray-400 tracking-wider">Assignee</label>
                <select
                  value={selectedAssigneeId}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 bg-white appearance-none cursor-pointer hover:border-gray-300 transition"
                >
                  <option value="">Unassigned</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scheduling */}
            <div className="grid grid-cols-3 gap-6">
              <InputField
                label="Start Date"
                value={effectiveTask.startDate ?? ""}
                type="date"
                onChange={(v) => handleChange("startDate", v)}
              />
              <InputField
                label="End Date"
                value={effectiveTask.endDate ?? ""}
                type="date"
                onChange={(v) => handleChange("endDate", v)}
              />
              <InputField
                label="Duration (Min)"
                value={String(effectiveTask.estimatedMinutes ?? "")}
                type="number"
                onChange={(v) => handleChange("estimatedMinutes", parseInt(v) || 0)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs uppercase font-bold text-gray-400 tracking-wider">Description</label>
              <textarea
                className="w-full min-h-[120px] p-4 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 resize-y font-mono bg-gray-50/50"
                value={effectiveTask.description ?? ""}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Describe the task..."
              />
            </div>

            {/* Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase font-bold text-gray-400 tracking-wider">Checklist</label>
                {checklistTotal > 0 ? (
                  <span className="text-[10px] text-gray-400">
                    {checklistDone}/{checklistTotal} done
                  </span>
                ) : null}
              </div>
              {checklistTotal > 0 ? (
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: `${Math.round((checklistDone / checklistTotal) * 100)}%` }}
                  />
                </div>
              ) : null}
              {checklistTotal === 0 ? (
                <div className="text-sm text-gray-400 italic">No checklist items yet.</div>
              ) : (
                <div className="space-y-2">
                  {checklist.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleChecklistItem(item.id)}
                      />
                      <div>
                        <div className={`font-medium ${item.done ? "line-through text-gray-400" : ""}`}>
                          {item.title}
                        </div>
                        {item.description ? (
                          <div className="text-xs text-gray-400">{item.description}</div>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Debug / Raw Data */}
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer hover:text-gray-600">Dev Debug Info</summary>
              <pre className="mt-2 p-2 bg-gray-100 rounded overflow-x-auto">
                {JSON.stringify(effectiveTask, null, 2)}
              </pre>
            </details>

          </div>

          {/* Right Column: Chat */}
          <div className={`w-full md:w-[400px] border-l border-gray-100 bg-gray-50/50 flex flex-col ${activeTab === "details" ? "hidden md:flex" : "flex"}`}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-white/50 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Sparkles size={16} className="text-purple-500" />
                AI Assistant
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === "user"
                      ? "bg-black text-white rounded-br-none"
                      : "bg-white border border-gray-100 shadow-sm rounded-bl-none text-gray-700"
                    }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 bg-white">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Message AI..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  className="w-full pl-4 pr-10 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 shadow-sm"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                >
                  <MessageSquare size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="md:hidden flex border-t border-gray-100">
          <button
            onClick={() => setActiveTab("details")}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === "details" ? "text-black bg-gray-50" : "text-gray-500"}`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === "chat" ? "text-purple-600 bg-purple-50" : "text-gray-500"}`}
          >
            AI Chat
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string, value: string, options: string[], onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase font-bold text-gray-400 tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 bg-white appearance-none cursor-pointer hover:border-gray-300 transition"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt.replace("_", " ")}</option>
        ))}
      </select>
    </div>
  )
}

function InputField({ label, value, type = "text", onChange }: { label: string, value: string, type?: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase font-bold text-gray-400 tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 bg-white transition"
      />
    </div>
  )
}
