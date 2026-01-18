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
    const defaults = useQuery(api.management.getFreshnessDefaults);
    const setDefaults = useMutation(api.management.setFreshnessDefaults);
    const globalPrefs = useQuery(api.management.getProcurementPrefs, { key: "global" });
    const savePrefs = useMutation(api.management.setProcurementPrefs);
    const [selected, setSelected] = useState("gpt-5-mini");
    const [isSaving, setIsSaving] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [freshnessDays, setFreshnessDays] = useState("");
    const [preferredVendorIds, setPreferredVendorIds] = useState("");

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

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-semibold mb-2">Pricing Freshness Defaults</h2>
                <p className="text-sm text-gray-500 mb-4">
                    Default freshness window for price records when no per-category rule exists.
                </p>
                <div className="flex items-center gap-3">
                    <input
                        className="border rounded px-3 py-2 text-sm"
                        placeholder={String(defaults?.priceFreshnessDaysDefault ?? 30)}
                        value={freshnessDays}
                        onChange={(event) => setFreshnessDays(event.target.value)}
                    />
                    <button
                        onClick={async () => {
                            const value = Number(freshnessDays || defaults?.priceFreshnessDaysDefault || 30);
                            if (!Number.isFinite(value)) return;
                            await setDefaults({ priceFreshnessDaysDefault: value });
                            setFreshnessDays("");
                        }}
                        className="px-4 py-2 bg-black text-white rounded text-sm font-semibold"
                    >
                        Save Default
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-lg font-semibold mb-2">Procurement Preferences</h2>
                <p className="text-sm text-gray-500 mb-4">
                    Set global preferences (comma-separated vendor IDs).
                </p>
                <div className="space-y-3">
                    <input
                        className="border rounded px-3 py-2 text-sm w-full"
                        placeholder={String((globalPrefs?.value?.preferredVendors ?? []).join(", "))}
                        value={preferredVendorIds}
                        onChange={(event) => setPreferredVendorIds(event.target.value)}
                    />
                    <button
                        onClick={async () => {
                            const ids = preferredVendorIds
                                .split(",")
                                .map((id) => id.trim())
                                .filter(Boolean);
                            await savePrefs({ key: "global", value: { preferredVendors: ids } });
                            setPreferredVendorIds("");
                        }}
                        className="px-4 py-2 bg-black text-white rounded text-sm font-semibold"
                    >
                        Save Preferences
                    </button>
                </div>
            </div>
        </div>
    );
}
