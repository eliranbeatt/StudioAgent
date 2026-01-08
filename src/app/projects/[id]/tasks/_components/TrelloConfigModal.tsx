import { useState, useEffect } from "react";
import { X, Save, RefreshCw, ExternalLink, Plus, Key, Lock, CheckCircle } from "lucide-react";

type TrelloConfig = {
  apiKey?: string;
  token?: string;
  boardId?: string;
  listMappings: Record<string, string>;
};

type TrelloBoard = { id: string; name: string; url: string };
type TrelloList = { id: string; name: string };

type TrelloConfigModalProps = {
  initialConfig?: TrelloConfig;
  onSave: (config: TrelloConfig) => Promise<void>;
  onClose: () => void;
  fetchBoards: (creds?: { apiKey: string, token: string }) => Promise<TrelloBoard[]>;
  fetchLists: (boardId: string, creds?: { apiKey: string, token: string }) => Promise<TrelloList[]>;
  onCreateBoard: (name: string, creds?: { apiKey: string, token: string }) => Promise<any>;
};

export function TrelloConfigModal({ 
    initialConfig, 
    onSave, 
    onClose, 
    fetchBoards, 
    fetchLists,
    onCreateBoard
}: TrelloConfigModalProps) {
  const [step, setStep] = useState<"creds" | "board" | "mapping">("creds");
  
  // State
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey ?? "");
  const [token, setToken] = useState(initialConfig?.token ?? "");
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string>(initialConfig?.boardId ?? "");
  const [mappings, setMappings] = useState<Record<string, string>>(initialConfig?.listMappings ?? {});
  
  const [newBoardName, setNewBoardName] = useState("");
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const STATUSES = ["todo", "in_progress", "blocked", "done"];

  // Skip creds if already valid? Maybe force check.
  useEffect(() => {
      if (initialConfig?.apiKey && initialConfig?.token) {
          // Verify
          verifyAndLoadBoards();
      }
  }, []);

  const getCreds = () => ({ apiKey, token });

  const verifyAndLoadBoards = async () => {
      setLoading(true);
      setError(null);
      try {
          const data = await fetchBoards(getCreds());
          setBoards(data);
          setStep("board");
      } catch (err: any) {
          setError("Connection failed. Check your API Key and Token.");
          setStep("creds");
      } finally {
          setLoading(false);
      }
  };

  const loadLists = async (boardId: string) => {
      setLoading(true);
      try {
          const data = await fetchLists(boardId, getCreds());
          setLists(data);
          setStep("mapping");
      } catch (err) {
          setError("Failed to load lists.");
      } finally {
          setLoading(false);
      }
  };

  const handleCreateBoard = async () => {
      if (!newBoardName.trim()) return;
      setIsCreatingBoard(true);
      try {
          const newBoard = await onCreateBoard(newBoardName, getCreds());
          setBoards(prev => [newBoard, ...prev]);
          setSelectedBoard(newBoard.id);
          setNewBoardName("");
          // Auto load lists
          await loadLists(newBoard.id);
      } catch (e: any) {
          setError("Failed to create board: " + e.message);
      } finally {
          setIsCreatingBoard(false);
      }
  };

  const handleSave = async () => {
      if (!selectedBoard) return;
      await onSave({
          apiKey,
          token,
          boardId: selectedBoard,
          listMappings: mappings
      });
      onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${step === "creds" ? "bg-red-400" : "bg-green-500"}`} />
             <h3 className="font-semibold text-gray-900">Trello Connection</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 flex items-start gap-2">
                    <div className="mt-0.5"><X size={14} /></div>
                    {error}
                </div>
            )}

            {step === "creds" && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        To connect, you need an API Key and Token from Trello.
                        <a href="https://trello.com/app-key" target="_blank" className="text-blue-600 underline ml-1">Get them here</a>.
                    </p>
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-1">API Key</label>
                        <div className="relative">
                            <Key size={14} className="absolute left-3 top-3 text-gray-400" />
                            <input 
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder="e.g. 384..."
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Token</label>
                        <div className="relative">
                            <Lock size={14} className="absolute left-3 top-3 text-gray-400" />
                            <input 
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                                value={token}
                                onChange={e => setToken(e.target.value)}
                                placeholder="e.g. ATTA..."
                                type="password"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button 
                            onClick={verifyAndLoadBoards}
                            disabled={loading || !apiKey || !token}
                            className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading ? "Connecting..." : "Test & Connect"}
                        </button>
                    </div>
                </div>
            )}

            {step === "board" && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle size={14} /> Connected
                        </span>
                        <button onClick={() => setStep("creds")} className="text-xs text-gray-400 hover:text-gray-600">
                            Edit Creds
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Board</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                            {boards.map(board => (
                                <button
                                    key={board.id}
                                    onClick={() => {
                                        setSelectedBoard(board.id);
                                        loadLists(board.id);
                                    }}
                                    className="w-full text-left px-3 py-2 rounded bg-white border border-gray-200 hover:border-blue-400 hover:shadow-sm flex justify-between items-center group transition"
                                >
                                    <span className="font-medium text-sm">{board.name}</span>
                                    <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-gray-400" />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-dashed">
                        <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Or Create New Board</label>
                        <div className="flex gap-2">
                            <input 
                                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                                placeholder="New Board Name"
                                value={newBoardName}
                                onChange={e => setNewBoardName(e.target.value)}
                            />
                            <button 
                                onClick={handleCreateBoard}
                                disabled={isCreatingBoard || !newBoardName}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                            >
                                <Plus size={16} /> Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {step === "mapping" && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                            Board: {boards.find(b => b.id === selectedBoard)?.name || selectedBoard}
                        </span>
                        <button onClick={() => setStep("board")} className="text-xs text-blue-600 hover:underline">
                            Change
                        </button>
                    </div>

                    <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Map Statuses to Lists</p>
                        {STATUSES.map(status => (
                            <div key={status} className="grid grid-cols-2 gap-4 items-center">
                                <div className="text-sm font-medium text-gray-700 capitalize">
                                    {status.replace("_", " ")}
                                </div>
                                <select 
                                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                                    value={mappings[status] || ""}
                                    onChange={(e) => setMappings({ ...mappings, [status]: e.target.value })}
                                >
                                    <option value="">-- Select List --</option>
                                    {lists.map(list => (
                                        <option key={list.id} value={list.id}>{list.name}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                Cancel
            </button>
            <button 
                onClick={handleSave}
                disabled={step !== "mapping" || loading}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
            >
                <Save size={16} />
                Save Config
            </button>
        </div>
      </div>
    </div>
  );
}