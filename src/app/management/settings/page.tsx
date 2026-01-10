"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState, useEffect } from "react";

const MODELS = [
    { id: "gpt-5-mini", label: "GPT-5 Mini (Default)" },
    { id: "gpt-5-nano", label: "GPT-5 Nano" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-5.2", label: "GPT-5.2" },
    { id: "gpt-5.2-thinking", label: "GPT-5.2 (Thinking/Reasoning)" },
];

export default function SettingsPage() {
    const user = useQuery(api.users.getViewer);
    const updateModel = useMutation(api.users.updatePreferredModel);
    const [selected, setSelected] = useState("gpt-5-mini");
    const [isSaving, setIsSaving] = useState(false);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (user?.preferredModel && !initialized) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelected(user.preferredModel);
            setInitialized(true);
        }
    }, [user, initialized]);

    const handleChange = async (val: string) => {
        setSelected(val);
        setIsSaving(true);
        await updateModel({ model: val });
        setTimeout(() => setIsSaving(false), 500);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-500">Manage your global preferences.</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-semibold mb-4">AI Model Preference</h2>
                <div className="max-w-md space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Default Model for Agent Interactions
                        </label>
                        <select
                            value={selected}
                            onChange={(e) => handleChange(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-black focus:border-black"
                        >
                            {MODELS.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                        </select>
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-gray-500">
                                &quot;Thinking&quot; models use medium reasoning effort but may be slower.
                            </p>
                            {isSaving && <span className="text-xs text-green-600 font-medium">Saved</span>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
